"""
Comment model for MongoDB.
Stores comments and replies on submissions.
"""

from datetime import datetime
from typing import Optional, List

from beanie import Indexed

from app.models.base import BaseDocument
from pydantic import BaseModel, ConfigDict, Field

from app.core.time import utc_now


class Comment(BaseDocument):
    """
    Comment document stored in MongoDB.
    Comments can be on submissions or replies to other comments.
    """
    
    # Reference to submission
    submission_id: Indexed(str)
    
    # Author
    user_id: str
    user_name: str
    user_email: str
    is_admin: bool = False
    
    # Content
    content: str
    
    # Reply chain (if this is a reply)
    parent_id: Optional[str] = None
    
    # Status
    is_edited: bool = False
    is_deleted: bool = False
    
    # Timestamps
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    
    class Settings:
        name = "comments"
        use_state_management = True
        indexes = [
            [("submission_id", 1), ("created_at", 1)],
        ]
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "submission_id": "507f1f77bcf86cd799439011",
                "user_id": "507f1f77bcf86cd799439012",
                "user_name": "Maxwell",
                "user_email": "maxwell@guardiansembrace.org",
                "is_admin": True,
                "content": "Great work this week! Keep it up.",
                "parent_id": None
            }
        }
    )

class CommentCreate(BaseModel):
    """Schema for creating a comment."""
    content: str
    parent_id: Optional[str] = None


class CommentUpdate(BaseModel):
    """Schema for updating a comment."""
    content: str


class CommentResponse(BaseModel):
    """Schema for comment response."""
    id: str
    submission_id: str
    user_id: str
    user_name: str
    is_admin: bool
    content: str
    parent_id: Optional[str]
    is_edited: bool
    created_at: datetime
    updated_at: datetime
    replies: List["CommentResponse"] = []
    
    model_config = ConfigDict(from_attributes=True)


# Update forward reference
CommentResponse.model_rebuild()
