"""
Tests for data models.
"""

import pytest
from datetime import datetime

from app.models.user import UserRole
from app.models.submission import WorkEntry


class TestUserRole:
    """Tests for UserRole enum."""
    
    def test_volunteer_is_default(self):
        """Volunteer should be a valid role."""
        assert UserRole.VOLUNTEER.value == "volunteer"
    
    def test_admin_role_exists(self):
        """Admin role should exist."""
        assert UserRole.ADMIN.value == "admin"
    
    def test_team_lead_role_exists(self):
        """Team lead role should exist."""
        assert UserRole.TEAM_LEAD.value == "team_lead"


class TestWorkEntry:
    """Tests for WorkEntry model."""
    
    def test_create_minimal_entry(self):
        """Should create entry with just description and hours."""
        entry = WorkEntry(
            description="Did some work",
            hours=2.0
        )
        assert entry.description == "Did some work"
        assert entry.hours == 2.0
        assert entry.drive_link is None
        assert entry.tags == []
    
    def test_create_full_entry(self):
        """Should create entry with all fields."""
        entry = WorkEntry(
            description="Created design document",
            hours=3.5,
            drive_link="https://drive.google.com/file/xyz",
            tags=["design", "documentation"]
        )
        assert entry.description == "Created design document"
        assert entry.hours == 3.5
        assert entry.drive_link == "https://drive.google.com/file/xyz"
        assert "design" in entry.tags
    
    def test_hours_can_be_decimal(self):
        """Hours should support decimal values."""
        entry = WorkEntry(description="Test", hours=1.25)
        assert entry.hours == 1.25
    
    def test_hours_can_be_zero(self):
        """Hours can be zero for future work."""
        entry = WorkEntry(description="Planned task", hours=0)
        assert entry.hours == 0
