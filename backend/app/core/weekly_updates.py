"""
Runtime cache for weekly update scheduling settings.
"""

from __future__ import annotations

from app.core.config import get_settings
from app.models.settings import AdminSettings, WeeklyUpdateSettings

_cached_weekly_updates = WeeklyUpdateSettings(
    submissions_open_day=get_settings().weekly_update_start_day.lower(),
    deadline_day=get_settings().weekly_update_end_day.lower(),
    timezone=get_settings().timezone,
)


def get_weekly_update_settings() -> WeeklyUpdateSettings:
    return _cached_weekly_updates


def set_weekly_update_settings(settings: WeeklyUpdateSettings) -> WeeklyUpdateSettings:
    global _cached_weekly_updates
    _cached_weekly_updates = settings
    return _cached_weekly_updates


def hydrate_weekly_update_settings(settings_doc: AdminSettings | None) -> WeeklyUpdateSettings:
    if settings_doc is None:
        return _cached_weekly_updates
    return set_weekly_update_settings(settings_doc.weekly_updates)
