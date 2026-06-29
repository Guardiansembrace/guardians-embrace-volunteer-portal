from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Indexed

from app.models.base import BaseDocument
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.email_identity import normalize_email
from app.core.time import utc_now
from app.models.user import UserRole


class InvitePortalStatus(str, Enum):
    PENDING_LOGIN = "pending_login"
    ACCESS_RECORD = "access_record"


class AllowedEmail(BaseDocument):
    """
    Collection of emails allowed to register/login.
    Used for the invitation system.
    """
    email: Indexed(EmailStr, unique=True)
    role: UserRole = UserRole.VOLUNTEER
    invited_by: Optional[str] = None  # Email of admin who invited
    
    created_at: datetime = Field(default_factory=utc_now)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email_value(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return normalize_email(str(value))
    
    class Settings:
        name = "allowed_emails"
        
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "new.volunteer@example.com",
                "role": "volunteer",
                "invited_by": "admin@example.com"
            }
        }
    )
class AllowedEmailCreate(BaseModel):
    """Schema for inviting a user."""
    email: EmailStr
    role: UserRole = UserRole.VOLUNTEER

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email_value(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return normalize_email(str(value))


class AllowedEmailRecord(BaseModel):
    """Invite record enriched with the user's current portal state."""

    id: Optional[str] = None
    email: EmailStr
    role: UserRole = UserRole.VOLUNTEER
    invited_by: Optional[str] = None
    created_at: datetime
    portal_status: InvitePortalStatus = InvitePortalStatus.PENDING_LOGIN
    has_logged_in: bool = False
    user_name: Optional[str] = None
    user_last_login: Optional[datetime] = None
