from dataclasses import dataclass
from typing import Iterable, List, Optional

from beanie.exceptions import CollectionWasNotInitialized
from fastapi import Depends, HTTPException, status

from app.core.time import utc_now
from app.core.security import get_current_user
from app.models.admin_access import (
    AdminAccessGrant,
    AdminAccessScope,
)
from app.models.user import AdminAccessSummary, User, UserResponse, UserRole


ADMIN_SCOPE_ORDER = [
    AdminAccessScope.VIEW_USERS,
    AdminAccessScope.EDIT_USERS,
    AdminAccessScope.MANAGE_USER_STATUS,
    AdminAccessScope.MANAGE_USER_ROLES,
    AdminAccessScope.REVIEW_SUBMISSIONS,
    AdminAccessScope.SEND_REMINDERS,
    AdminAccessScope.MANAGE_INVITES,
    AdminAccessScope.MANAGE_PROJECTS,
    AdminAccessScope.MANAGE_SETTINGS,
    AdminAccessScope.VIEW_AUDIT_LOGS,
    AdminAccessScope.VIEW_ADMIN_ACCESS,
    AdminAccessScope.MANAGE_ADMIN_ACCESS,
]


def normalize_admin_scopes(scopes: Iterable[AdminAccessScope | str]) -> List[AdminAccessScope]:
    normalized = {AdminAccessScope(scope) for scope in scopes}
    if AdminAccessScope.MANAGE_USERS in normalized:
        normalized.discard(AdminAccessScope.MANAGE_USERS)
        normalized.add(AdminAccessScope.EDIT_USERS)
        normalized.add(AdminAccessScope.MANAGE_USER_STATUS)
    if normalized.intersection({
        AdminAccessScope.EDIT_USERS,
        AdminAccessScope.MANAGE_USER_STATUS,
        AdminAccessScope.MANAGE_USER_ROLES,
    }):
        normalized.add(AdminAccessScope.VIEW_USERS)
    if AdminAccessScope.MANAGE_ADMIN_ACCESS in normalized:
        normalized.add(AdminAccessScope.VIEW_ADMIN_ACCESS)
    return [scope for scope in ADMIN_SCOPE_ORDER if scope in normalized]


@dataclass
class AdminAccessContext:
    is_admin: bool
    can_access_portal: bool
    is_delegated: bool
    scopes: List[AdminAccessScope]
    grant: Optional[AdminAccessGrant] = None

    def has_any_scope(self, *scopes: AdminAccessScope) -> bool:
        if self.is_admin:
            return True
        return any(scope in self.scopes for scope in scopes)


async def get_active_admin_grant_for_user(user_id: str) -> Optional[AdminAccessGrant]:
    try:
        grant = await AdminAccessGrant.find_one({"user_id": user_id, "is_active": True})
    except CollectionWasNotInitialized:
        return None
    if not grant:
        return None

    if grant.expires_at and grant.expires_at <= utc_now():
        grant.is_active = False
        grant.revoked_at = utc_now()
        grant.updated_at = utc_now()
        await grant.save()
        return None

    return grant


async def get_admin_access_context(user: User) -> AdminAccessContext:
    if user.role == UserRole.ADMIN:
        return AdminAccessContext(
            is_admin=True,
            can_access_portal=True,
            is_delegated=False,
            scopes=list(ADMIN_SCOPE_ORDER),
            grant=None,
        )

    grant = await get_active_admin_grant_for_user(str(user.id))
    scopes = normalize_admin_scopes(grant.scopes) if grant else []
    return AdminAccessContext(
        is_admin=False,
        can_access_portal=bool(scopes),
        is_delegated=grant is not None,
        scopes=scopes,
        grant=grant,
    )


async def build_admin_access_summary(user: User) -> AdminAccessSummary:
    access = await get_admin_access_context(user)
    return AdminAccessSummary(
        can_access_portal=access.can_access_portal,
        is_delegated=access.is_delegated,
        scopes=access.scopes,
        grant_id=str(access.grant.id) if access.grant and access.grant.id else None,
        granted_by_email=access.grant.granted_by_email if access.grant else None,
        expires_at=access.grant.expires_at if access.grant else None,
    )


async def build_user_response(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        picture=user.picture,
        role=user.role,
        team=user.team,
        is_active=user.is_active,
        invited_only=getattr(user, "invited_only", False),
        total_hours=user.total_hours,
        total_submissions=user.total_submissions,
        submission_streak=user.submission_streak,
        profile_complete=user.profile_complete,
        file_access_expires=user.file_access_expires,
        admin_access=await build_admin_access_summary(user),
        created_at=user.created_at,
        last_login=user.last_login,
    )


async def get_current_admin_portal_user(current_user: User = Depends(get_current_user)) -> User:
    access = await get_admin_access_context(current_user)
    if not access.can_access_portal:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin portal access required",
        )
    return current_user


def require_admin_scopes(*required_scopes: AdminAccessScope):
    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        access = await get_admin_access_context(current_user)
        if access.is_admin or access.has_any_scope(*required_scopes):
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin scope required",
        )

    return dependency
