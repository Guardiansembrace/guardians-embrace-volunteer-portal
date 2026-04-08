from typing import Any, Dict, List, Literal, Optional
from beanie import Document
from pydantic import BaseModel, Field

DayOfWeek = Literal[
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]

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


class WeeklyUpdateSettings(BaseModel):
    window_mode: Literal["always_open", "scheduled"] = "always_open"
    submissions_open_day: DayOfWeek = "friday"
    submissions_open_hour: int = Field(default=0, ge=0, le=23)
    submissions_open_minute: int = Field(default=0, ge=0, le=59)
    deadline_day: DayOfWeek = "sunday"
    deadline_hour: int = Field(default=23, ge=0, le=23)
    deadline_minute: int = Field(default=59, ge=0, le=59)
    allow_late_submissions: bool = True
    timezone: str = "America/New_York"

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

    weekly_updates: WeeklyUpdateSettings = Field(default_factory=WeeklyUpdateSettings)

    class Settings:
        name = "admin_settings"
