"""
Notifications API endpoints.
Handles email reminders for weekly check-ins.
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from app.core.admin_access import AdminAccessScope, require_admin_scopes
from app.core.config import get_settings
from app.core.rate_limit import rate_limit_by_user
from app.core.email import send_email, build_reminder_html, is_email_configured
from app.core.utils import get_week_id, get_submission_deadline
from app.models.user import User, UserRole
from app.models.submission import Submission, SubmissionStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class ReminderResponse(BaseModel):
    """Response from sending reminders."""
    success: bool
    total_volunteers: int
    already_submitted: int
    reminders_sent: int
    errors: list = []
    message: str


@router.get("/email-status")
async def get_email_status(current_user: User = Depends(require_admin_scopes(AdminAccessScope.SEND_REMINDERS))):
    """Check if email is configured and ready to send."""
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
    """
    Send email reminders to all active volunteers who haven't submitted yet.
    Available to operations staff and admins.
    """
    if not is_email_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email is not configured. Set SMTP_USERNAME and SMTP_PASSWORD in .env",
        )

    target_week = week_id or get_week_id()
    deadline = get_submission_deadline(target_week)
    deadline_str = deadline.strftime("%A, %B %d at %I:%M %p")
    settings = get_settings()

    # Get all active volunteers
    all_users = await User.find(
        User.is_active == True,
        User.role == UserRole.VOLUNTEER,
    ).to_list()

    # Get submissions for this week
    week_submissions = await Submission.find(
        Submission.week_id == target_week,
        Submission.status != SubmissionStatus.DRAFT,
    ).to_list()
    submitted_user_ids = {s.user_id for s in week_submissions}

    # Filter to volunteers who haven't submitted
    needs_reminder = [
        u for u in all_users
        if str(u.id) not in submitted_user_ids
    ]

    if not needs_reminder:
        return ReminderResponse(
            success=True,
            total_volunteers=len(all_users),
            already_submitted=len(submitted_user_ids),
            reminders_sent=0,
            message=f"All volunteers have already submitted for {target_week}!",
        )

    # Build and send emails
    emails_to_send = []
    for user in needs_reminder:
        html = build_reminder_html(
            volunteer_name=user.name,
            week_id=target_week,
            deadline_str=deadline_str,
            portal_url=settings.frontend_url,
        )
        emails_to_send.append((user.email, html))

    # Send one-by-one (personalized content)
    total_sent = 0
    errors = []
    for email_addr, html_body in emails_to_send:
        result = send_email(
            to_emails=[email_addr],
            subject=f"📋 Weekly Check-in Reminder — {target_week}",
            html_body=html_body,
        )
        if result.get("sent_to"):
            total_sent += 1
        if result.get("errors"):
            errors.extend(result["errors"])

    logger.info(
        f"Reminders sent for {target_week}: {total_sent}/{len(needs_reminder)} "
        f"({len(submitted_user_ids)} already submitted)"
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
