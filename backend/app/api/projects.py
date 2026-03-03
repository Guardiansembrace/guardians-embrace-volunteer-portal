from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from beanie import PydanticObjectId

from app.core.security import get_current_user, get_current_admin
from app.models.user import User, UserRole
from app.models.project import Project, ProjectCreate, ProjectUpdate, ProjectResponse

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=List[ProjectResponse])
async def get_projects(
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Get all projects.
    """
    query = Project.find()
    if status:
        query = query.find(Project.status == status)
    
    projects = await query.to_list()
    
    # Fetch linked documents (lead and members)
    for project in projects:
        if project.lead:
            await project.lead.fetch()
        
        # Fetch members - safely iterate
        # We need to access the list to trigger fetch if it's a Link
        if project.members:
             # Just accessing them one by one ensures Beanie fetches them if they are Links
             for i in range(len(project.members)):
                 if hasattr(project.members[i], 'fetch'):
                     await project.members[i].fetch()

    return projects


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_in: ProjectCreate,
    current_admin: User = Depends(get_current_admin)
):
    """
    Create a new project (Admin only).
    """
    project_data = project_in.model_dump(exclude={"lead_id", "member_ids"})
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
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get a specific project by ID.
    """
    project = await Project.get(PydanticObjectId(project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if project.lead:
        await project.lead.fetch()
    for member in project.members:
        await member.fetch()
        
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    project_in: ProjectUpdate,
    current_admin: User = Depends(get_current_admin)
):
    """
    Update a project (Admin only).
    """
    project = await Project.get(PydanticObjectId(project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    update_data = project_in.model_dump(exclude_unset=True, exclude={"lead_id", "member_ids"})
    
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
    
    # Re-fetch to get updated relationships
    if project.lead:
        await project.lead.fetch()
    for member in project.members:
        await member.fetch()
        
    return project


@router.post("/{project_id}/members/{user_id}", response_model=ProjectResponse)
async def add_member(
    project_id: str,
    user_id: str,
    current_admin: User = Depends(get_current_admin)
):
    """
    Add a member to a project (Admin only).
    """
    project = await Project.get(PydanticObjectId(project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    user = await User.get(PydanticObjectId(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Check if already a member
    # Beanie links comparison might need ID check
    if any(m.id == user.id for m in project.members if m):
        raise HTTPException(status_code=400, detail="User already in project")
        
    project.members.append(user)
    await project.save()
    
    if project.lead:
        await project.lead.fetch()
    for member in project.members:
        await member.fetch()
        
    return project


@router.delete("/{project_id}/members/{user_id}", response_model=ProjectResponse)
async def remove_member(
    project_id: str,
    user_id: str,
    current_admin: User = Depends(get_current_admin)
):
    """
    Remove a member from a project (Admin only).
    """
    project = await Project.get(PydanticObjectId(project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Filter out the user
    # Note: Beanie links might not be fully fetched, so we check IDs
    project.members = [m for m in project.members if str(m.id) != user_id]
    await project.save()
    
    if project.lead:
        await project.lead.fetch()
    for member in project.members:
        await member.fetch()
        
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_admin: User = Depends(get_current_admin)
):
    """
    Delete a project (Admin only).
    """
    project = await Project.get(PydanticObjectId(project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    await project.delete()
    return None
