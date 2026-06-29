from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Indexed

from app.models.base import BaseDocument
from pydantic import ConfigDict, Field

from app.core.time import utc_now


class NotificationType(str, Enum):
    SUBMISSION_REVIEWED = "submission_reviewed"
    ADMIN_COMMENT = "admin_comment"
    JOIN_REQUEST_REVIEWED = "join_request_reviewed"
    JOIN_REQUEST_RECEIVED = "join_request_received"
    PROJECT_ACTIVITY = "project_activity"
    MEMBER_ADDED = "member_added"
    MEMBER_REMOVED = "member_removed"
    WORK_ITEM_ASSIGNED = "work_item_assigned"
    WORK_ITEM_STATUS_CHANGED = "work_item_status_changed"
    ROLE_CHANGED = "role_changed"
    ACCOUNT_STATUS_CHANGED = "account_status_changed"


class Notification(BaseDocument):
    user_id: Indexed(str)
    type: NotificationType
    title: str
    body: str
    link: Optional[str] = None
    read: bool = False
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "notifications"
        indexes = [
            [("user_id", 1), ("read", 1), ("created_at", -1)],
        ]

    model_config = ConfigDict(use_enum_values=True)
