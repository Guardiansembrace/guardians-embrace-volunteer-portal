"""
Utility functions for date/time and weekly update calculations.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Tuple
from zoneinfo import ZoneInfo

from app.core.config import get_settings
from app.core.time import utc_now
from app.core.weekly_updates import get_weekly_update_settings

DAY_MAP = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def get_schedule_now() -> datetime:
    """
    Return the current local time for weekly update calculations.

    The app stores datetimes without timezone info, so this helper returns a
    naive datetime in the configured schedule timezone.
    """
    settings = get_weekly_update_settings()

    timezone: ZoneInfo | None = None

    for timezone_name in (settings.timezone, get_settings().timezone):
        try:
            timezone = ZoneInfo(timezone_name)
            break
        except Exception:
            continue

    if timezone is None:
        return utc_now()

    return utc_now().replace(tzinfo=UTC).astimezone(timezone).replace(tzinfo=None)


def get_week_id(date: datetime | None = None) -> str:
    """
    Get the week identifier for a given date.
    Format: "YYYY-WNN" (e.g. "2026-W04")
    """
    target = date or get_schedule_now()
    year, week, _ = target.isocalendar()
    return f"{year}-W{week:02d}"


def get_previous_week_id(week_id: str | None = None) -> str:
    """
    Get the week ID for the week before the given week.
    """
    current_week_id = week_id or get_week_id()
    week_start, _ = get_week_boundaries(current_week_id)
    prev_date = week_start - timedelta(days=1)
    return get_week_id(prev_date)


def get_week_boundaries(week_id: str | None = None) -> Tuple[datetime, datetime]:
    """
    Get the start and end datetime for an ISO week in local schedule time.
    """
    current_week_id = week_id or get_week_id()
    year = int(current_week_id[:4])
    week = int(current_week_id[6:])

    jan_4 = datetime(year, 1, 4)
    week_start = jan_4 + timedelta(weeks=week - 1, days=-jan_4.weekday())
    week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)

    return week_start, week_end


def get_submission_window_bounds(week_id: str | None = None) -> Tuple[datetime, datetime]:
    """
    Get the local start and deadline datetimes for a weekly submission window.
    """
    settings = get_weekly_update_settings()
    week_start, _ = get_week_boundaries(week_id)

    open_day_offset = DAY_MAP.get(settings.submissions_open_day.lower(), 4)
    deadline_day_offset = DAY_MAP.get(settings.deadline_day.lower(), 6)

    window_start = week_start + timedelta(
        days=open_day_offset,
        hours=settings.submissions_open_hour,
        minutes=settings.submissions_open_minute,
    )
    deadline = week_start + timedelta(
        days=deadline_day_offset,
        hours=settings.deadline_hour,
        minutes=settings.deadline_minute,
        seconds=59,
    )

    if deadline < window_start:
        deadline += timedelta(days=7)

    return window_start, deadline


def get_submission_deadline(week_id: str | None = None) -> datetime:
    """Get the configured submission deadline for a given week."""
    _, deadline = get_submission_window_bounds(week_id)
    return deadline


def is_submission_window_open(week_id: str | None = None, now: datetime | None = None) -> bool:
    """
    Check if submissions are currently inside the configured live window.
    """
    settings = get_weekly_update_settings()
    if settings.window_mode == "always_open":
        return True

    current_time = now or get_schedule_now()
    target_week_id = week_id or get_week_id(current_time)
    window_start, deadline = get_submission_window_bounds(target_week_id)
    return window_start <= current_time <= deadline


def can_submit_for_week(week_id: str | None = None, now: datetime | None = None) -> bool:
    """
    Check if a user can still create or submit an update for the given week.
    """
    current_time = now or get_schedule_now()
    if is_submission_window_open(week_id, current_time):
        return True

    settings = get_weekly_update_settings()
    if not settings.allow_late_submissions:
        return False

    return current_time > get_submission_deadline(week_id or get_week_id(current_time))
