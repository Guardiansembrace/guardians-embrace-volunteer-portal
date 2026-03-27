from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from beanie import PydanticObjectId

from app.core.project_access import can_manage_project_work, can_view_project, normalize_project_tags
from app.core.rate_limit import rate_limit_by_user
from app.core.security import get_current_operations, get_current_user, has_operations_access
from app.models.user import User
from app.models.project import (
    Project,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
    ProjectUserSummary,
)

router = APIRouter(prefix="/projects", tags=["projects"])


def _serialize_project_user(user: User) -> ProjectUserSummary:
    """Convert a linked user doc into the lightweight project response shape."""
    return ProjectUserSummary(
        id=str(user.id),
        email=user.email,
        name=user.name,
        picture=user.picture,
        role=user.role,
        team=user.team,
    )


def _serialize_project(project: Project) -> ProjectResponse:
    """Convert a project document into the API response shape."""
    lead = _serialize_project_user(project.lead) if project.lead else None
    members = [_serialize_project_user(member) for member in project.members]

    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        description=project.description,
        status=project.status,
        tags=project.tags,
        banner_image=project.banner_image,
        lead=lead,
        members=members,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


async def _get_project_or_404(project_id: str, *, fetch_links: bool = False) -> Project:
    """Load a project by ID or raise a 404."""
    project = await Project.get(PydanticObjectId(project_id), fetch_links=fetch_links)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=List[ProjectResponse])
async def get_projects(
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Get all projects.
    """
    query = Project.find(fetch_links=True)
    if status:
        query = query.find(Project.status == status, fetch_links=True)
    
    projects = await query.to_list()
    accessible_projects = [
        project for project in projects if can_view_project(project, current_user)
    ]

    return [_serialize_project(project) for project in accessible_projects]


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_by_user("project_writes"))],
)
async def create_project(
    project_in: ProjectCreate,
    current_admin: User = Depends(get_current_operations)
):
    """
    Create a new project (operations or admin).
    """
    project_data = project_in.model_dump(exclude={"lead_id", "member_ids"})
    project_data["tags"] = normalize_project_tags(project_data.get("tags"))
    project = Project(**project_data)
    
    if project_in.lead_id:
        leader = await User.get(PydanticObjectId(project_in.lead_id))
        if not leader:
            raise HTTPException(status_code=404, detail="Leader user not found")
        project.lead = leader
        
    if project_in.member_ids:
        members = []
        for uid in project_in.member_ids:
            user = await User.get(PydanticObjectId(uid))
            if user:
                members.append(user)
        project.members = members
        
    await project.create()
    created_project = await Project.get(project.id, fetch_links=True)
    return _serialize_project(created_project)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get a specific project by ID.
    """
    project = await _get_project_or_404(project_id, fetch_links=True)
    if not can_view_project(project, current_user):
        raise HTTPException(status_code=403, detail="Project access required")
    return _serialize_project(project)


@router.patch(
    "/{project_id}",
    response_model=ProjectResponse,
    dependencies=[Depends(rate_limit_by_user("project_writes"))],
)
async def update_project(
    project_id: str,
    project_in: ProjectUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Update a project. Operations can update all project fields; project leads can update tags.
    """
    project = await _get_project_or_404(project_id)
    requested_fields = set(project_in.model_dump(exclude_unset=True).keys())
    can_manage_all_project_fields = has_operations_access(current_user)

    if not can_manage_all_project_fields and not can_manage_project_work(project, current_user):
        raise HTTPException(status_code=403, detail="Project edit access required")

    if not can_manage_all_project_fields:
        disallowed_fields = requested_fields - {"tags"}
        if disallowed_fields:
            raise HTTPException(
                status_code=403,
                detail="Project leads can only update project tags",
            )

    update_data = project_in.model_dump(exclude_unset=True, exclude={"lead_id", "member_ids"})
    if "tags" in update_data:
        update_data["tags"] = normalize_project_tags(update_data.get("tags"))
    
    if project_in.lead_id is not None:
        leader = await User.get(PydanticObjectId(project_in.lead_id))
        if not leader:
            raise HTTPException(status_code=404, detail="Leader user not found")
        project.lead = leader
        
    if project_in.member_ids is not None:
        members = []
        for uid in project_in.member_ids:
            user = await User.get(PydanticObjectId(uid))
            if user:
                members.append(user)
        project.members = members
        
    await project.update({"$set": update_data})

    refreshed_project = await Project.get(project.id, fetch_links=True)
    return _serialize_project(refreshed_project)


@router.post(
    "/{project_id}/members/{user_id}",
    response_model=ProjectResponse,
    dependencies=[Depends(rate_limit_by_user("project_member_writes"))],
)
async def add_member(
    project_id: str,
    user_id: str,
    current_admin: User = Depends(get_current_operations)
):
    """
    Add a member to a project (operations or admin).
    """
    project = await _get_project_or_404(project_id, fetch_links=True)
        
    user = await User.get(PydanticObjectId(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Check if already a member
    # Beanie links comparison might need ID check
    if any(m.id == user.id for m in project.members if m):
        raise HTTPException(status_code=400, detail="User already in project")
        
    project.members.append(user)
    await project.save()

    refreshed_project = await Project.get(project.id, fetch_links=True)
    return _serialize_project(refreshed_project)


@router.delete(
    "/{project_id}/members/{user_id}",
    response_model=ProjectResponse,
    dependencies=[Depends(rate_limit_by_user("project_member_writes"))],
)
async def remove_member(
    project_id: str,
    user_id: str,
    current_admin: User = Depends(get_current_operations)
):
    """
    Remove a member from a project (operations or admin).
    """
    project = await _get_project_or_404(project_id, fetch_links=True)
    
    # Filter out the user
    # Note: Beanie links might not be fully fetched, so we check IDs
    project.members = [m for m in project.members if str(m.id) != user_id]
    await project.save()

    refreshed_project = await Project.get(project.id, fetch_links=True)
    return _serialize_project(refreshed_project)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit_by_user("project_writes"))],
)
async def delete_project(
    project_id: str,
    current_admin: User = Depends(get_current_operations)
):
    """
    Delete a project (operations or admin).
    """
    from app.models.project_work_item import ProjectWorkItem
    from app.models.project_join_request import ProjectJoinRequest

    project = await _get_project_or_404(project_id)
        
    await ProjectWorkItem.find(ProjectWorkItem.project_id == project.id).delete()
    await ProjectJoinRequest.find(ProjectJoinRequest.project_id == project.id).delete()
    await project.delete()
    return None
