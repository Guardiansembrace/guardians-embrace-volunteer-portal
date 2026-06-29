"""
User model for MongoDB.
Stores volunteer and admin information.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List

from beanie import Indexed

from app.models.base import BaseDocument
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.email_identity import normalize_email
from app.core.time import utc_now
from app.models.admin_access import AdminAccessScope


class UserRole(str, Enum):
    """User role levels."""
    VOLUNTEER = "volunteer"
    TEAM_LEAD = "team_lead"
    ADMIN = "admin"


class UserBase(BaseModel):
    """Base user fields."""
    email: EmailStr
    name: str
    picture: Optional[str] = None
    role: UserRole = UserRole.VOLUNTEER
    team: Optional[str] = None
    is_active: bool = True

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email_value(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return normalize_email(str(value))


class User(BaseDocument, UserBase):
    """
    User document stored in MongoDB.
    Created automatically when a user first logs in via Google OAuth.
    """
    
    email: Indexed(EmailStr, unique=True)
    # Existing Atlas data contains historical users without Google IDs.
    # Keep the field optional so the app can coexist with that dataset and
    # populate the Google subject on the next successful login.
    google_id: Optional[str] = None
    
    # Profile
    name: str
    picture: Optional[str] = None
    
    # Role & Team
    role: UserRole = UserRole.VOLUNTEER
    team: Optional[str] = None
    
    # Status
    is_active: bool = True
    invited_only: bool = False
    
    # Timestamps
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    last_login: Optional[datetime] = None
    
    # Stats (denormalized for quick access)
    total_hours: float = 0.0
    total_submissions: int = 0
    submission_streak: int = 0  # consecutive weeks submitted
    
    # Profile completion — user must set their full name after first Google login
    profile_complete: bool = False
    
    # File access window — new users get 24 hours to upload/download/delete
    # Admins can extend this. None = no expiry (admins).
    file_access_expires: Optional[datetime] = None
    
    # Google OAuth token for Drive uploads (refreshed on each login)
    google_access_token: Optional[str] = None

    # Notification preferences
    notif_submission_reviewed: bool = True
    notif_admin_comment: bool = True
    notif_join_request_reviewed: bool = True
    notif_join_request_received: bool = True
    notif_project_activity: bool = True

    class Settings:
        name = "users"
        use_state_management = True
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "volunteer@example.com",
                "google_id": "123456789",
                "name": "John Doe",
                "picture": "https://lh3.googleusercontent.com/...",
                "role": "volunteer",
                "team": "Outreach",
                "is_active": True,
            }
        }
    )

class UserCreate(BaseModel):
    """Schema for creating a new user (from Google OAuth)."""
    email: EmailStr
    google_id: str
    name: str
    picture: Optional[str] = None


class UserUpdate(BaseModel):
    """Schema for updating user profile."""
    name: Optional[str] = None
    team: Optional[str] = None


class UserAdminUpdate(BaseModel):
    """Schema for admin updating user (can change role)."""
    name: Optional[str] = None
    team: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class SetNameRequest(BaseModel):
    """Schema for setting the user's full name after first login."""
    full_name: str


class AdminAccessSummary(BaseModel):
    """Aggregated delegated admin access summary for the current user."""
    can_access_portal: bool = False
    is_delegated: bool = False
    scopes: List[AdminAccessScope] = Field(default_factory=list)
    grant_id: Optional[str] = None
    granted_by_email: Optional[EmailStr] = None
    expires_at: Optional[datetime] = None


class UserResponse(BaseModel):
    """Schema for user response (public data)."""
    id: str
    email: EmailStr
    name: str
    picture: Optional[str] = None
    role: UserRole
    team: Optional[str] = None
    is_active: bool
    invited_only: bool = False
    total_hours: float
    total_submissions: int
    submission_streak: int = 0
    profile_complete: bool = False
    file_access_expires: Optional[datetime] = None
    admin_access: AdminAccessSummary = Field(default_factory=AdminAccessSummary)
    created_at: datetime
    last_login: Optional[datetime] = None
    notif_submission_reviewed: bool = True
    notif_admin_comment: bool = True
    notif_join_request_reviewed: bool = True
    notif_join_request_received: bool = True
    notif_project_activity: bool = True

    model_config = ConfigDict(from_attributes=True)
