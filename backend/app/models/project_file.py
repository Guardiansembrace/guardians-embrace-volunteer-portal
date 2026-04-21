from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document, Indexed
from pydantic import BaseModel, ConfigDict, Field

from app.core.time import utc_now


class ProjectFileSourceType(str, Enum):
    """Logical source for a stored project file."""

    SUBMISSION = "submission"
    PROJECT = "project"
    WORK_ITEM = "work_item"


class ProjectFile(Document):
    """Metadata record for a file associated with a project context."""

    project_id: Indexed(str)
    project_name: Optional[str] = None
    submission_id: Optional[str] = None
    work_item_id: Optional[str] = None
    source_type: ProjectFileSourceType = ProjectFileSourceType.PROJECT
    storage_file_id: str
    storage_type: str
    external_link: Optional[str] = None
    filename: str
    mime_type: str
    size_bytes: Optional[int] = None
    week_id: Optional[str] = None
    uploaded_by_user_id: str
    uploaded_by_name: str
    created_at: datetime = Field(default_factory=utc_now)
    deleted_at: Optional[datetime] = None
    is_deleted: bool = False

    class Settings:
        name = "project_files"
        use_state_management = True
        indexes = [
            [("project_id", 1), ("created_at", -1)],
            [("project_id", 1), ("source_type", 1), ("created_at", -1)],
            [("submission_id", 1), ("created_at", -1)],
            [("work_item_id", 1), ("created_at", -1)],
            [("storage_file_id", 1)],
        ]

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "project_id": "65f0c10e8eced6afed0a8a10",
                "project_name": "Food Drive 2026",
                "submission_id": "65f0c10e8eced6afed0a8a11",
                "source_type": "submission",
                "storage_file_id": "drive-file-id-or-storage-token",
                "storage_type": "shared_drive",
                "filename": "outreach-plan.pdf",
                "mime_type": "application/pdf",
                "uploaded_by_user_id": "65f0c10e8eced6afed0a8a12",
                "uploaded_by_name": "Jane Doe",
                "week_id": "2026-W16",
            }
        }
    )


class ProjectFileResponse(BaseModel):
    """API response for a project-scoped uploaded file."""

    project_file_id: str
    file_id: str
    filename: str
    mime_type: str
    drive_link: str
    uploaded_at: str
    storage_type: str
    project_id: str
    project_name: Optional[str] = None
    submission_id: Optional[str] = None
    work_item_id: Optional[str] = None
    source_type: ProjectFileSourceType
    uploaded_by_name: str
    week_id: Optional[str] = None
    size_bytes: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)
