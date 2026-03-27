from datetime import datetime
from enum import Enum
from typing import List, Optional

from beanie import Document, Link
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.time import utc_now
from app.models.user import User, UserRole


class ProjectStatus(str, Enum):
    """Status of a project."""
    ACTIVE = "active"
    COMPLETED = "completed"
    ON_HOLD = "on_hold"
    PLANNED = "planned"


class ProjectBase(BaseModel):
    """Base project fields."""
    name: str
    description: str
    status: ProjectStatus = ProjectStatus.ACTIVE
    tags: List[str] = []
    banner_image: Optional[str] = None  # URL for project banner

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags(cls, value: Optional[List[str]]) -> List[str]:
        seen: set[str] = set()
        normalized: List[str] = []

        for raw_tag in value or []:
            tag = str(raw_tag).strip()
            if not tag:
                continue

            lower_tag = tag.lower()
            normalized_tag = lower_tag if lower_tag in {"volunteer", "team_lead", "admin"} else tag
            dedupe_key = normalized_tag.lower()

            if dedupe_key in seen:
                continue

            seen.add(dedupe_key)
            normalized.append(normalized_tag)

        return normalized


class Project(Document, ProjectBase):
    """
    Project document stored in MongoDB.
    Represents a specific initiative or campaign.
    """
    # Relationships
    lead: Optional[Link[User]] = None
    members: List[Link[User]] = []
    
    # Timestamps
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    
    class Settings:
        name = "projects"
        use_state_management = True
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Food Drive 2026",
                "description": "Annual community food collection event.",
                "status": "active",
                "tags": ["outreach", "events"],
            }
        }
    )

class ProjectCreate(ProjectBase):
    """Schema for creating a project."""
    lead_id: Optional[str] = None
    member_ids: List[str] = []


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    tags: Optional[List[str]] = None
    banner_image: Optional[str] = None
    lead_id: Optional[str] = None
    member_ids: Optional[List[str]] = None


class ProjectUserSummary(BaseModel):
    """Lightweight user info embedded in project responses."""
    id: str
    email: EmailStr
    name: str
    picture: Optional[str] = None
    role: UserRole
    team: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ProjectResponse(ProjectBase):
    """Schema for project response."""
    id: str
    lead: Optional[ProjectUserSummary] = None
    members: List[ProjectUserSummary] = []
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
