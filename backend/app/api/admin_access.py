from typing import List, Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.admin_access import (
    get_current_admin_portal_user,
    normalize_admin_scopes,
    require_admin_scopes,
)
from app.core.audit import write_audit_log
from app.core.rate_limit import rate_limit_by_user
from app.core.time import utc_now
from app.models.admin_access import (
    AdminAccessGrant,
    AdminAccessGrantCreate,
    AdminAccessGrantResponse,
    AdminAccessScope,
)
from app.models.audit_log import AuditLog, AuditLogEventType, AuditLogResponse
from app.models.user import User, UserRole

router = APIRouter(prefix="/admin-access", tags=["Admin Access"])


def _grant_to_response(grant: AdminAccessGrant) -> AdminAccessGrantResponse:
    return AdminAccessGrantResponse(
        id=str(grant.id),
        user_id=grant.user_id,
        user_email=grant.user_email,
        user_name=grant.user_name,
        granted_by_user_id=grant.granted_by_user_id,
        granted_by_email=grant.granted_by_email,
        granted_by_name=grant.granted_by_name,
        scopes=grant.scopes,
        note=grant.note,
        expires_at=grant.expires_at,
        is_active=grant.is_active,
        created_at=grant.created_at,
        updated_at=grant.updated_at,
        revoked_at=grant.revoked_at,
        revoked_by_user_id=grant.revoked_by_user_id,
        revoked_by_email=grant.revoked_by_email,
    )


@router.get("/grants", response_model=List[AdminAccessGrantResponse])
async def list_admin_access_grants(current_admin: User = Depends(require_admin_scopes())):
    grants = await AdminAccessGrant.find({"is_active": True}).sort("-updated_at").to_list()
    return [_grant_to_response(grant) for grant in grants]


@router.post(
    "/grants",
    response_model=AdminAccessGrantResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_by_user("user_admin_writes"))],
)
async def create_admin_access_grant(
    payload: AdminAccessGrantCreate,
    request: Request,
    current_admin: User = Depends(require_admin_scopes()),
):
    if current_admin.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can grant delegated admin access",
        )

    if payload.expires_at and payload.expires_at <= utc_now():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Delegated access expiry must be in the future",
        )

    try:
        target_user = await User.get(PydanticObjectId(payload.user_id))
    except Exception:
        target_user = None

    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not target_user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only active users can receive delegated admin access")
    if target_user.role == UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admins already have full admin access")

    scopes = normalize_admin_scopes(payload.scopes)
    existing_grant = await AdminAccessGrant.find_one({"user_id": str(target_user.id), "is_active": True})

    action = "admin_access.grant_created"
    if existing_grant:
        existing_grant.user_email = target_user.email
        existing_grant.user_name = target_user.name
        existing_grant.granted_by_user_id = str(current_admin.id)
        existing_grant.granted_by_email = current_admin.email
        existing_grant.granted_by_name = current_admin.name
        existing_grant.scopes = scopes
        existing_grant.note = payload.note
        existing_grant.expires_at = payload.expires_at
        existing_grant.updated_at = utc_now()
        existing_grant.revoked_at = None
        existing_grant.revoked_by_user_id = None
        existing_grant.revoked_by_email = None
        await existing_grant.save()
        grant = existing_grant
        action = "admin_access.grant_updated"
    else:
        grant = AdminAccessGrant(
            user_id=str(target_user.id),
            user_email=target_user.email,
            user_name=target_user.name,
            granted_by_user_id=str(current_admin.id),
            granted_by_email=current_admin.email,
            granted_by_name=current_admin.name,
            scopes=scopes,
            note=payload.note,
            expires_at=payload.expires_at,
        )
        await grant.insert()

    await write_audit_log(
        request=request,
        actor=current_admin,
        event_type=AuditLogEventType.ADMIN_ACCESS,
        action=action,
        resource_type="admin_access_grant",
        resource_id=str(grant.id),
        summary=f"{current_admin.email} granted delegated admin access to {target_user.email}",
        status_code=status.HTTP_201_CREATED,
        metadata={
            "target_user_id": str(target_user.id),
            "target_user_email": target_user.email,
            "scopes": scopes,
            "note": payload.note,
            "expires_at": payload.expires_at,
        },
    )

    return _grant_to_response(grant)


@router.delete(
    "/grants/{grant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit_by_user("user_admin_writes"))],
)
async def revoke_admin_access_grant(
    grant_id: str,
    request: Request,
    current_admin: User = Depends(require_admin_scopes()),
):
    if current_admin.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can revoke delegated admin access",
        )

    try:
        grant = await AdminAccessGrant.get(PydanticObjectId(grant_id))
    except Exception:
        grant = None

    if not grant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delegated access grant not found")

    if not grant.is_active:
        return None

    grant.is_active = False
    grant.revoked_at = utc_now()
    grant.revoked_by_user_id = str(current_admin.id)
    grant.revoked_by_email = current_admin.email
    grant.updated_at = utc_now()
    await grant.save()

    await write_audit_log(
        request=request,
        actor=current_admin,
        event_type=AuditLogEventType.ADMIN_ACCESS,
        action="admin_access.grant_revoked",
        resource_type="admin_access_grant",
        resource_id=str(grant.id),
        summary=f"{current_admin.email} revoked delegated admin access for {grant.user_email}",
        status_code=status.HTTP_204_NO_CONTENT,
        metadata={
            "target_user_id": grant.user_id,
            "target_user_email": grant.user_email,
            "scopes": grant.scopes,
        },
    )
    return None


@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def list_audit_logs(
    limit: int = Query(25, ge=1, le=500),
    actor_user_id: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    event_type: Optional[AuditLogEventType] = Query(None),
    success: Optional[bool] = Query(None),
    action: Optional[str] = Query(None),
    is_delegated: Optional[bool] = Query(None),
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.VIEW_AUDIT_LOGS)),
):
    filters = []
    if actor_user_id:
        filters.append(AuditLog.actor_user_id == actor_user_id)
    if resource_type:
        filters.append(AuditLog.resource_type == resource_type)
    if event_type:
        filters.append(AuditLog.event_type == event_type)
    if success is not None:
        filters.append(AuditLog.success == success)
    if action:
        filters.append(AuditLog.action == action)
    if is_delegated is not None:
        filters.append(AuditLog.is_delegated == is_delegated)

    query = AuditLog.find(*filters) if filters else AuditLog.find_all()
    logs = await query.sort("-created_at").limit(limit).to_list()
    return [
        AuditLogResponse(
            id=str(log.id),
            event_type=log.event_type,
            actor_user_id=log.actor_user_id,
            actor_email=log.actor_email,
            actor_name=log.actor_name,
            actor_role=log.actor_role,
            is_admin=log.is_admin,
            is_delegated=log.is_delegated,
            delegated_grant_id=log.delegated_grant_id,
            delegated_by_user_id=log.delegated_by_user_id,
            delegated_by_email=log.delegated_by_email,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            summary=log.summary,
            method=log.method,
            path=log.path,
            status_code=log.status_code,
            success=log.success,
            request_id=log.request_id,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            metadata=log.metadata,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.get("/me")
async def get_admin_portal_access(current_user: User = Depends(get_current_admin_portal_user)):
    return {"ok": True, "user_id": str(current_user.id)}
