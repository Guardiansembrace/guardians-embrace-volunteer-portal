from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from types import SimpleNamespace
from typing import Any, Mapping, Optional

from bson import ObjectId
from pydantic import BaseModel
from starlette.requests import Request

from app.core.admin_access import get_admin_access_context
from app.models.audit_log import AuditLog, AuditLogEventType
from app.models.user import User


def _serialize_for_audit(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, BaseModel):
        return _serialize_for_audit(value.model_dump())
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, Mapping):
        return {str(key): _serialize_for_audit(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_serialize_for_audit(item) for item in value]
    if isinstance(value, SimpleNamespace):
        return _serialize_for_audit(vars(value))
    if hasattr(value, "model_dump"):
        return _serialize_for_audit(value.model_dump())
    if hasattr(value, "__dict__"):
        return _serialize_for_audit(vars(value))
    return value


def _request_client_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


async def write_audit_log(
    *,
    request: Optional[Request],
    actor: Optional[User],
    event_type: AuditLogEventType = AuditLogEventType.REQUEST,
    action: str,
    resource_type: str,
    summary: str,
    resource_id: Optional[str] = None,
    success: bool = True,
    status_code: Optional[int] = None,
    metadata: Optional[Mapping[str, Any]] = None,
) -> None:
    delegated_grant_id = None
    delegated_by_user_id = None
    delegated_by_email = None
    is_delegated = False
    is_admin = False

    if actor is not None:
        access = await get_admin_access_context(actor)
        is_delegated = access.is_delegated
        is_admin = access.is_admin
        if access.grant:
            delegated_grant_id = str(access.grant.id)
            delegated_by_user_id = access.grant.granted_by_user_id
            delegated_by_email = access.grant.granted_by_email

    audit_log = AuditLog(
        event_type=event_type,
        actor_user_id=str(actor.id) if actor is not None and getattr(actor, "id", None) is not None else None,
        actor_email=getattr(actor, "email", None),
        actor_name=getattr(actor, "name", None),
        actor_role=getattr(getattr(actor, "role", None), "value", getattr(actor, "role", None)),
        is_admin=is_admin,
        is_delegated=is_delegated,
        delegated_grant_id=delegated_grant_id,
        delegated_by_user_id=delegated_by_user_id,
        delegated_by_email=delegated_by_email,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        summary=summary,
        method=request.method if request else None,
        path=request.url.path if request else None,
        status_code=status_code,
        success=success,
        request_id=getattr(request.state, "request_id", None) if request else None,
        ip_address=_request_client_ip(request) if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        metadata=_serialize_for_audit(metadata or {}),
    )
    await audit_log.insert()
