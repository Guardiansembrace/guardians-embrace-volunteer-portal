from datetime import datetime
from enum import Enum
from typing import List, Optional

from beanie import Document, Indexed
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.time import utc_now


class AdminAccessScope(str, Enum):
    VIEW_USERS = "view_users"
    MANAGE_USERS = "manage_users"
    REVIEW_SUBMISSIONS = "review_submissions"
    SEND_REMINDERS = "send_reminders"
    MANAGE_INVITES = "manage_invites"
    MANAGE_SETTINGS = "manage_settings"
    VIEW_AUDIT_LOGS = "view_audit_logs"


class AdminAccessGrant(Document):
    user_id: Indexed(str)
    user_email: EmailStr
    user_name: str
    granted_by_user_id: str
    granted_by_email: EmailStr
    granted_by_name: str
    scopes: List[AdminAccessScope] = Field(default_factory=list)
    note: Optional[str] = None
    expires_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    revoked_at: Optional[datetime] = None
    revoked_by_user_id: Optional[str] = None
    revoked_by_email: Optional[EmailStr] = None

    class Settings:
        name = "admin_access_grants"


class AdminAccessGrantCreate(BaseModel):
    user_id: str
    scopes: List[AdminAccessScope] = Field(min_length=1)
    note: Optional[str] = None
    expires_at: Optional[datetime] = None


class AdminAccessGrantResponse(BaseModel):
    id: str
    user_id: str
    user_email: EmailStr
    user_name: str
    granted_by_user_id: str
    granted_by_email: EmailStr
    granted_by_name: str
    scopes: List[AdminAccessScope]
    note: Optional[str] = None
    expires_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    revoked_at: Optional[datetime] = None
    revoked_by_user_id: Optional[str] = None
    revoked_by_email: Optional[EmailStr] = None

    model_config = ConfigDict(from_attributes=True)
