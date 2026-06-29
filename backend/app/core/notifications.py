"""
Helpers for creating in-app notifications and sending notification emails.
Email sends run inline (awaited) so they are guaranteed to complete before the
Lambda container is frozen — asyncio.create_task cannot be relied on in Lambda.
"""

import logging
from typing import Optional

from app.core.config import get_settings
from app.core.email import (
    build_account_status_html,
    build_admin_comment_html,
    build_join_request_received_html,
    build_join_request_reviewed_html,
    build_member_added_html,
    build_member_removed_html,
    build_role_changed_html,
    build_submission_reviewed_html,
    build_work_item_assigned_html,
    is_email_configured,
    send_email,
)
from app.models.notification import Notification, NotificationType

logger = logging.getLogger(__name__)


async def _send_email_inline(to_email: str, subject: str, html: str) -> None:
    """Send one email synchronously — errors are logged, not raised."""
    try:
        result = send_email([to_email], subject, html)
        if not result.get("success"):
            logger.warning("Notification email to %s failed: %s", to_email, result.get("errors"))
    except Exception:
        logger.exception("Unexpected error sending notification email to %s", to_email)


async def create_notification(
    user_id: str,
    notif_type: NotificationType,
    title: str,
    body: str,
    link: Optional[str] = None,
) -> Notification:
    notif = Notification(
        user_id=user_id,
        type=notif_type,
        title=title,
        body=body,
        link=link,
    )
    await notif.insert()
    logger.info("Notification created: id=%s user_id=%s type=%s", notif.id, user_id, notif_type)
    return notif


async def notify_submission_reviewed(
    submission_user_id: str,
    submission_user_name: str,
    submission_user_email: str,
    week_id: str,
    submission_id: str,
    admin_notes: Optional[str],
    notif_pref: bool,
) -> None:
    """Notify a volunteer that their submission was reviewed."""
    link = f"/submissions/{submission_id}"
    title = f"Submission reviewed — {week_id}"
    body = admin_notes or "Your submission has been reviewed."

    await create_notification(
        user_id=submission_user_id,
        notif_type=NotificationType.SUBMISSION_REVIEWED,
        title=title,
        body=body,
        link=link,
    )

    if notif_pref and is_email_configured():
        settings = get_settings()
        html = build_submission_reviewed_html(
            volunteer_name=submission_user_name,
            week_id=week_id,
            admin_notes=admin_notes,
            portal_url=settings.frontend_url,
            submission_id=submission_id,
        )
        await _send_email_inline(
            submission_user_email,
            f"Your submission for {week_id} has been reviewed",
            html,
        )


async def notify_admin_comment(
    submission_user_id: str,
    submission_user_name: str,
    submission_user_email: str,
    commenter_name: str,
    week_id: str,
    submission_id: str,
    comment_preview: str,
    notif_pref: bool,
) -> None:
    """Notify a volunteer that an admin left a comment on their submission."""
    link = f"/submissions/{submission_id}"
    title = f"{commenter_name} commented on your submission"
    body = comment_preview[:120] + ("…" if len(comment_preview) > 120 else "")

    await create_notification(
        user_id=submission_user_id,
        notif_type=NotificationType.ADMIN_COMMENT,
        title=title,
        body=body,
        link=link,
    )

    if notif_pref and is_email_configured():
        settings = get_settings()
        html = build_admin_comment_html(
            volunteer_name=submission_user_name,
            commenter_name=commenter_name,
            week_id=week_id,
            comment_preview=comment_preview,
            portal_url=settings.frontend_url,
            submission_id=submission_id,
        )
        await _send_email_inline(
            submission_user_email,
            f"{commenter_name} commented on your submission",
            html,
        )


