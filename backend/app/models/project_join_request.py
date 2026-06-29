from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import PydanticObjectId

from app.models.base import BaseDocument
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.time import utc_now


class ProjectJoinRequestStatus(str, Enum):
    """Status of a project join request."""

    PENDING = "pending"
    APPROVED = "approved"
    DECLINED = "declined"


class ProjectJoinRequestType(str, Enum):
    """Kind of project request being submitted."""

    ACCESS = "access"
    LEAD = "lead"
    DELETE = "delete"


class ProjectJoinRequest(BaseDocument):
    """A request from a user to join or lead a project."""

    project_id: PydanticObjectId
    user_id: PydanticObjectId
    user_email: EmailStr
    user_name: str
    request_type: ProjectJoinRequestType = ProjectJoinRequestType.ACCESS
    message: Optional[str] = None
    status: ProjectJoinRequestStatus = ProjectJoinRequestStatus.PENDING
    requested_at: datetime = Field(default_factory=utc_now)
    reviewed_at: Optional[datetime] = None
    reviewed_by_id: Optional[PydanticObjectId] = None
    reviewed_by_name: Optional[str] = None

    class Settings:
        name = "project_join_requests"
        use_state_management = True

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "project_id": "65f0c10e8eced6afed0a8a10",
                "user_id": "65f0c10e8eced6afed0a8a22",
                "user_email": "volunteer@example.com",
                "user_name": "Volunteer Builder",
                "request_type": "access",
                "message": "I would like to help with content updates.",
                "status": "pending",
            }
        }
    )


class ProjectJoinRequestCreate(BaseModel):
    """Schema for creating a join request."""

    request_type: ProjectJoinRequestType = ProjectJoinRequestType.ACCESS
    message: Optional[str] = Field(default=None, max_length=600)

    @field_validator("message", mode="before")
    @classmethod
    def strip_message(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = str(value).strip()
        return stripped or None


class ProjectJoinRequestReview(BaseModel):
    """Schema for approving or declining a join request."""

    status: ProjectJoinRequestStatus

    @field_validator("status")
    @classmethod
    def reject_pending_status(cls, value: ProjectJoinRequestStatus) -> ProjectJoinRequestStatus:
        if value == ProjectJoinRequestStatus.PENDING:
            raise ValueError("Review status must be approved or declined.")
        return value


class ProjectJoinRequestResponse(BaseModel):
    """API response shape for a project join request."""

    id: str
    project_id: str
    user_id: str
    user_email: EmailStr
    user_name: str
    request_type: ProjectJoinRequestType
    message: Optional[str] = None
    status: ProjectJoinRequestStatus
    requested_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by_id: Optional[str] = None
    reviewed_by_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
