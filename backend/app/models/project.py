from datetime import datetime
from enum import Enum
from typing import List, Optional

from beanie import Document, Link, PydanticObjectId
from pydantic import BaseModel, Field

from app.models.user import User


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


class Project(Document, ProjectBase):
    """
    Project document stored in MongoDB.
    Represents a specific initiative or campaign.
    """
    # Relationships
    lead: Optional[Link[User]] = None
    members: List[Link[User]] = []
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "projects"
        use_state_management = True
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "Food Drive 2026",
                "description": "Annual community food collection event.",
                "status": "active",
                "tags": ["outreach", "events"],
            }
        }


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


class ProjectResponse(ProjectBase):
    """Schema for project response."""
    id: PydanticObjectId
    lead: Optional[User] = None  # Minimal user info or full object? Beanie Link fetches full
    members: List[User] = []
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