async def notify_join_request_reviewed(
    requester_user_id: str,
    requester_name: str,
    requester_email: str,
    project_name: str,
    project_id: str,
    approved: bool,
    notif_pref: bool,
    request_type: str = "access",
) -> None:
    """Notify a volunteer that their access/lead/delete request was reviewed."""
    status_label = "approved" if approved else "declined"
    # Phrase the request by type so leadership and deletion requests don't read
    # as "request to join".
    action = {"access": "join", "lead": "lead", "delete": "delete"}.get(request_type, "join")
    kind_label = {"access": "Join", "lead": "Leadership", "delete": "Deletion"}.get(request_type, "Join")
    link = f"/projects/{project_id}"
    title = f"{kind_label} request {status_label} — {project_name}"
    body = (
        f"Your request to {action} {project_name} was {status_label}."
        if approved
        else f"Your request to {action} {project_name} was not approved."
    )

    await create_notification(
        user_id=requester_user_id,
        notif_type=NotificationType.JOIN_REQUEST_REVIEWED,
        title=title,
        body=body,
        link=link,
    )

    if notif_pref and is_email_configured():
        settings = get_settings()
        html = build_join_request_reviewed_html(
            volunteer_name=requester_name,
            project_name=project_name,
            approved=approved,
            portal_url=settings.frontend_url,
            project_id=project_id,
            request_type=request_type,
        )
        await _send_email_inline(
            requester_email,
            f"Your join request for {project_name} was {status_label}",
            html,
        )


async def notify_join_request_received(
    admin_user_id: str,
    admin_name: str,
    admin_email: str,
    requester_name: str,
    project_name: str,
    project_id: str,
    request_type: str,
    join_request_id: str,
    notif_pref: bool,
) -> None:
    """Notify an admin/manager that a new join request was submitted."""
    # Deep-link to the project board's Requests tab where the pending-requests
    # panel lives (there is no standalone /join-requests route).
    link = f"/projects/{project_id}?tab=requests"
    title = f"New {request_type} request for {project_name}"
    body = f"{requester_name} has requested {request_type} access to {project_name}."

    await create_notification(
        user_id=admin_user_id,
        notif_type=NotificationType.JOIN_REQUEST_RECEIVED,
        title=title,
        body=body,
        link=link,
    )

    if notif_pref and is_email_configured():
        settings = get_settings()
        html = build_join_request_received_html(
            admin_name=admin_name,
            requester_name=requester_name,
            project_name=project_name,
            request_type=request_type,
            portal_url=settings.frontend_url,
            project_id=project_id,
        )
        await _send_email_inline(
            admin_email,
            f"New join request for {project_name} from {requester_name}",
            html,
        )


async def notify_member_added(
    user_id: str,
    user_name: str,
    user_email: str,
    project_name: str,
    project_id: str,
    added_by_name: str,
    notif_pref: bool,
) -> None:
    await create_notification(
        user_id=user_id,
        notif_type=NotificationType.MEMBER_ADDED,
        title=f"Added to project — {project_name}",
        body=f"{added_by_name} added you to {project_name}.",
        link=f"/projects/{project_id}",
    )
    if notif_pref and is_email_configured():
        settings = get_settings()
        html = build_member_added_html(
            member_name=user_name,
            project_name=project_name,
            project_id=project_id,
            added_by_name=added_by_name,
            portal_url=settings.frontend_url,
        )
        await _send_email_inline(user_email, f"You've been added to {project_name}", html)


async def notify_member_removed(
    user_id: str,
    user_name: str,
    user_email: str,
    project_name: str,
    removed_by_name: str,
    notif_pref: bool,
) -> None:
    await create_notification(
        user_id=user_id,
        notif_type=NotificationType.MEMBER_REMOVED,
        title=f"Removed from project — {project_name}",
        body=f"{removed_by_name} removed you from {project_name}.",
        link="/projects",
    )
    if notif_pref and is_email_configured():
        settings = get_settings()
        html = build_member_removed_html(
            member_name=user_name,
            project_name=project_name,
            removed_by_name=removed_by_name,
            portal_url=settings.frontend_url,
        )
        await _send_email_inline(user_email, f"You've been removed from {project_name}", html)


