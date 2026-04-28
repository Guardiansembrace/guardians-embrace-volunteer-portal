from typing import List

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status

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
    if requested_assignee_ids and not can_assign_project_work(project, current_user, operations_override=has_project_management_access):
        raise HTTPException(status_code=403, detail="Project assignment access required")
    if not requested_assignee_ids and not can_manage_project_work(project, current_user, operations_override=has_project_management_access):
        requested_assignee_ids = [str(current_user.id)]

    assignees = await _resolve_assignees(project, requested_assignee_ids)
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
        created_at=now,
        updated_at=now,
    )
    _apply_assignees(work_item, assignees)
    await work_item.create()

    # Notify assignees (skip if they assigned themselves)
    try:
        from app.core.notifications import notify_work_item_assigned
        import asyncio
        for assignee in assignees:
            if str(assignee.id) != str(current_user.id):
                asyncio.create_task(notify_work_item_assigned(
                    user_id=str(assignee.id),
                    user_name=assignee.name,
                    user_email=assignee.email,
                    work_item_title=work_item_in.title,
                    project_name=project.name,
                    project_id=project_id,
                    assigned_by_name=current_user.name,
                    notif_pref=assignee.notif_project_activity,
                ))
    except Exception:
        import logging
        logging.getLogger(__name__).warning("Failed to queue work_item_assigned notification", exc_info=True)

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

    for field_name, field_value in update_data.items():
        setattr(work_item, field_name, field_value)

    work_item.updated_by_id = current_user.id
    work_item.updated_by_name = current_user.name
    work_item.updated_at = utc_now()
    await work_item.save()

    if newly_assigned_users:
        try:
            from app.core.notifications import notify_work_item_assigned
            import asyncio
            for assignee in newly_assigned_users:
                asyncio.create_task(notify_work_item_assigned(
                    user_id=str(assignee.id),
                    user_name=assignee.name,
                    user_email=assignee.email,
                    work_item_title=work_item.title,
                    project_name=project.name,
                    project_id=project_id,
                    assigned_by_name=current_user.name,
                    notif_pref=assignee.notif_project_activity,
                ))
        except Exception:
            import logging
            logging.getLogger(__name__).warning("Failed to queue work_item_assigned notification on update", exc_info=True)

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
