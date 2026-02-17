"""
Submission model for MongoDB.
Stores volunteer weekly updates including past, present, and future work.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List

from beanie import Document, Indexed, Link
from pydantic import BaseModel, Field, HttpUrl


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


class SubmissionBase(BaseModel):
    """Base submission fields."""
    
    # Work content
    past_work: List[WorkEntry] = []  # What was done
    present_work: List[WorkEntry] = []  # What is in progress  
    future_work: List[WorkEntry] = []  # What is planned
    
    # Summary
    total_hours: float = 0.0
    blockers: Optional[str] = None
    notes: Optional[str] = None
    
    # Status
    status: SubmissionStatus = SubmissionStatus.DRAFT


class Submission(Document, SubmissionBase):
    """
    Submission document stored in MongoDB.
    Represents a volunteer's weekly update.
    """
    
    # User reference
    user_id: Indexed(str)
    user_email: str
    user_name: str
    
    # Week identifier (e.g., "2026-W04")
    week_id: Indexed(str)
    week_start: datetime
    week_end: datetime
    
    # Work content
    past_work: List[WorkEntry] = []
    present_work: List[WorkEntry] = []
    future_work: List[WorkEntry] = []
    
    # Summary
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
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    submitted_at: Optional[datetime] = None
    
    class Settings:
        name = "submissions"
        use_state_management = True
        indexes = [
            [("user_id", 1), ("week_id", 1)],  # Compound index for user+week
        ]
    
    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "507f1f77bcf86cd799439011",
                "user_email": "volunteer@example.com",
                "user_name": "John Doe",
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
                "total_hours": 6.0,
                "blockers": None,
                "status": "submitted"
            }
        }


class SubmissionCreate(BaseModel):
    """Schema for creating/updating a submission."""
    past_work: List[WorkEntry] = []
    present_work: List[WorkEntry] = []
    future_work: List[WorkEntry] = []
    blockers: Optional[str] = None
    notes: Optional[str] = None
    mood_rating: Optional[int] = None


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
    week_id: str
    week_start: datetime
    week_end: datetime
    past_work: List[WorkEntry]
    present_work: List[WorkEntry]
    future_work: List[WorkEntry]
    total_hours: float
    blockers: Optional[str]
    notes: Optional[str]
    mood_rating: Optional[int]
    is_late: bool = False
    status: SubmissionStatus
    reviewed_by: Optional[str]
    reviewed_at: Optional[datetime]
    admin_notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class SubmissionSummary(BaseModel):
    """Schema for submission list/summary view."""
    id: str
    user_id: str
    user_name: str
    week_id: str
    total_hours: float
    status: SubmissionStatus
    submitted_at: Optional[datetime]
    has_blockers: bool
    is_late: bool = False
    
    class Config:
        from_attributes = True