async def notify_work_item_assigned(
    user_id: str,
    user_name: str,
    user_email: str,
    work_item_title: str,
    project_name: str,
    project_id: str,
    assigned_by_name: str,
    notif_pref: bool,
) -> None:
    await create_notification(
        user_id=user_id,
        notif_type=NotificationType.WORK_ITEM_ASSIGNED,
        title=f"Work item assigned — {work_item_title}",
        body=f"{assigned_by_name} assigned you to '{work_item_title}' in {project_name}.",
        link=f"/projects/{project_id}",
    )
    if notif_pref and is_email_configured():
        settings = get_settings()
        html = build_work_item_assigned_html(
            assignee_name=user_name,
            work_item_title=work_item_title,
            project_name=project_name,
            project_id=project_id,
            assigned_by_name=assigned_by_name,
            portal_url=settings.frontend_url,
        )
        await _send_email_inline(user_email, f"Work item assigned: {work_item_title}", html)


async def notify_work_item_status_changed(
    user_id: str,
    user_name: str,
    user_email: str,
    work_item_title: str,
    project_name: str,
    project_id: str,
    new_status: str,
    changed_by_name: str,
    notif_pref: bool,
) -> None:
    status_label = new_status.replace("_", " ").title()
    await create_notification(
        user_id=user_id,
        notif_type=NotificationType.WORK_ITEM_STATUS_CHANGED,
        title=f"Work item status changed — {work_item_title}",
        body=f"{changed_by_name} moved '{work_item_title}' to {status_label} in {project_name}.",
        link=f"/projects/{project_id}",
    )
    if notif_pref and is_email_configured():
        settings = get_settings()
        html = build_work_item_assigned_html(
            assignee_name=user_name,
            work_item_title=work_item_title,
            project_name=project_name,
            project_id=project_id,
            assigned_by_name=f"{changed_by_name} (status → {status_label})",
            portal_url=settings.frontend_url,
        )
        await _send_email_inline(user_email, f"Work item status update: {work_item_title}", html)


async def notify_role_changed(
    user_id: str,
    user_name: str,
    user_email: str,
    old_role: str,
    new_role: str,
    notif_pref: bool,
) -> None:
    role_labels = {"volunteer": "Volunteer", "team_lead": "Team Lead", "admin": "Administrator"}
    new_label = role_labels.get(new_role, new_role.title())
    await create_notification(
        user_id=user_id,
        notif_type=NotificationType.ROLE_CHANGED,
        title=f"Your role has been updated to {new_label}",
        body=f"An admin changed your portal role from {role_labels.get(old_role, old_role)} to {new_label}.",
        link="/dashboard",
    )
    if notif_pref and is_email_configured():
        settings = get_settings()
        html = build_role_changed_html(
            user_name=user_name,
            old_role=old_role,
            new_role=new_role,
            portal_url=settings.frontend_url,
        )
        await _send_email_inline(user_email, f"Your portal role has been updated to {new_label}", html)


async def notify_account_status_changed(
    user_id: str,
    user_name: str,
    user_email: str,
    activated: bool,
    notif_pref: bool,
) -> None:
    action = "reactivated" if activated else "deactivated"
    await create_notification(
        user_id=user_id,
        notif_type=NotificationType.ACCOUNT_STATUS_CHANGED,
        title=f"Your account has been {action}",
        body=(
            "Your account is now active — you can log in to the portal."
            if activated
            else "Your account has been deactivated. Contact an admin if you think this is a mistake."
        ),
        link="/dashboard" if activated else None,
    )
    if notif_pref and is_email_configured():
        settings = get_settings()
        html = build_account_status_html(
            user_name=user_name,
            activated=activated,
            portal_url=settings.frontend_url,
        )
        await _send_email_inline(user_email, f"Your Guardian's Embrace account has been {action}", html)
