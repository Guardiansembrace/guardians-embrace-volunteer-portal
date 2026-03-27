"""Core module exports."""

from app.core.config import get_settings, Settings
from app.core.database import db, get_database
from app.core.security import (
    get_current_user,
    get_current_admin_user,
    get_current_operations_user,
    create_access_token,
    decode_access_token,
)
from app.core.admin_access import (
    get_current_admin_portal_user,
    get_admin_access_context,
    require_admin_scopes,
)

__all__ = [
    "get_settings",
    "Settings",
    "db",
    "get_database",
    "get_current_user",
    "get_current_admin_user",
    "get_current_operations_user",
    "get_current_admin_portal_user",
    "get_admin_access_context",
    "require_admin_scopes",
    "create_access_token",
    "decode_access_token",
]
