from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from beanie import Document
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.time import utc_now


class AuditLogEventType(str, Enum):
    REQUEST = "request"
    SECURITY = "security"
    ADMIN_ACCESS = "admin_access"


class AuditLog(Document):
    event_type: AuditLogEventType = AuditLogEventType.REQUEST
    actor_user_id: Optional[str] = None
    actor_email: Optional[EmailStr] = None
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None
    is_admin: bool = False
    is_delegated: bool = False
    delegated_grant_id: Optional[str] = None
    delegated_by_user_id: Optional[str] = None
    delegated_by_email: Optional[EmailStr] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    summary: str
    method: Optional[str] = None
    path: Optional[str] = None
    status_code: Optional[int] = None
    success: bool = True
    request_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "audit_logs"


class AuditLogResponse(BaseModel):
    id: str
    event_type: AuditLogEventType
    actor_user_id: Optional[str] = None
    actor_email: Optional[EmailStr] = None
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None
    is_admin: bool = False
    is_delegated: bool = False
    delegated_grant_id: Optional[str] = None
    delegated_by_user_id: Optional[str] = None
    delegated_by_email: Optional[EmailStr] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    summary: str
    method: Optional[str] = None
    path: Optional[str] = None
    status_code: Optional[int] = None
    success: bool = True
    request_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    metadata: Dict[str, Any]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
