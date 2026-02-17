"""
Utility functions for date/time and week calculations.
"""

from datetime import datetime, timedelta
from typing import Tuple

from app.core.config import get_settings


def get_week_id(date: datetime = None) -> str:
    """
    Get the week identifier for a given date.
    Format: "YYYY-WNN" (e.g., "2026-W04")
    """
    if date is None:
        date = datetime.utcnow()
    
    year, week, _ = date.isocalendar()
    return f"{year}-W{week:02d}"


def get_previous_week_id(week_id: str = None) -> str:
    """
    Get the week ID for the week before the given week.
    E.g. "2026-W08" -> "2026-W07", "2026-W01" -> "2025-W52/53"
    """
    if week_id is None:
        week_id = get_week_id()
    week_start, _ = get_week_boundaries(week_id)
    prev_date = week_start - timedelta(days=1)  # Sunday of previous week
    return get_week_id(prev_date)


def get_week_boundaries(week_id: str = None) -> Tuple[datetime, datetime]:
    """
    Get the start and end datetime for a week.
    If no week_id provided, uses current week.
    
    Returns: (week_start, week_end)
    """
    if week_id is None:
        week_id = get_week_id()
    
    # Parse week_id (e.g., "2026-W04")
    year = int(week_id[:4])
    week = int(week_id[6:])
    
    # Get first day of the week (Monday)
    # ISO week starts on Monday
    jan_4 = datetime(year, 1, 4)  # Jan 4 is always in week 1
    week_start = jan_4 + timedelta(weeks=week - 1, days=-jan_4.weekday())
    
    # Week ends on Sunday at 23:59:59
    week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)
    
    return week_start, week_end


def is_submission_window_open() -> bool:
    """
    Check if submissions are allowed.
    Always returns True - volunteers can submit anytime.
    
    Note: The Friday-Sunday window was originally planned but 
    the decision was made to allow submissions at any time.
    """
    return True


def get_submission_deadline() -> datetime:
    """Get the deadline for the current week's submission."""
    settings = get_settings()
    
    now = datetime.utcnow()
    current_day = now.weekday()
    
    day_map = {
        "monday": 0, "tuesday": 1, "wednesday": 2,
        "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6
    }
    
    end_day = day_map.get(settings.weekly_update_end_day.lower(), 6)  # Default Sunday
    
    # Calculate days until deadline
    days_until_deadline = (end_day - current_day) % 7
    if days_until_deadline == 0 and now.hour >= 23:
        days_until_deadline = 7  # Next week
    
    deadline = now + timedelta(days=days_until_deadline)
    deadline = deadline.replace(hour=23, minute=59, second=59, microsecond=0)
    
    return deadline
