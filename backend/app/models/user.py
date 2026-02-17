"""
User model for MongoDB.
Stores volunteer and admin information.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List

from beanie import Document, Indexed
from pydantic import BaseModel, EmailStr, Field


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


class User(Document, UserBase):
    """
    User document stored in MongoDB.
    Created automatically when a user first logs in via Google OAuth.
    """
    
    email: Indexed(EmailStr, unique=True)
    google_id: Indexed(str, unique=True)
    
    # Profile
    name: str
    picture: Optional[str] = None
    
    # Role & Team
    role: UserRole = UserRole.VOLUNTEER
    team: Optional[str] = None
    
    # Status
    is_active: bool = True
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: datetime = Field(default_factory=datetime.utcnow)
    
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
    
    class Settings:
        name = "users"
        use_state_management = True
    
    class Config:
        json_schema_extra = {
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


class UserResponse(BaseModel):
    """Schema for user response (public data)."""
    id: str
    email: EmailStr
    name: str
    picture: Optional[str] = None
    role: UserRole
    team: Optional[str] = None
    is_active: bool
    total_hours: float
    total_submissions: int
    submission_streak: int = 0
    profile_complete: bool = False
    file_access_expires: Optional[datetime] = None
    created_at: datetime
    last_login: datetime
    
    class Config:
        from_attributes = True
