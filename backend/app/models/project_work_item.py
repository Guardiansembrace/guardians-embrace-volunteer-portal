from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.time import utc_now


class WorkItemStatus(str, Enum):
    """Status of a project work item."""

    PENDING = "pending"
    ACTIVE = "active"
    BLOCKED = "blocked"
    FINISHED = "finished"


class WorkItemPriority(str, Enum):
    """Priority of a project work item."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class ProjectWorkItemBase(BaseModel):
    """Base work-item fields shared across request and response models."""

    title: str = Field(min_length=2, max_length=140)
    description: Optional[str] = Field(default=None, max_length=4000)
    item_type: str = Field(default="task", min_length=1, max_length=48)
    status: WorkItemStatus = WorkItemStatus.PENDING
    priority: WorkItemPriority = WorkItemPriority.MEDIUM
    assignee_id: Optional[str] = None
    due_date: Optional[datetime] = None

    @field_validator("title", "item_type", mode="before")
    @classmethod
    def strip_required_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return str(value).strip()

    @field_validator("description", mode="before")
    @classmethod
    def strip_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = str(value).strip()
        return stripped or None

    @field_validator("assignee_id", mode="before")
    @classmethod
    def normalize_assignee_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None


class ProjectWorkItem(Document):
    """Work tracked inside a project board."""

    project_id: PydanticObjectId
    title: str
    description: Optional[str] = None
    item_type: str = "task"
    status: WorkItemStatus = WorkItemStatus.PENDING
    priority: WorkItemPriority = WorkItemPriority.MEDIUM
    assignee_id: Optional[PydanticObjectId] = None
    assignee_name: Optional[str] = None
    created_by_id: PydanticObjectId
    created_by_name: str
    updated_by_id: PydanticObjectId
    updated_by_name: str
    due_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "project_work_items"
        use_state_management = True

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "project_id": "65f0c10e8eced6afed0a8a10",
                "title": "Landing page copy review",
                "description": "Finalize the updated homepage messaging.",
                "item_type": "feature",
                "status": "active",
                "priority": "high",
            }
        }
    )


class ProjectWorkItemCreate(ProjectWorkItemBase):
    """Schema for creating a project work item."""


class ProjectWorkItemUpdate(BaseModel):
    """Schema for updating a project work item."""

    title: Optional[str] = Field(default=None, min_length=2, max_length=140)
    description: Optional[str] = Field(default=None, max_length=4000)
    item_type: Optional[str] = Field(default=None, min_length=1, max_length=48)
    status: Optional[WorkItemStatus] = None
    priority: Optional[WorkItemPriority] = None
    assignee_id: Optional[str] = None
    due_date: Optional[datetime] = None

    @field_validator("title", "item_type", mode="before")
    @classmethod
    def strip_required_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return str(value).strip()

    @field_validator("description", mode="before")
    @classmethod
    def strip_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = str(value).strip()
        return stripped or None

    @field_validator("assignee_id", mode="before")
    @classmethod
    def normalize_assignee_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None


class ProjectWorkItemResponse(BaseModel):
    """API response shape for a project work item."""

    id: str
    project_id: str
    title: str
    description: Optional[str] = None
    item_type: str
    status: WorkItemStatus
    priority: WorkItemPriority
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    created_by_id: str
    created_by_name: str
    updated_by_id: str
    updated_by_name: str
    due_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
