from typing import List

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.projects import _delete_project_with_related_records, _get_project_or_404
from app.core.admin_access import AdminAccessScope, get_admin_access_context
from app.core.project_access import (
    can_manage_project_work,
    can_request_project_access,
    is_project_lead,
    is_project_member,
    is_project_team_member,
)
from app.core.rate_limit import rate_limit_by_user
from app.core.security import get_current_user, has_operations_access
from app.core.time import utc_now
from app.models.project import Project
from app.models.project_join_request import (
    ProjectJoinRequest,
    ProjectJoinRequestCreate,
    ProjectJoinRequestResponse,
    ProjectJoinRequestReview,
    ProjectJoinRequestStatus,
    ProjectJoinRequestType,
)
from app.models.user import User

router = APIRouter(prefix="/projects", tags=["project-join-requests"])


async def _has_project_management_access(current_user: User) -> bool:
    access = await get_admin_access_context(current_user)
    return access.has_any_scope(AdminAccessScope.MANAGE_PROJECTS)


def _has_direct_delete_access(current_user: User, has_project_management_access: bool) -> bool:
    return has_operations_access(current_user) or has_project_management_access


def _serialize_join_request(join_request: ProjectJoinRequest) -> ProjectJoinRequestResponse:
    return ProjectJoinRequestResponse(
        id=str(join_request.id),
        project_id=str(join_request.project_id),
        user_id=str(join_request.user_id),
        user_email=join_request.user_email,
        user_name=join_request.user_name,
        request_type=join_request.request_type,
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
    has_project_management_access = await _has_project_management_access(current_user)
    if can_manage_project_work(project, current_user, operations_override=has_project_management_access):
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
    """Request project access, leadership, or deletion."""
    project = await _get_project_or_404(project_id, fetch_links=True)
    has_project_management_access = await _has_project_management_access(current_user)
    if join_request_in.request_type == ProjectJoinRequestType.ACCESS:
        if not can_request_project_access(project, current_user, operations_override=has_project_management_access):
            raise HTTPException(status_code=400, detail="You already have project access")
        duplicate_detail = "You already have a pending join request"
    elif join_request_in.request_type == ProjectJoinRequestType.LEAD:
        if can_manage_project_work(project, current_user, operations_override=has_project_management_access):
            raise HTTPException(status_code=400, detail="You already manage this project")
        duplicate_detail = "You already have a pending leadership request"
    else:
        if _has_direct_delete_access(current_user, has_project_management_access):
            raise HTTPException(status_code=400, detail="You can delete this project directly")
        duplicate_detail = "You already have a pending delete request"

    existing_request = await ProjectJoinRequest.find_one(
        ProjectJoinRequest.project_id == project.id,
        ProjectJoinRequest.user_id == current_user.id,
        ProjectJoinRequest.request_type == join_request_in.request_type,
        ProjectJoinRequest.status == ProjectJoinRequestStatus.PENDING,
    )
    if existing_request:
        raise HTTPException(status_code=400, detail=duplicate_detail)

    join_request = ProjectJoinRequest(
        project_id=project.id,
        user_id=current_user.id,
        user_email=current_user.email,
        user_name=current_user.name,
        request_type=join_request_in.request_type,
        message=join_request_in.message,
        status=ProjectJoinRequestStatus.PENDING,
        requested_at=utc_now(),
    )
    await join_request.create()

    # Notify project lead and admins of the new request
    from app.core.notifications import notify_join_request_received
    from app.models.user import UserRole

    recipients: list[User] = []
    try:
        if project.lead:
            lead = project.lead if isinstance(project.lead, User) else await User.get(project.lead.ref.id)
            if lead and lead.is_active and str(lead.id) != str(current_user.id):
                recipients.append(lead)

        admins = await User.find(User.role == UserRole.ADMIN, User.is_active == True).to_list()
        seen_ids = {str(r.id) for r in recipients}
        for admin in admins:
            if str(admin.id) not in seen_ids and str(admin.id) != str(current_user.id):
                recipients.append(admin)
    except Exception:
        import logging
        logging.getLogger(__name__).warning("Failed to build join_request_received recipient list", exc_info=True)

    for recipient in recipients:
        try:
            await notify_join_request_received(
                admin_user_id=str(recipient.id),
                admin_name=recipient.name,
                admin_email=recipient.email,
                requester_name=current_user.name,
                project_name=project.name,
                project_id=str(project.id),
                request_type=join_request_in.request_type.value,
                join_request_id=str(join_request.id),
                notif_pref=recipient.notif_join_request_received,
            )
        except Exception:
            import logging
            logging.getLogger(__name__).warning(
                "Failed to send join_request_received notification to %s", recipient.id, exc_info=True
            )

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
    """Approve or decline a project request."""
    project = await _get_project_or_404(project_id, fetch_links=True)
    has_project_management_access = await _has_project_management_access(current_user)
    join_request = await _get_join_request_or_404(project_id, join_request_id)
    # Project leads and operations users can review every request type for their
    # board, including deletion requests (approving one deletes the project).
    if not can_manage_project_work(project, current_user, operations_override=has_project_management_access):
        raise HTTPException(status_code=403, detail="Project management access required")

    if join_request.status != ProjectJoinRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Join request has already been reviewed")

    join_request.status = review_in.status
    join_request.reviewed_at = utc_now()
    join_request.reviewed_by_id = current_user.id
    join_request.reviewed_by_name = current_user.name

    if review_in.status == ProjectJoinRequestStatus.APPROVED:
        if join_request.request_type == ProjectJoinRequestType.DELETE:
            await join_request.save()
            await _delete_project_with_related_records(project)
            return _serialize_join_request(join_request)

        user = await User.get(join_request.user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Requested user not found")
        if not user.is_active:
            raise HTTPException(status_code=400, detail="Requested user must be active")
        project_changed = False

        if join_request.request_type == ProjectJoinRequestType.LEAD:
            if project.lead and not is_project_member(project, project.lead):
                project.members.append(project.lead)
                project_changed = True

            if not is_project_member(project, user):
                project.members.append(user)
                project_changed = True

            if not is_project_lead(project, user):
                project.lead = user
                project_changed = True

        elif not is_project_team_member(project, user):
            project.members.append(user)
            project_changed = True

        if project_changed:
            await project.save()

    await join_request.save()

    # Notify the requester of the decision. Approved deletion requests return
    # earlier (the project is gone), so this covers access/lead reviews and any
    # declined request, including declined deletion requests.
    try:
        requester = await User.get(join_request.user_id)
        if requester:
            from app.core.notifications import notify_join_request_reviewed
            await notify_join_request_reviewed(
                requester_user_id=str(join_request.user_id),
                requester_name=requester.name,
                requester_email=requester.email,
                project_name=project.name,
                project_id=str(project.id),
                approved=review_in.status == ProjectJoinRequestStatus.APPROVED,
                notif_pref=requester.notif_join_request_reviewed,
                request_type=join_request.request_type.value,
            )
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "Failed to send join_request_reviewed notification for %s", join_request_id, exc_info=True
        )

    return _serialize_join_request(join_request)
