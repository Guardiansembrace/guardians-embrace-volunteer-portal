"""
Admin Settings API endpoints.
Provides dynamic forms, categories, and tags.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from app.models.settings import AdminSettings, FormSection
from app.models.user import User
from app.core.security import get_current_user, get_current_admin_user
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/settings", tags=["Settings"])

class SettingsUpdateResponse(BaseModel):
    success: bool
    settings: AdminSettings

@router.get("", response_model=AdminSettings)
async def get_settings(current_user: User = Depends(get_current_user)):
    """Get the global admin settings. Available to all authenticated users so frontend can render dynamic forms."""
    settings = await AdminSettings.find_one(AdminSettings.settings_id == "global")
    if not settings:
        # Create a default one if it doesn't exist yet
        settings = AdminSettings()
        await settings.insert()
    return settings

@router.put("", response_model=SettingsUpdateResponse)
async def update_settings(
    update_data: AdminSettings,
    current_admin: User = Depends(get_current_admin_user)
):
    """
    Update global admin settings. 
    Allows admins to change form structures, tags, etc.
    """
    settings = await AdminSettings.find_one(AdminSettings.settings_id == "global")
    
    if not settings:
        settings = AdminSettings()
    
    # Update properties
    settings.tags = update_data.tags
    settings.active_projects = update_data.active_projects
    settings.form_sections = update_data.form_sections
    
    await settings.save()
    
    return {"success": True, "settings": settings}
