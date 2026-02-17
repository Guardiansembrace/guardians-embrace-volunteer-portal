"""
Users API endpoints.
Handles user profile management and admin operations.
"""

import logging
from typing import List, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import get_current_user, get_current_admin_user
from app.models.user import User, UserRole, UserResponse, UserUpdate, UserAdminUpdate, SetNameRequest

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user's profile."""
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        picture=current_user.picture,
        role=current_user.role,
        team=current_user.team,
        is_active=current_user.is_active,
        total_hours=current_user.total_hours,
        total_submissions=current_user.total_submissions,
        submission_streak=current_user.submission_streak,
        profile_complete=current_user.profile_complete,
        file_access_expires=current_user.file_access_expires,
        created_at=current_user.created_at,
        last_login=current_user.last_login,
    )


@router.patch("/me", response_model=UserResponse)
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
    
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        picture=current_user.picture,
        role=current_user.role,
        team=current_user.team,
        is_active=current_user.is_active,
        total_hours=current_user.total_hours,
        total_submissions=current_user.total_submissions,
        submission_streak=current_user.submission_streak,
        profile_complete=current_user.profile_complete,
        file_access_expires=current_user.file_access_expires,
        created_at=current_user.created_at,
        last_login=current_user.last_login,
    )


@router.post("/me/set-name", response_model=UserResponse)
async def set_full_name(
    body: SetNameRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Set the user's full name after first Google OAuth login.
    Marks profile as complete. Can only be called once (rejects if already complete).
    """
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
    current_user.updated_at = datetime.utcnow()
    await current_user.save()

    logger.info("Profile completed for %s", current_user.email)

    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        picture=current_user.picture,
        role=current_user.role,
        team=current_user.team,
        is_active=current_user.is_active,
        total_hours=current_user.total_hours,
        total_submissions=current_user.total_submissions,
        submission_streak=current_user.submission_streak,
        profile_complete=current_user.profile_complete,
        file_access_expires=current_user.file_access_expires,
        created_at=current_user.created_at,
        last_login=current_user.last_login,
    )


@router.get("", response_model=List[UserResponse])
async def list_all_users(
    role: Optional[UserRole] = Query(None, description="Filter by role"),
    team: Optional[str] = Query(None, description="Filter by team"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_admin_user)
):
    """
    List all users (admin only).
    Supports filtering by role, team, and active status.
    """
    query = {}
    if role is not None:
        query["role"] = role
    if team is not None:
        query["team"] = team
    if is_active is not None:
        query["is_active"] = is_active
    
    users = await User.find(query).skip(skip).limit(limit).to_list()
    
    return [
        UserResponse(
            id=str(u.id),
            email=u.email,
            name=u.name,
            picture=u.picture,
            role=u.role,
            team=u.team,
            is_active=u.is_active,
            total_hours=u.total_hours,
            total_submissions=u.total_submissions,
            submission_streak=u.submission_streak,
            created_at=u.created_at,
            last_login=u.last_login,
            profile_complete=u.profile_complete,
            file_access_expires=u.file_access_expires,
        )
        for u in users
    ]


@router.get("/stats/overview")
async def get_user_stats(current_user: User = Depends(get_current_admin_user)):
    """Get user statistics overview (admin only)."""
    total_users = await User.count()
    active_users = await User.find(User.is_active == True).count()
    inactive_users = await User.find(User.is_active == False).count()
    volunteers = await User.find(User.role == UserRole.VOLUNTEER).count()
    admins = await User.find(User.role == UserRole.ADMIN).count()
    
    return {
        "total_users": total_users,
        "active_users": active_users,
        "inactive_users": inactive_users,
        "volunteers": volunteers,
        "admins": admins,
    }


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: str,
    current_user: User = Depends(get_current_admin_user)
):
    """Get a specific user by ID (admin only)."""
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
    
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        picture=user.picture,
        role=user.role,
        team=user.team,
        is_active=user.is_active,
        total_hours=user.total_hours,
        total_submissions=user.total_submissions,
        submission_streak=user.submission_streak,
        created_at=user.created_at,
        last_login=user.last_login,
        profile_complete=user.profile_complete,
        file_access_expires=user.file_access_expires,
    )


@router.patch("/{user_id}", response_model=UserResponse)
async def admin_update_user(
    user_id: str,
    update: UserAdminUpdate,
    current_user: User = Depends(get_current_admin_user)
):
    """Update a user's profile (admin only). Can change role and active status."""
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
    
    if update.name is not None:
        user.name = update.name
    if update.team is not None:
        user.team = update.team
    if update.role is not None:
        user.role = update.role
    if update.is_active is not None:
        user.is_active = update.is_active
    
    await user.save()
    
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        picture=user.picture,
        role=user.role,
        team=user.team,
        is_active=user.is_active,
        total_hours=user.total_hours,
        total_submissions=user.total_submissions,
        submission_streak=user.submission_streak,
        created_at=user.created_at,
        last_login=user.last_login,
        profile_complete=user.profile_complete,
        file_access_expires=user.file_access_expires,
    )
