from typing import List

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.projects import _get_project_or_404
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
from app.core.security import get_current_user
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
    return ProjectWorkItemResponse(
        id=str(work_item.id),
        project_id=str(work_item.project_id),
        title=work_item.title,
        description=work_item.description,
        item_type=work_item.item_type,
        status=work_item.status,
        priority=work_item.priority,
        assignee_id=str(work_item.assignee_id) if work_item.assignee_id else None,
        assignee_name=work_item.assignee_name,
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


async def _get_work_item_or_404(project_id: str, work_item_id: str) -> ProjectWorkItem:
    try:
        item_object_id = PydanticObjectId(work_item_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Work item not found") from exc

    work_item = await ProjectWorkItem.get(item_object_id)
    if not work_item or str(work_item.project_id) != project_id:
        raise HTTPException(status_code=404, detail="Work item not found")

    return work_item


async def _resolve_assignee(
    project: Project,
    assignee_id: str | None,
) -> User | None:
    if not assignee_id:
        return None

    try:
        assignee_object_id = PydanticObjectId(assignee_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Assignee user not found") from exc

    assignee = await User.get(assignee_object_id)
    if not assignee:
        raise HTTPException(status_code=404, detail="Assignee user not found")

    if not assignee.is_active:
        raise HTTPException(status_code=400, detail="Assignee must be active")

    if not is_project_team_member(project, assignee):
        raise HTTPException(
            status_code=400,
            detail="Assignee must be part of the project team",
        )

    return assignee


def _can_edit_work_item(project: Project, work_item: ProjectWorkItem, current_user: User) -> bool:
    return can_edit_project_work_item(project, work_item, current_user)


def _can_delete_work_item(project: Project, work_item: ProjectWorkItem, current_user: User) -> bool:
    return can_delete_project_work_item(project, work_item, current_user)


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
    if not can_contribute_to_project(project, current_user):
        raise HTTPException(status_code=403, detail="Project contribution access required")

    requested_assignee_id = work_item_in.assignee_id
    if requested_assignee_id and not can_assign_project_work(project, current_user):
        raise HTTPException(status_code=403, detail="Project assignment access required")
    if not requested_assignee_id and not can_manage_project_work(project, current_user):
        requested_assignee_id = str(current_user.id)

    assignee = await _resolve_assignee(project, requested_assignee_id)
    now = utc_now()
    work_item = ProjectWorkItem(
        project_id=project.id,
        title=work_item_in.title,
        description=work_item_in.description,
        item_type=work_item_in.item_type,
        status=work_item_in.status,
        priority=work_item_in.priority,
        assignee_id=assignee.id if assignee else None,
        assignee_name=assignee.name if assignee else None,
        created_by_id=current_user.id,
        created_by_name=current_user.name,
        updated_by_id=current_user.id,
        updated_by_name=current_user.name,
        due_date=work_item_in.due_date,
        created_at=now,
        updated_at=now,
    )
    await work_item.create()
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

    update_data = work_item_in.model_dump(exclude_unset=True, exclude={"assignee_id"})
    requested_assignee_id = (
        str(work_item_in.assignee_id)
        if "assignee_id" in work_item_in.model_fields_set and work_item_in.assignee_id
        else None
    )
    is_self_claim = requested_assignee_id == str(current_user.id)

    if not _can_edit_work_item(project, work_item, current_user):
        if not (
            is_self_claim
            and not update_data
            and can_claim_project_work_item(project, current_user)
        ):
            raise HTTPException(status_code=403, detail="Work item edit access required")

    if "assignee_id" in work_item_in.model_fields_set:
        current_assignee_id = str(work_item.assignee_id) if work_item.assignee_id else None

        if requested_assignee_id != current_assignee_id:
            if not is_self_claim and not can_assign_project_work(project, current_user):
                raise HTTPException(status_code=403, detail="Project assignment access required")
            assignee = await _resolve_assignee(project, work_item_in.assignee_id)
            work_item.assignee_id = assignee.id if assignee else None
            work_item.assignee_name = assignee.name if assignee else None

    for field_name, field_value in update_data.items():
        setattr(work_item, field_name, field_value)

    work_item.updated_by_id = current_user.id
    work_item.updated_by_name = current_user.name
    work_item.updated_at = utc_now()
    await work_item.save()

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

    if not _can_delete_work_item(project, work_item, current_user):
        raise HTTPException(status_code=403, detail="Work item delete access required")

    await work_item.delete()
    return None
