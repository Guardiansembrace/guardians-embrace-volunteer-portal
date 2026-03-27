"""
Admin Settings API endpoints.
Provides dynamic forms, categories, and tags.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from app.core.admin_access import AdminAccessScope, require_admin_scopes
from app.core.rate_limit import rate_limit_by_user
from app.core.weekly_updates import hydrate_weekly_update_settings, set_weekly_update_settings
from app.models.settings import AdminSettings, FormSection
from app.models.user import User
from app.core.security import get_current_user
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/settings", tags=["Settings"])

class SettingsUpdateResponse(BaseModel):
    success: bool
    settings: AdminSettings

@router.get("", response_model=AdminSettings)
async def get_settings(current_user: User = Depends(get_current_user)):
    """Get the global admin settings. Available to all authenticated users so frontend can render dynamic forms."""
    settings = await AdminSettings.find_one({"settings_id": "global"})
    if not settings:
        # Create a default one if it doesn't exist yet
        settings = AdminSettings()
        await settings.insert()
    hydrate_weekly_update_settings(settings)
    return settings

@router.put(
    "",
    response_model=SettingsUpdateResponse,
    dependencies=[Depends(rate_limit_by_user("settings_writes"))],
)
async def update_settings(
    update_data: AdminSettings,
    current_admin: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_SETTINGS))
):
    """
    Update global admin settings. 
    Allows admins to change form structures, tags, etc.
    """
    settings = await AdminSettings.find_one({"settings_id": "global"})
    
    if not settings:
        settings = AdminSettings()
    
    # Update properties
    settings.tags = update_data.tags
    settings.active_projects = update_data.active_projects
    settings.form_sections = update_data.form_sections
    settings.weekly_updates = update_data.weekly_updates
    
    await settings.save()
    set_weekly_update_settings(settings.weekly_updates)
    
    return {"success": True, "settings": settings}
