"""
Pytest configuration and fixtures for backend tests.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock

from app.core.time import utc_now
from app.models.user import User, UserRole
from app.models.submission import Submission, WorkEntry


@pytest.fixture(scope="function")
def event_loop():
    """Create a fresh event loop per async test to prevent cross-test interference."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()
    asyncio.set_event_loop(None)


@pytest.fixture
def mock_user():
    """Create a mock user for testing."""
    user = MagicMock(spec=User)
    user.id = "test-user-id-123"
    user.email = "testuser@example.com"
    user.name = "Test User"
    user.role = UserRole.VOLUNTEER
    user.is_active = True
    user.total_hours = 10.5
    user.total_submissions = 3
    user.created_at = utc_now()
    user.last_login = utc_now()
    return user


@pytest.fixture
def mock_admin_user():
    """Create a mock admin user for testing."""
    user = MagicMock(spec=User)
    user.id = "admin-user-id-456"
    user.email = "admin@guardiansembrace.org"
    user.name = "Admin User"
    user.role = UserRole.ADMIN
    user.is_active = True
    user.total_hours = 50.0
    user.total_submissions = 10
    user.created_at = utc_now()
    user.last_login = utc_now()
    return user


@pytest.fixture
def sample_work_entries():
    """Create sample work entries for testing."""
    return [
        WorkEntry(
            description="Created volunteer portal wireframes",
            hours=4.0,
            drive_link="https://drive.google.com/file/d/123",
            tags=["design", "ui"]
        ),
        WorkEntry(
            description="Reviewed PR for authentication",
            hours=1.5,
            tags=["code-review"]
        ),
    ]


@pytest.fixture
def mock_submission(mock_user, sample_work_entries):
    """Create a mock submission for testing."""
    submission = MagicMock(spec=Submission)
    submission.id = "submission-id-789"
    submission.user_id = mock_user.id
    submission.user_email = mock_user.email
    submission.user_name = mock_user.name
    submission.week_id = "2026-W04"
    submission.week_start = datetime(2026, 1, 19)
    submission.week_end = datetime(2026, 1, 25)
    submission.past_work = sample_work_entries
    submission.present_work = []
    submission.future_work = []
    submission.total_hours = 5.5
    submission.status = "draft"
    submission.created_at = utc_now()
    submission.updated_at = utc_now()
    return submission
