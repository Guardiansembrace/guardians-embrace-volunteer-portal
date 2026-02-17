"""API routes module."""

from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.submissions import router as submissions_router
from app.api.comments import router as comments_router
from app.api.files import router as files_router
from app.api.notifications import router as notifications_router

__all__ = [
    "auth_router",
    "users_router",
    "submissions_router",
    "comments_router",
    "files_router",
    "notifications_router",
]
