import logging
from typing import List

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from app.api.projects import _get_project_or_404
from app.core.admin_access import AdminAccessScope, get_admin_access_context
from app.core.project_access import (
    can_assign_project_work,
    can_claim_project_work_item,
    can_contribute_to_project,
    can_delete_project_work_item,
    can_edit_project_work_item,
    can_manage_project_work,
    can_view_project,
    is_project_team_member,
)
from app.core.rate_limit import rate_limit_by_user
from app.core.security import get_current_user, has_operations_access
from app.core.time import utc_now
from app.models.project import Project
from app.models.project_work_item import (
    ActivityEntry,
    ProjectWorkItem,
    ProjectWorkItemCreate,
    ProjectWorkItemResponse,
    ProjectWorkItemUpdate,
    WorkItemStatus,
)
from app.models.user import User

router = APIRouter(prefix="/projects", tags=["project-work-items"])

STATUS_SORT_ORDER = {
    WorkItemStatus.PENDING: 0,
    WorkItemStatus.ACTIVE: 1,
    WorkItemStatus.BLOCKED: 2,
    WorkItemStatus.FINISHED: 3,
}


def _serialize_work_item(work_item: ProjectWorkItem) -> ProjectWorkItemResponse:
    assignee_ids = [str(assignee_id) for assignee_id in (getattr(work_item, "assignee_ids", None) or [])]
    assignee_names = list(getattr(work_item, "assignee_names", None) or [])

    if not assignee_ids and getattr(work_item, "assignee_id", None):
        assignee_ids = [str(work_item.assignee_id)]
    if not assignee_names and getattr(work_item, "assignee_name", None):
        assignee_names = [str(work_item.assignee_name)]

    return ProjectWorkItemResponse(
        id=str(work_item.id),
        project_id=str(work_item.project_id),
        title=work_item.title,
        description=work_item.description,
        item_type=work_item.item_type,
        status=work_item.status,
        priority=work_item.priority,
        assignee_id=assignee_ids[0] if assignee_ids else None,
        assignee_name=assignee_names[0] if assignee_names else None,
        assignee_ids=assignee_ids,
        assignee_names=assignee_names,
        checklist=list(getattr(work_item, "checklist", None) or []),
        activity_log=list(getattr(work_item, "activity_log", None) or []),
        watcher_ids=list(getattr(work_item, "watcher_ids", None) or []),
        blocked_by_ids=list(getattr(work_item, "blocked_by_ids", None) or []),
        created_by_id=str(work_item.created_by_id),
        created_by_name=work_item.created_by_name,
        updated_by_id=str(work_item.updated_by_id),
        updated_by_name=work_item.updated_by_name,
        due_date=work_item.due_date,
        created_at=work_item.created_at,
        updated_at=work_item.updated_at,
    )


async def _get_project_with_access(project_id: str, current_user: User) -> Project:
    project = await _get_project_or_404(project_id, fetch_links=True)
    if not can_view_project(project, current_user):
        raise HTTPException(status_code=403, detail="Project access required")
    return project


async def _has_project_management_access(current_user: User) -> bool:
    access = await get_admin_access_context(current_user)
    return access.has_any_scope(AdminAccessScope.MANAGE_PROJECTS)


