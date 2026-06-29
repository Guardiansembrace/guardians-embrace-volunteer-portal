"""
Tests for utility functions.
"""

import pytest
from datetime import datetime

from app.core.utils import can_submit_for_week, get_week_boundaries, get_week_id, is_submission_window_open
from app.core.weekly_updates import get_weekly_update_settings, set_weekly_update_settings
from app.models.settings import WeeklyUpdateSettings
from app.models.submission import Submission


@pytest.fixture(autouse=True)
def reset_weekly_update_settings():
    """Keep tests isolated from runtime schedule changes made in other modules."""
    original = get_weekly_update_settings()
    set_weekly_update_settings(WeeklyUpdateSettings())
    try:
        yield
    finally:
        set_weekly_update_settings(original)


class TestGetWeekId:
    """Tests for get_week_id function."""
    
    def test_returns_correct_format(self):
        """Week ID should be in YYYY-WNN format."""
        date = datetime(2026, 1, 25)  # Saturday, Week 4
        result = get_week_id(date)
        assert result == "2026-W04"
    
    def test_week_one(self):
        """First week of year should be W01."""
        # ISO week 1 contains the first Thursday of the year
        # For 2026, week 1 starts Dec 29, 2025
        date = datetime(2025, 12, 31)  # Thursday of week 1, 2026
        result = get_week_id(date)
        assert result == "2026-W01"
    
    def test_week_52(self):
        """Last week should be W52 or W53."""
        date = datetime(2025, 12, 29)  # Week 52/53 of 2025
        result = get_week_id(date)
        assert result.startswith("202")  # Valid year prefix
        assert "-W" in result
    
    def test_uses_current_date_when_none(self):
        """Should use current date if none provided."""
        result = get_week_id()
        assert result is not None
        assert len(result) == 8  # "YYYY-WNN"


class TestGetWeekBoundaries:
    """Tests for get_week_boundaries function."""
    
    def test_returns_monday_to_sunday(self):
        """Week should start Monday, end Sunday."""
        week_start, week_end = get_week_boundaries("2026-W04")
        
        assert week_start.weekday() == 0  # Monday
        assert week_end.weekday() == 6  # Sunday
    
    def test_week_span_is_7_days(self):
        """Week should span 7 days."""
        week_start, week_end = get_week_boundaries("2026-W04")
        
        delta = week_end - week_start
        assert delta.days == 6  # Sunday - Monday = 6 days
    
    def test_specific_week(self):
        """Test specific known week."""
        week_start, week_end = get_week_boundaries("2026-W04")
        
        # Week 4 of 2026 starts January 19 (Monday)
        assert week_start.year == 2026
        assert week_start.month == 1
        assert week_start.day == 19


class TestIsSubmissionWindowOpen:
    """Tests for is_submission_window_open function."""
    
    def test_always_returns_true(self):
        """Submission window is always open (no restrictions)."""
        result = is_submission_window_open()
        assert result is True

    def test_scheduled_window_respects_open_and_close_times(self):
        """Scheduled mode should only open between the configured start and deadline."""
        original = get_weekly_update_settings()
        try:
            set_weekly_update_settings(
                WeeklyUpdateSettings(
                    window_mode="scheduled",
                    submissions_open_day="friday",
                    submissions_open_hour=9,
                    submissions_open_minute=0,
                    deadline_day="sunday",
                    deadline_hour=20,
                    deadline_minute=0,
                    allow_late_submissions=False,
                    timezone="America/New_York",
                )
            )

            assert is_submission_window_open("2026-W12", datetime(2026, 3, 20, 8, 59)) is False
            assert is_submission_window_open("2026-W12", datetime(2026, 3, 20, 9, 0)) is True
            assert is_submission_window_open("2026-W12", datetime(2026, 3, 22, 20, 1)) is False
        finally:
            set_weekly_update_settings(original)


def test_submission_model_defaults_project_id_for_legacy_records():
    assert Submission.model_fields["project_id"].default == ""

    def test_can_submit_for_week_honors_late_submission_setting(self):
        """Late submissions should remain available only when explicitly allowed."""
        original = get_weekly_update_settings()
        try:
            set_weekly_update_settings(
                WeeklyUpdateSettings(
                    window_mode="scheduled",
                    submissions_open_day="friday",
                    submissions_open_hour=9,
                    submissions_open_minute=0,
                    deadline_day="sunday",
                    deadline_hour=20,
                    deadline_minute=0,
                    allow_late_submissions=True,
                    timezone="America/New_York",
                )
            )
            assert can_submit_for_week("2026-W12", datetime(2026, 3, 22, 20, 1)) is True

            set_weekly_update_settings(
                WeeklyUpdateSettings(
                    window_mode="scheduled",
                    submissions_open_day="friday",
                    submissions_open_hour=9,
                    submissions_open_minute=0,
                    deadline_day="sunday",
                    deadline_hour=20,
                    deadline_minute=0,
                    allow_late_submissions=False,
                    timezone="America/New_York",
                )
            )
            assert can_submit_for_week("2026-W12", datetime(2026, 3, 22, 20, 1)) is False
        finally:
            set_weekly_update_settings(original)
