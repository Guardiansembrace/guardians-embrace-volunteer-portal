"""
Users API endpoints.
Handles user profile management and admin operations.
"""

import logging
from typing import List, Optional
from datetime import timedelta

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.admin_access import (
    AdminAccessScope,
    build_user_response,
    build_user_responses,
    get_admin_access_context,
    require_admin_scopes,
)
from app.core.rate_limit import rate_limit_by_user
from app.core.security import get_current_user, has_operations_access
from app.core.time import utc_now
from app.core.user_stats import sync_user_submission_stats
from app.models.user import User, UserRole, UserResponse, UserUpdate, UserAdminUpdate, SetNameRequest

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user's profile."""
    try:
        await sync_user_submission_stats(current_user)
    except Exception:
        logger.warning("Failed to sync submission stats for %s", current_user.email, exc_info=True)
    return await build_user_response(current_user)


@router.patch(
    "/me",
    response_model=UserResponse,
    dependencies=[Depends(rate_limit_by_user("user_profile_writes"))],
)
async def update_current_user_profile(
    update: UserUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update the current user's profile (name, team)."""
    if update.name is not None:
        current_user.name = update.name
    if update.team is not None:
        current_user.team = update.team
    
    await current_user.save()
    
    return await build_user_response(current_user)


@router.post(
    "/me/set-name",
    response_model=UserResponse,
    dependencies=[Depends(rate_limit_by_user("user_profile_writes"))],
)
async def set_full_name(
    body: SetNameRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Set the user's full name after first Google OAuth login.
    Marks profile as complete. Can only be called once (rejects if already complete).
    """
    if current_user.profile_complete:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile is already complete. Use PATCH /users/me to update your name.",
        )

    name = body.full_name.strip()
    if len(name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name must be at least 2 characters.",
        )
    if len(name) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name must be 100 characters or less.",
        )

    current_user.name = name
    current_user.profile_complete = True
    current_user.updated_at = utc_now()
    await current_user.save()

    logger.info("Profile completed for %s", current_user.email)

    return await build_user_response(current_user)


@router.get("", response_model=List[UserResponse])
async def list_all_users(
    role: Optional[UserRole] = Query(None, description="Filter by role"),
    team: Optional[str] = Query(None, description="Filter by team"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """
    List all users for operational visibility and project assignment.
    Supports filtering by role, team, and active status.
    """
    if not has_operations_access(current_user):
        access = await get_admin_access_context(current_user)
        if not access.has_any_scope(
            AdminAccessScope.VIEW_USERS,
            AdminAccessScope.EDIT_USERS,
            AdminAccessScope.MANAGE_USER_STATUS,
            AdminAccessScope.MANAGE_USER_ROLES,
            AdminAccessScope.MANAGE_ADMIN_ACCESS,
            AdminAccessScope.MANAGE_PROJECTS,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin scope required",
            )

    query = {}
    if role is not None:
        query["role"] = role
    if team is not None:
        query["team"] = team
    if is_active is not None:
        query["is_active"] = is_active
    
    users = await User.find(query).skip(skip).limit(limit).to_list()
    
    return await build_user_responses(users)


@router.get("/stats/overview")
async def get_user_stats(current_user: User = Depends(require_admin_scopes(AdminAccessScope.VIEW_USERS))):
    """Get user statistics overview for operations staff."""
    total_users = await User.count()
    active_users = await User.find(User.is_active == True).count()
    inactive_users = await User.find(User.is_active == False).count()
    volunteers = await User.find(User.role == UserRole.VOLUNTEER).count()
    team_leads = await User.find(User.role == UserRole.TEAM_LEAD).count()
    admins = await User.find(User.role == UserRole.ADMIN).count()
    
    return {
        "total_users": total_users,
        "active_users": active_users,
        "inactive_users": inactive_users,
        "volunteers": volunteers,
        "team_leads": team_leads,
        "admins": admins,
    }


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: str,
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.VIEW_USERS))
):
    """Get a specific user by ID for operations staff."""
    from bson import ObjectId
    
    try:
        user = await User.get(ObjectId(user_id))
    except Exception:
        user = None
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return await build_user_response(user)


@router.patch(
    "/{user_id}",
    response_model=UserResponse,
    dependencies=[Depends(rate_limit_by_user("user_admin_writes"))],
)
async def admin_update_user(
    user_id: str,
    update: UserAdminUpdate,
    current_user: User = Depends(
        require_admin_scopes(
            AdminAccessScope.EDIT_USERS,
            AdminAccessScope.MANAGE_USER_STATUS,
            AdminAccessScope.MANAGE_USER_ROLES,
        )
    )
):
    """Update a user's profile with field-level delegated scope checks."""
    from bson import ObjectId
    
    try:
        user = await User.get(ObjectId(user_id))
    except Exception:
        user = None
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    access = await get_admin_access_context(current_user)
    requested_changes = update.model_dump(exclude_unset=True)

    if "name" in requested_changes or "team" in requested_changes:
        if not access.has_any_scope(AdminAccessScope.EDIT_USERS):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Edit users access required",
            )

    if "is_active" in requested_changes:
        if not access.has_any_scope(AdminAccessScope.MANAGE_USER_STATUS):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Manage user status access required",
            )
        if not access.is_admin and user.role == UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only full admins can activate or deactivate admin accounts",
            )

    if "role" in requested_changes:
        if not access.has_any_scope(AdminAccessScope.MANAGE_USER_ROLES):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Manage user roles access required",
            )
        if not access.is_admin and (user.role == UserRole.ADMIN or update.role == UserRole.ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only full admins can assign or modify the administrator role",
            )

    if update.name is not None:
        user.name = update.name
    if update.team is not None:
        user.team = update.team
    if update.role is not None:
        user.role = update.role
    if update.is_active is not None:
        user.is_active = update.is_active
    
    await user.save()
    
    return await build_user_response(user)
