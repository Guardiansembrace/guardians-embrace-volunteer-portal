"""
Submission model for MongoDB.
Stores volunteer weekly updates including past, present, and future work.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List

from beanie import Indexed, Link

from app.models.base import BaseDocument
from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.core.time import utc_now


class SubmissionStatus(str, Enum):
    """Submission status."""
    DRAFT = "draft"
    SUBMITTED = "submitted"
    REVIEWED = "reviewed"


class WorkEntry(BaseModel):
    """A single work entry within a submission."""
    description: str
    hours: float = 0.0
    drive_link: Optional[str] = None
    tags: List[str] = []
    # Optional link to a project work item
    work_item_id: Optional[str] = None
    # If set, the work item's status will be updated to this value when the submission is saved
    work_item_status_update: Optional[str] = None


class SubmissionBase(BaseModel):
    """Base submission fields."""
    
    # Work content
    past_work: List[WorkEntry] = []  # What was done
    present_work: List[WorkEntry] = []  # What is in progress  
    future_work: List[WorkEntry] = []  # What is planned
    
    # Summary
    reported_hours: float = 0.0
    credited_hours: float = 0.0
    total_hours: float = 0.0
    blockers: Optional[str] = None
    notes: Optional[str] = None
    
    # Custom forms
    custom_responses: dict = {}
    hour_tracking_sections: List[str] = []
    
    # Status
    status: SubmissionStatus = SubmissionStatus.DRAFT


class Submission(BaseDocument, SubmissionBase):
    """
    Submission document stored in MongoDB.
    Represents a volunteer's weekly update.
    """
    
    # User reference
    user_id: Indexed(str)
    user_email: str
    user_name: str

    # Project reference
    # Legacy submissions created before project workspaces launched may not
    # have a project_id persisted yet. Keep them readable instead of crashing
    # list queries that deserialize historical records.
    project_id: Indexed(str) = ""
    project_name: Optional[str] = None
    visibility: str = "project_members"
    
    # Week identifier (e.g., "2026-W04")
    week_id: Indexed(str)
    week_start: datetime
    week_end: datetime
    
    # Work content
    past_work: List[WorkEntry] = []
    present_work: List[WorkEntry] = []
    future_work: List[WorkEntry] = []
    
    # Summary
    reported_hours: float = 0.0
    credited_hours: float = 0.0
    total_hours: float = 0.0
    blockers: Optional[str] = None
    notes: Optional[str] = None
    mood_rating: Optional[int] = None  # 1-5 weekly satisfaction
    is_late: bool = False  # submitted after week deadline
    
    # Status
    status: SubmissionStatus = SubmissionStatus.DRAFT
    
    # Admin review
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    admin_notes: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    submitted_at: Optional[datetime] = None
    
    class Settings:
        name = "submissions"
        use_state_management = True
        indexes = [
            [("user_id", 1), ("week_id", 1), ("project_id", 1)],  # Compound index for user+week+project
            [("user_id", 1), ("created_at", -1)],
            [("week_id", 1), ("created_at", -1)],
            [("week_id", 1), ("status", 1), ("created_at", -1)],
            [("project_id", 1), ("week_start", -1)],
            [("project_id", 1), ("status", 1), ("week_start", -1)],
        ]
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "user_id": "507f1f77bcf86cd799439011",
                "user_email": "volunteer@example.com",
                "user_name": "John Doe",
                "project_id": "507f1f77bcf86cd799439012",
                "project_name": "Food Drive 2026",
                "week_id": "2026-W04",
                "past_work": [
                    {"description": "Completed outreach calls", "hours": 4.0}
                ],
                "present_work": [
                    {"description": "Organizing event materials", "hours": 2.0}
                ],
                "future_work": [
                    {"description": "Plan community workshop", "hours": 0.0}
                ],
                "reported_hours": 6.0,
                "credited_hours": 4.0,
                "total_hours": 6.0,
                "blockers": None,
                "status": "submitted"
            }
        }
    )

class SubmissionCreate(BaseModel):
    """Schema for creating/updating a submission."""
    week_id: Optional[str] = None
    project_id: str
    past_work: List[WorkEntry] = []
    present_work: List[WorkEntry] = []
    future_work: List[WorkEntry] = []
    blockers: Optional[str] = None
    notes: Optional[str] = None
    mood_rating: Optional[int] = None
    custom_responses: dict = {}


class SubmissionSubmit(BaseModel):
    """Schema for submitting a draft."""
    pass  # Just changes status


class SubmissionAdminReview(BaseModel):
    """Schema for admin reviewing a submission."""
    admin_notes: Optional[str] = None


class SubmissionResponse(BaseModel):
    """Schema for submission response."""
    id: str
    user_id: str
    user_email: str
    user_name: str
    project_id: str
    project_name: Optional[str] = None
    visibility: str = "project_members"
    week_id: str
    week_start: datetime
    week_end: datetime
    past_work: List[WorkEntry]
    present_work: List[WorkEntry]
    future_work: List[WorkEntry]
    reported_hours: float
    credited_hours: float
    total_hours: float
    blockers: Optional[str]
    notes: Optional[str]
    mood_rating: Optional[int]
    custom_responses: dict
    is_late: bool = False
    status: SubmissionStatus
    reviewed_by: Optional[str]
    reviewed_at: Optional[datetime]
    admin_notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime]
    
    model_config = ConfigDict(from_attributes=True)


class SubmissionSummary(BaseModel):
    """Schema for submission list/summary view."""
    id: str
    user_id: str
    user_name: str
    project_id: str
    project_name: Optional[str] = None
    week_id: str
    reported_hours: float
    credited_hours: float
    total_hours: float
    status: SubmissionStatus
    submitted_at: Optional[datetime]
    has_blockers: bool
    is_late: bool = False
    
    model_config = ConfigDict(from_attributes=True)
