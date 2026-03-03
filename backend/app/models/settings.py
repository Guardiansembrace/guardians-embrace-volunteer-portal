from typing import List, Optional, Dict, Any
from beanie import Document
from pydantic import BaseModel, Field

class FormSection(BaseModel):
    id: str
    title: str
    subtitle: Optional[str] = None
    icon: Optional[str] = None
    type: str = "work_entries"  # "work_entries", "text_area", "project_link", "custom_fields"
    showHours: bool = False
    required: bool = False
    
    # For custom single fields inside a section (if type != work_entries)
    fields: Optional[List[Dict[str, Any]]] = None

class AdminSettings(Document):
    """
    Singleton document to store global configurations.
    """
    settings_id: str = "global"
    
    # Tags available for work entries
    tags: List[str] = [
        "Outreach", "Admin", "Events", "Tech", 
        "Fundraising", "Training", "Social Media", "Research", "Mentoring", "Other"
    ]
    
    # Projects available to link to
    active_projects: List[str] = []
    
    # Dynamic form sections for the submission page
    form_sections: List[FormSection] = [
        FormSection(id="past", title="Past Work", subtitle="What was done", icon="📋", type="work_entries", showHours=True),
        FormSection(id="present", title="Present Work", subtitle="In progress", icon="🔄", type="work_entries", showHours=True),
        FormSection(id="future", title="Future Work", subtitle="Planned", icon="🎯", type="work_entries", showHours=False)
    ]

    class Settings:
        name = "admin_settings"
