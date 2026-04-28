"""
Notifications API endpoints.
Handles email reminders and in-app notification management.
"""

import logging
from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.admin_access import AdminAccessScope, require_admin_scopes
from app.core.config import get_settings
from app.core.rate_limit import rate_limit_by_user
from app.core.security import get_current_user
from app.core.email import send_email, build_reminder_html, is_email_configured
from app.core.utils import get_week_id, get_submission_deadline
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.models.submission import Submission, SubmissionStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ReminderResponse(BaseModel):
    success: bool
    total_volunteers: int
    already_submitted: int
    reminders_sent: int
    errors: list = []
    message: str


class NotificationResponse(BaseModel):
    id: str
    type: str
    title: str
    body: str
    link: Optional[str] = None
    read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    notifications: List[NotificationResponse]
    unread_count: int


class NotificationPreferencesUpdate(BaseModel):
    notif_submission_reviewed: Optional[bool] = None
    notif_admin_comment: Optional[bool] = None
    notif_join_request_reviewed: Optional[bool] = None
    notif_join_request_received: Optional[bool] = None
    notif_project_activity: Optional[bool] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize(n: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=str(n.id),
        type=n.type,
        title=n.title,
        body=n.body,
        link=n.link,
        read=n.read,
        created_at=n.created_at,
    )


# ---------------------------------------------------------------------------
# In-app notification endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    limit: int = Query(30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's recent notifications with unread count."""
    user_id = str(current_user.id)
    notifications = (
        await Notification.find(Notification.user_id == user_id)
        .sort(-Notification.created_at)
        .limit(limit)
        .to_list()
    )
    unread_count = await Notification.find(
        Notification.user_id == user_id,
        Notification.read == False,
    ).count()
    return NotificationListResponse(
        notifications=[_serialize(n) for n in notifications],
        unread_count=unread_count,
    )


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
):
    """Mark a single notification as read."""
    try:
        notif = await Notification.get(ObjectId(notification_id))
    except Exception:
        notif = None

    if not notif or notif.user_id != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    notif.read = True
    await notif.save()
    return _serialize(notif)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
):
    """Mark all of the current user's notifications as read."""
    user_id = str(current_user.id)
    unread = await Notification.find(
        Notification.user_id == user_id,
        Notification.read == False,
    ).to_list()
    for n in unread:
        n.read = True
        await n.save()


@router.patch("/preferences", response_model=dict)
async def update_notification_preferences(
    prefs: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update the current user's notification preferences."""
    if prefs.notif_submission_reviewed is not None:
        current_user.notif_submission_reviewed = prefs.notif_submission_reviewed
    if prefs.notif_admin_comment is not None:
        current_user.notif_admin_comment = prefs.notif_admin_comment
    if prefs.notif_join_request_reviewed is not None:
        current_user.notif_join_request_reviewed = prefs.notif_join_request_reviewed
    if prefs.notif_join_request_received is not None:
        current_user.notif_join_request_received = prefs.notif_join_request_received
    if prefs.notif_project_activity is not None:
        current_user.notif_project_activity = prefs.notif_project_activity
    await current_user.save()
    return {"success": True}


# ---------------------------------------------------------------------------
# Admin — weekly reminder emails (existing)
# ---------------------------------------------------------------------------

@router.get("/email-status")
async def get_email_status(
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.SEND_REMINDERS)),
):
    configured = is_email_configured()
    return {
        "configured": configured,
        "message": "SMTP is configured and ready" if configured
                   else "SMTP not configured. Set SMTP_USERNAME and SMTP_PASSWORD in .env",
    }


@router.post(
    "/send-reminders",
    response_model=ReminderResponse,
    dependencies=[Depends(rate_limit_by_user("reminder_writes"))],
)
async def send_weekly_reminders(
    week_id: Optional[str] = None,
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.SEND_REMINDERS)),
):
    """Send email reminders to all active volunteers who haven't submitted yet."""
    if not is_email_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email is not configured. Set SMTP_USERNAME and SMTP_PASSWORD in .env",
        )

    target_week = week_id or get_week_id()
    deadline = get_submission_deadline(target_week)
    deadline_str = deadline.strftime("%A, %B %d at %I:%M %p")
    settings = get_settings()

    all_users = await User.find(
        User.is_active == True,
        User.role == UserRole.VOLUNTEER,
    ).to_list()

    week_submissions = await Submission.find(
        Submission.week_id == target_week,
        Submission.status != SubmissionStatus.DRAFT,
    ).to_list()
    submitted_user_ids = {s.user_id for s in week_submissions}

    needs_reminder = [u for u in all_users if str(u.id) not in submitted_user_ids]

    if not needs_reminder:
        return ReminderResponse(
            success=True,
            total_volunteers=len(all_users),
            already_submitted=len(submitted_user_ids),
            reminders_sent=0,
            message=f"All volunteers have already submitted for {target_week}!",
        )

    total_sent = 0
    errors = []
    for user in needs_reminder:
        html = build_reminder_html(
            volunteer_name=user.name,
            week_id=target_week,
            deadline_str=deadline_str,
            portal_url=settings.frontend_url,
        )
        result = send_email(
            to_emails=[user.email],
            subject=f"Weekly Check-in Reminder — {target_week}",
            html_body=html,
        )
        if result.get("sent_to"):
            total_sent += 1
        if result.get("errors"):
            errors.extend(result["errors"])

    logger.info(
        "Reminders sent for %s: %d/%d (%d already submitted)",
        target_week, total_sent, len(needs_reminder), len(submitted_user_ids),
    )

    return ReminderResponse(
        success=len(errors) == 0,
        total_volunteers=len(all_users),
        already_submitted=len(submitted_user_ids),
        reminders_sent=total_sent,
        errors=errors,
        message=f"Sent {total_sent} reminder(s) for {target_week}. "
                f"{len(submitted_user_ids)} had already submitted.",
    )
