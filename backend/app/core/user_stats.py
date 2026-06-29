"""Helpers for keeping denormalized user submission stats in sync."""

from __future__ import annotations

import logging

from bson import ObjectId

from app.core.submission_hours import get_current_hour_tracking_sections, sync_submission_total_hours
from app.core.utils import get_previous_week_id, get_week_boundaries
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User

logger = logging.getLogger(__name__)


async def calculate_user_submission_stats(user_id: str) -> tuple[int, float, int]:
    """Return submitted count, total hours, and streak for a user."""
    submitted_entries = await Submission.find(
        Submission.user_id == user_id,
        Submission.status != SubmissionStatus.DRAFT,
    ).to_list()

    total_submissions = len(submitted_entries)
    total_hours = 0.0
    tracked_sections = await get_current_hour_tracking_sections()
    for submission in submitted_entries:
        previous_snapshot = (
            getattr(submission, "reported_hours", None),
            getattr(submission, "credited_hours", None),
            getattr(submission, "total_hours", None),
            tuple(getattr(submission, "hour_tracking_sections", []) or []),
        )
        try:
            sync_submission_total_hours(submission, tracked_sections)
            total_hours += getattr(submission, "credited_hours", submission.total_hours)
        except Exception:
            logger.warning(
                "Failed to recalculate hours for submission %s while syncing user stats",
                getattr(submission, "id", None),
                exc_info=True,
            )
            total_hours += getattr(submission, "credited_hours", submission.total_hours)
            continue

        next_snapshot = (
            getattr(submission, "reported_hours", None),
            getattr(submission, "credited_hours", None),
            getattr(submission, "total_hours", None),
            tuple(getattr(submission, "hour_tracking_sections", []) or []),
        )
        if next_snapshot != previous_snapshot:
            try:
                await submission.save()
            except Exception:
                logger.warning(
                    "Failed to persist synced hours for submission %s while syncing user stats",
                    getattr(submission, "id", None),
                    exc_info=True,
                )

    if not submitted_entries:
        return total_submissions, total_hours, 0

    submitted_week_ids = {entry.week_id for entry in submitted_entries}
    latest_week_id = max(
        submitted_week_ids,
        key=lambda candidate_week_id: get_week_boundaries(candidate_week_id)[0],
    )

    streak = 0
    week_cursor = latest_week_id
    while week_cursor in submitted_week_ids:
        streak += 1
        week_cursor = get_previous_week_id(week_cursor)

    return total_submissions, total_hours, streak


async def sync_user_submission_stats(user: User) -> bool:
    """Recalculate and persist denormalized submission stats when they changed."""
    total_submissions, total_hours, submission_streak = await calculate_user_submission_stats(str(user.id))

    if (
        user.total_submissions == total_submissions
        and user.total_hours == total_hours
        and user.submission_streak == submission_streak
    ):
        return False

    user.total_submissions = total_submissions
    user.total_hours = total_hours
    user.submission_streak = submission_streak
    await user.save()
    return True


async def sync_user_submission_stats_by_user_id(user_id: str) -> bool:
    """Load a user by id and sync their denormalized submission stats."""
    try:
        user = await User.get(ObjectId(user_id))
    except Exception:
        user = None

    if user is None:
        return False

    return await sync_user_submission_stats(user)