async def _get_work_item_or_404(project_id: str, work_item_id: str) -> ProjectWorkItem:
    try:
        item_object_id = PydanticObjectId(work_item_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Work item not found") from exc

    work_item = await ProjectWorkItem.get(item_object_id)
    if not work_item or str(work_item.project_id) != project_id:
        raise HTTPException(status_code=404, detail="Work item not found")

    return work_item


def _requested_assignee_ids_for_create(work_item_in: ProjectWorkItemCreate) -> list[str]:
    if work_item_in.assignee_ids is not None:
        return list(work_item_in.assignee_ids)
    if work_item_in.assignee_id:
        return [str(work_item_in.assignee_id)]
    return []


def _requested_assignee_ids_for_update(work_item_in: ProjectWorkItemUpdate) -> tuple[bool, list[str]]:
    if "assignee_ids" in work_item_in.model_fields_set:
        return True, list(work_item_in.assignee_ids or [])
    if "assignee_id" in work_item_in.model_fields_set:
        return True, [str(work_item_in.assignee_id)] if work_item_in.assignee_id else []
    return False, []


def _current_assignee_ids(work_item: ProjectWorkItem) -> list[str]:
    assignee_ids = [str(assignee_id) for assignee_id in (getattr(work_item, "assignee_ids", None) or [])]
    if not assignee_ids and getattr(work_item, "assignee_id", None):
        assignee_ids = [str(work_item.assignee_id)]
    return assignee_ids


async def _resolve_assignees(
    project: Project,
    assignee_ids: list[str],
) -> list[User]:
    assignees: list[User] = []

    for assignee_id in assignee_ids:
        try:
            assignee_object_id = PydanticObjectId(assignee_id)
        except Exception as exc:
            raise HTTPException(status_code=404, detail="Assignee user not found") from exc

        assignee = await User.get(assignee_object_id)
        if not assignee:
            raise HTTPException(status_code=404, detail="Assignee user not found")

        if not assignee.is_active:
            raise HTTPException(status_code=400, detail="Assignee must be active")

        if not is_project_team_member(project, assignee) and not has_operations_access(assignee):
            raise HTTPException(
                status_code=400,
                detail="Assignee must be part of the project team",
            )

        assignees.append(assignee)

    return assignees


def _apply_assignees(work_item: ProjectWorkItem, assignees: list[User]) -> None:
    work_item.assignee_ids = [assignee.id for assignee in assignees]
    work_item.assignee_names = [assignee.name for assignee in assignees]
    work_item.assignee_id = assignees[0].id if assignees else None
    work_item.assignee_name = assignees[0].name if assignees else None


def _build_activity_entries(
    work_item: ProjectWorkItem,
    update_data: dict,
    old_assignee_names: list[str],
    new_assignee_names: list[str],
    current_user: User,
) -> list[ActivityEntry]:
    entries = []
    now = utc_now()

    field_labels = {
        "title": "title",
        "description": "description",
        "item_type": "type",
        "due_date": "due date",
    }

    for field, new_val in update_data.items():
        old_val = getattr(work_item, field, None)
        if field == "status" and old_val != new_val:
            entries.append(ActivityEntry(
                user_id=str(current_user.id),
                user_name=current_user.name,
                action=f"Changed status from {old_val} to {new_val}",
                created_at=now,
            ))
        elif field == "priority" and old_val != new_val:
            entries.append(ActivityEntry(
                user_id=str(current_user.id),
                user_name=current_user.name,
                action=f"Changed priority from {old_val} to {new_val}",
                created_at=now,
            ))
        elif field == "due_date" and old_val != new_val:
            if new_val:
                entries.append(ActivityEntry(
                    user_id=str(current_user.id),
                    user_name=current_user.name,
                    action=f"Set due date to {new_val.strftime('%b %d, %Y') if hasattr(new_val, 'strftime') else new_val}",
                    created_at=now,
                ))
            else:
                entries.append(ActivityEntry(
                    user_id=str(current_user.id),
                    user_name=current_user.name,
                    action="Removed due date",
                    created_at=now,
                ))
        elif field in field_labels and old_val != new_val:
            entries.append(ActivityEntry(
                user_id=str(current_user.id),
                user_name=current_user.name,
                action=f"Updated {field_labels[field]}",
                created_at=now,
            ))

    old_set = set(old_assignee_names)
    new_set = set(new_assignee_names)
    added = new_set - old_set
    removed = old_set - new_set
    if added:
        entries.append(ActivityEntry(
            user_id=str(current_user.id),
            user_name=current_user.name,
            action=f"Assigned {', '.join(sorted(added))}",
            created_at=now,
        ))
    if removed:
        entries.append(ActivityEntry(
            user_id=str(current_user.id),
            user_name=current_user.name,
            action=f"Unassigned {', '.join(sorted(removed))}",
            created_at=now,
        ))

    return entries


def _can_edit_work_item(
    project: Project,
    work_item: ProjectWorkItem,
    current_user: User,
    *,
    operations_override: bool = False,
) -> bool:
    return can_edit_project_work_item(
        project,
        work_item,
        current_user,
        operations_override=operations_override,
    )


def _can_delete_work_item(
    project: Project,
    work_item: ProjectWorkItem,
    current_user: User,
    *,
    operations_override: bool = False,
) -> bool:
    return can_delete_project_work_item(
        project,
        work_item,
        current_user,
        operations_override=operations_override,
    )


@router.get("/{project_id}/work-items/my-assigned", response_model=List[ProjectWorkItemResponse])
async def list_my_assigned_work_items(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """Return the current user's non-finished assigned work items for a project.

    Used by the submission form to surface suggested work entries.
    """
    project = await _get_project_with_access(project_id, current_user)
    user_id = current_user.id

    all_items = await ProjectWorkItem.find(ProjectWorkItem.project_id == project.id).to_list()

    assigned = [
        item for item in all_items
        if item.status != WorkItemStatus.FINISHED
        and (
            (item.assignee_id and str(item.assignee_id) == str(user_id))
            or any(str(aid) == str(user_id) for aid in (item.assignee_ids or []))
        )
    ]
    assigned.sort(key=lambda item: STATUS_SORT_ORDER[item.status])
    return [_serialize_work_item(item) for item in assigned]


@router.get("/{project_id}/work-items", response_model=List[ProjectWorkItemResponse])
async def list_project_work_items(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """List work items for a project board."""
    project = await _get_project_with_access(project_id, current_user)

    work_items = await ProjectWorkItem.find(ProjectWorkItem.project_id == project.id).to_list()
    work_items.sort(key=lambda item: item.updated_at, reverse=True)
    work_items.sort(key=lambda item: STATUS_SORT_ORDER[item.status])

    return [_serialize_work_item(work_item) for work_item in work_items]


@router.post(
    "/{project_id}/work-items",
    response_model=ProjectWorkItemResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_by_user("project_work_writes"))],
)
async def create_project_work_item(
    project_id: str,
    work_item_in: ProjectWorkItemCreate,
    current_user: User = Depends(get_current_user),
):
    """Create a work item inside a project."""
    project = await _get_project_with_access(project_id, current_user)
    has_project_management_access = await _has_project_management_access(current_user)
    if not can_contribute_to_project(project, current_user, operations_override=has_project_management_access):
        raise HTTPException(status_code=403, detail="Project contribution access required")

    requested_assignee_ids = _requested_assignee_ids_for_create(work_item_in)
    logger.info("Work item create: project=%s title=%r raw_assignee_ids=%s", project_id, work_item_in.title, requested_assignee_ids)
    if requested_assignee_ids and not can_assign_project_work(project, current_user, operations_override=has_project_management_access):
        raise HTTPException(status_code=403, detail="Project assignment access required")
    if not requested_assignee_ids and not can_manage_project_work(project, current_user, operations_override=has_project_management_access):
        requested_assignee_ids = [str(current_user.id)]

    assignees = await _resolve_assignees(project, requested_assignee_ids)
    logger.info("Work item create: resolved %d assignee(s): %s", len(assignees), [str(a.id) for a in assignees])
    now = utc_now()
    work_item = ProjectWorkItem(
        project_id=project.id,
        title=work_item_in.title,
        description=work_item_in.description,
        item_type=work_item_in.item_type,
        status=work_item_in.status,
        priority=work_item_in.priority,
        created_by_id=current_user.id,
        created_by_name=current_user.name,
        updated_by_id=current_user.id,
        updated_by_name=current_user.name,
        due_date=work_item_in.due_date,
        checklist=list(work_item_in.checklist or []),
        blocked_by_ids=list(work_item_in.blocked_by_ids or []),
        created_at=now,
        updated_at=now,
    )
    _apply_assignees(work_item, assignees)
    await work_item.create()

    # Notify assignees (skip if they assigned themselves)
    from app.core.notifications import notify_work_item_assigned
    for assignee in assignees:
        if str(assignee.id) != str(current_user.id):
            try:
                await notify_work_item_assigned(
                    user_id=str(assignee.id),
                    user_name=assignee.name,
                    user_email=assignee.email,
                    work_item_title=work_item_in.title,
                    project_name=project.name,
                    project_id=project_id,
                    assigned_by_name=current_user.name,
                    notif_pref=assignee.notif_project_activity,
                )
            except Exception:
                logger.warning("Failed to send work_item_assigned notification to %s", assignee.id, exc_info=True)

    return _serialize_work_item(work_item)


@router.patch(
    "/{project_id}/work-items/{work_item_id}",
    response_model=ProjectWorkItemResponse,
    dependencies=[Depends(rate_limit_by_user("project_work_writes"))],
)
async def update_project_work_item(
    project_id: str,
    work_item_id: str,
    work_item_in: ProjectWorkItemUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update an existing project work item."""
    project = await _get_project_with_access(project_id, current_user)
    work_item = await _get_work_item_or_404(project_id, work_item_id)
    has_project_management_access = await _has_project_management_access(current_user)

    update_data = work_item_in.model_dump(exclude_unset=True, exclude={"assignee_id", "assignee_ids"})
    has_assignee_update, requested_assignee_ids = _requested_assignee_ids_for_update(work_item_in)
    current_assignee_ids = _current_assignee_ids(work_item)
    is_self_join = (
        has_assignee_update
        and not update_data
        and str(current_user.id) in requested_assignee_ids
        and set(requested_assignee_ids) == (set(current_assignee_ids) | {str(current_user.id)})
    )

    if not _can_edit_work_item(
        project,
        work_item,
        current_user,
        operations_override=has_project_management_access,
    ):
        if not (
            is_self_join
            and not update_data
            and can_claim_project_work_item(
                project,
                current_user,
                operations_override=has_project_management_access,
            )
        ):
            raise HTTPException(status_code=403, detail="Work item edit access required")

    old_assignee_names = list(getattr(work_item, "assignee_names", None) or [])
    old_status = work_item.status

    newly_assigned_users: list = []
    if has_assignee_update:
        if requested_assignee_ids != current_assignee_ids:
            if not is_self_join and not can_assign_project_work(
                project,
                current_user,
                operations_override=has_project_management_access,
            ):
                raise HTTPException(status_code=403, detail="Project assignment access required")
            assignees = await _resolve_assignees(project, requested_assignee_ids)
            _apply_assignees(work_item, assignees)
            newly_assigned_users = [
                a for a in assignees
                if str(a.id) not in current_assignee_ids and str(a.id) != str(current_user.id)
            ]

    _LIST_FIELDS = {"assignee_ids", "assignee_names", "checklist", "activity_log", "watcher_ids", "blocked_by_ids"}
    for field_name, field_value in update_data.items():
        if field_name in _LIST_FIELDS and field_value is None:
            field_value = []
        setattr(work_item, field_name, field_value)

    new_assignee_names = list(getattr(work_item, "assignee_names", None) or [])
    new_entries = _build_activity_entries(
        work_item,
        {k: v for k, v in update_data.items() if k != "checklist"},
        old_assignee_names,
        new_assignee_names,
        current_user,
    )
    if new_entries:
        existing_log = list(getattr(work_item, "activity_log", None) or [])
        work_item.activity_log = existing_log + new_entries

    work_item.updated_by_id = current_user.id
    work_item.updated_by_name = current_user.name
    work_item.updated_at = utc_now()
    await work_item.save()

    if newly_assigned_users:
        from app.core.notifications import notify_work_item_assigned
        for assignee in newly_assigned_users:
            try:
                await notify_work_item_assigned(
                    user_id=str(assignee.id),
                    user_name=assignee.name,
                    user_email=assignee.email,
                    work_item_title=work_item.title,
                    project_name=project.name,
                    project_id=project_id,
                    assigned_by_name=current_user.name,
                    notif_pref=assignee.notif_project_activity,
                )
            except Exception:
                logger.warning("Failed to send work_item_assigned notification to %s", assignee.id, exc_info=True)

    # Notify watchers when status changes
    status_changed = "status" in update_data and old_status != work_item.status
    if status_changed:
        watcher_ids = list(getattr(work_item, "watcher_ids", None) or [])
        watchers_to_notify = [w for w in watcher_ids if w != str(current_user.id)]
        if watchers_to_notify:
            from app.core.notifications import notify_work_item_status_changed
            for watcher_id in watchers_to_notify:
                try:
                    watcher = await User.get(PydanticObjectId(watcher_id))
                    if watcher:
                        await notify_work_item_status_changed(
                            user_id=watcher_id,
                            user_name=watcher.name,
                            user_email=watcher.email,
                            work_item_title=work_item.title,
                            project_name=project.name,
                            project_id=project_id,
                            new_status=str(work_item.status),
                            changed_by_name=current_user.name,
                            notif_pref=watcher.notif_project_activity,
                        )
                except Exception:
                    logger.warning("Failed to send watcher status notification to %s", watcher_id, exc_info=True)

    return _serialize_work_item(work_item)


@router.delete(
    "/{project_id}/work-items/{work_item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit_by_user("project_work_writes"))],
)
async def delete_project_work_item(
    project_id: str,
    work_item_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a project work item."""
    project = await _get_project_with_access(project_id, current_user)
    work_item = await _get_work_item_or_404(project_id, work_item_id)
    has_project_management_access = await _has_project_management_access(current_user)

    if not _can_delete_work_item(
        project,
        work_item,
        current_user,
        operations_override=has_project_management_access,
    ):
        raise HTTPException(status_code=403, detail="Work item delete access required")

    await work_item.delete()
    return None


@router.post(
    "/{project_id}/work-items/{work_item_id}/watch",
    response_model=ProjectWorkItemResponse,
)
async def watch_work_item(
    project_id: str,
    work_item_id: str,
    current_user: User = Depends(get_current_user),
):
    """Add the current user as a watcher of this work item."""
    await _get_project_with_access(project_id, current_user)
    work_item = await _get_work_item_or_404(project_id, work_item_id)
    user_id_str = str(current_user.id)
    watcher_ids = list(getattr(work_item, "watcher_ids", None) or [])
    if user_id_str not in watcher_ids:
        watcher_ids.append(user_id_str)
        work_item.watcher_ids = watcher_ids
        await work_item.save()
    return _serialize_work_item(work_item)


@router.delete(
    "/{project_id}/work-items/{work_item_id}/watch",
    response_model=ProjectWorkItemResponse,
)
async def unwatch_work_item(
    project_id: str,
    work_item_id: str,
    current_user: User = Depends(get_current_user),
):
    """Remove the current user from watchers of this work item."""
    await _get_project_with_access(project_id, current_user)
    work_item = await _get_work_item_or_404(project_id, work_item_id)
    user_id_str = str(current_user.id)
    watcher_ids = list(getattr(work_item, "watcher_ids", None) or [])
    if user_id_str in watcher_ids:
        work_item.watcher_ids = [w for w in watcher_ids if w != user_id_str]
        await work_item.save()
    return _serialize_work_item(work_item)


class MoveWorkItemRequest(BaseModel):
    target_project_id: str


@router.post(
    "/{project_id}/work-items/{work_item_id}/move",
    response_model=ProjectWorkItemResponse,
    dependencies=[Depends(rate_limit_by_user("project_work_writes"))],
)
async def move_work_item(
    project_id: str,
    work_item_id: str,
    body: MoveWorkItemRequest,
    current_user: User = Depends(get_current_user),
):
    """Move a work item to a different project. Requires management access on both projects."""
    project = await _get_project_with_access(project_id, current_user)
    work_item = await _get_work_item_or_404(project_id, work_item_id)
    has_project_management_access = await _has_project_management_access(current_user)

    if not can_manage_project_work(project, current_user, operations_override=has_project_management_access):
        raise HTTPException(status_code=403, detail="Project management access required")

    target_project = await _get_project_or_404(body.target_project_id, fetch_links=True)
    if not can_view_project(target_project, current_user):
        raise HTTPException(status_code=403, detail="Target project access required")
    if not can_manage_project_work(target_project, current_user, operations_override=has_project_management_access):
        raise HTTPException(status_code=403, detail="Management access required on target project")

    work_item.project_id = target_project.id
    work_item.updated_by_id = current_user.id
    work_item.updated_by_name = current_user.name
    work_item.updated_at = utc_now()
    await work_item.save()
    return _serialize_work_item(work_item)
