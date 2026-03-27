from typing import List

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.projects import _get_project_or_404
from app.core.project_access import (
    can_manage_project_work,
    can_request_project_access,
    is_project_team_member,
)
from app.core.rate_limit import rate_limit_by_user
from app.core.security import get_current_user
from app.core.time import utc_now
from app.models.project import Project
from app.models.project_join_request import (
    ProjectJoinRequest,
    ProjectJoinRequestCreate,
    ProjectJoinRequestResponse,
    ProjectJoinRequestReview,
    ProjectJoinRequestStatus,
)
from app.models.user import User

router = APIRouter(prefix="/projects", tags=["project-join-requests"])


def _serialize_join_request(join_request: ProjectJoinRequest) -> ProjectJoinRequestResponse:
    return ProjectJoinRequestResponse(
        id=str(join_request.id),
        project_id=str(join_request.project_id),
        user_id=str(join_request.user_id),
        user_email=join_request.user_email,
        user_name=join_request.user_name,
        message=join_request.message,
        status=join_request.status,
        requested_at=join_request.requested_at,
        reviewed_at=join_request.reviewed_at,
        reviewed_by_id=str(join_request.reviewed_by_id) if join_request.reviewed_by_id else None,
        reviewed_by_name=join_request.reviewed_by_name,
    )


async def _get_join_request_or_404(project_id: str, join_request_id: str) -> ProjectJoinRequest:
    try:
        join_request_object_id = PydanticObjectId(join_request_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Join request not found") from exc

    join_request = await ProjectJoinRequest.get(join_request_object_id)
    if not join_request or str(join_request.project_id) != project_id:
        raise HTTPException(status_code=404, detail="Join request not found")

    return join_request


@router.get("/{project_id}/join-requests", response_model=List[ProjectJoinRequestResponse])
async def list_project_join_requests(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """List join requests for managers or the current user's own requests otherwise."""
    project = await _get_project_or_404(project_id, fetch_links=True)
    if can_manage_project_work(project, current_user):
        join_requests = await ProjectJoinRequest.find(ProjectJoinRequest.project_id == project.id).to_list()
    else:
        join_requests = await ProjectJoinRequest.find(
            ProjectJoinRequest.project_id == project.id,
            ProjectJoinRequest.user_id == current_user.id,
        ).to_list()

    join_requests.sort(key=lambda join_request: join_request.requested_at, reverse=True)
    return [_serialize_join_request(join_request) for join_request in join_requests]


@router.post(
    "/{project_id}/join-requests",
    response_model=ProjectJoinRequestResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_by_user("project_join_request_writes"))],
)
async def create_project_join_request(
    project_id: str,
    join_request_in: ProjectJoinRequestCreate,
    current_user: User = Depends(get_current_user),
):
    """Request to join a project as a working member."""
    project = await _get_project_or_404(project_id, fetch_links=True)
    if not can_request_project_access(project, current_user):
        raise HTTPException(status_code=400, detail="You already have project access")

    existing_request = await ProjectJoinRequest.find_one(
        ProjectJoinRequest.project_id == project.id,
        ProjectJoinRequest.user_id == current_user.id,
        ProjectJoinRequest.status == ProjectJoinRequestStatus.PENDING,
    )
    if existing_request:
        raise HTTPException(status_code=400, detail="You already have a pending join request")

    join_request = ProjectJoinRequest(
        project_id=project.id,
        user_id=current_user.id,
        user_email=current_user.email,
        user_name=current_user.name,
        message=join_request_in.message,
        status=ProjectJoinRequestStatus.PENDING,
        requested_at=utc_now(),
    )
    await join_request.create()
    return _serialize_join_request(join_request)


@router.patch(
    "/{project_id}/join-requests/{join_request_id}",
    response_model=ProjectJoinRequestResponse,
    dependencies=[Depends(rate_limit_by_user("project_join_request_writes"))],
)
async def review_project_join_request(
    project_id: str,
    join_request_id: str,
    review_in: ProjectJoinRequestReview,
    current_user: User = Depends(get_current_user),
):
    """Approve or decline a join request."""
    project = await _get_project_or_404(project_id, fetch_links=True)
    if not can_manage_project_work(project, current_user):
        raise HTTPException(status_code=403, detail="Project management access required")

    join_request = await _get_join_request_or_404(project_id, join_request_id)
    if join_request.status != ProjectJoinRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Join request has already been reviewed")

    if review_in.status == ProjectJoinRequestStatus.APPROVED:
        user = await User.get(join_request.user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Requested user not found")
        if not user.is_active:
            raise HTTPException(status_code=400, detail="Requested user must be active")
        if not is_project_team_member(project, user):
            project.members.append(user)
            await project.save()

    join_request.status = review_in.status
    join_request.reviewed_at = utc_now()
    join_request.reviewed_by_id = current_user.id
    join_request.reviewed_by_name = current_user.name
    await join_request.save()

    return _serialize_join_request(join_request)
