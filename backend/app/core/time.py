"""
Time utilities for consistent UTC handling across the backend.
"""

from datetime import UTC, datetime


def utc_now() -> datetime:
    """
    Return the current UTC timestamp as a naive datetime.

    The app currently persists naive UTC datetimes in MongoDB, so this keeps
    behavior stable while avoiding deprecated ``datetime.utcnow()`` calls.
    """
    return datetime.now(UTC).replace(tzinfo=None)
