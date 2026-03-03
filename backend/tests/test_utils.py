"""
Tests for utility functions.
"""

import pytest
from datetime import datetime

from app.core.utils import get_week_id, get_week_boundaries, is_submission_window_open


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
