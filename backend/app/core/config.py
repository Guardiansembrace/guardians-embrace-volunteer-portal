"""
Core configuration settings for the Guardians Portal Backend.
All settings are loaded from environment variables with sensible defaults.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import List, Optional, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = BACKEND_ROOT / ".env"


def load_shared_config() -> dict:
    """Load shared configuration from the monorepo shared folder."""
    for parent in Path(__file__).resolve().parents:
        config_path = parent / "shared" / "config.json"
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
    return {}


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=str(DEFAULT_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )
    
    # Application
    app_name: str = "Guardian's Embrace Volunteer Portal"
    app_version: str = "1.0.0"
    debug: bool = False
    api_prefix: str = "/api/v1"
    monitoring_enabled: bool = True
    frontend_error_ingest_enabled: bool = True
    log_to_file: bool = False
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8081
    allowed_origins: Union[str, List[str]] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    @field_validator("allowed_origins", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    @field_validator("debug", mode="before")
    @classmethod
    def normalize_debug_flag(cls, value: Union[bool, str]) -> bool:
        """Accept common environment-style debug values."""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug", "dev", "development"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", "prod", "production"}:
                return False
        raise ValueError("Invalid debug flag")
    
    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "guardians_portal"
    use_mock_db: bool = False
    
    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:3000/auth/callback"
    
    # JWT
    jwt_secret: str = "change-this-in-production-to-a-secure-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    
    # Admin emails (comma-separated in env)
    admin_emails: str = ""
    
    # Schedule
    weekly_update_start_day: str = "friday"
    weekly_update_end_day: str = "sunday"
    timezone: str = "America/New_York"
    
    # Google Drive Integration — Shared Drive via Service Account
    # The ID of the Shared Drive (from the URL)
    google_drive_shared_drive_id: str = ""
    # Set to the JSON content of the service account credentials file (optional)
    google_drive_credentials_json: str = ""
    # Path to the service account credentials file (defaults to service-account.json)
    google_application_credentials: str = ""

    # Frontend URL (used in outgoing emails)
    frontend_url: str = "http://localhost:5173"
    file_download_token_expire_minutes: int = 5
    private_file_storage_backend: str = "auto"

    # AWS / S3
    aws_region: str = "us-east-1"
    aws_s3_bucket: str = ""
    aws_public_assets_base_url: str = ""

    # SMTP Email (for reminders)
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""  # For Gmail use an App Password
    smtp_from_email: str = ""
    smtp_from_name: str = "Guardian's Embrace"
    smtp_use_starttls: bool = True
    smtp_use_ssl: bool = False
    smtp_validate_certs: bool = True

    @property
    def clean_google_drive_credentials_json(self) -> str:
        """Return credentials JSON with leading/trailing quotes removed."""
        val = self.google_drive_credentials_json.strip()
        if (val.startswith("'") and val.endswith("'")) or (val.startswith('"') and val.endswith('"')):
            return val[1:-1]
        return val

    @field_validator("private_file_storage_backend", mode="before")
    @classmethod
    def normalize_private_file_storage_backend(cls, value: str) -> str:
        """Accept a small, explicit set of private upload backends."""
        normalized = (value or "auto").strip().lower()
        allowed_values = {"auto", "drive", "s3", "local"}
        if normalized not in allowed_values:
            raise ValueError("private_file_storage_backend must be one of: auto, drive, s3, local")
        return normalized
    
    @property
    def admin_email_list(self) -> List[str]:
        """Parse admin emails from comma-separated string."""
        shared_config = load_shared_config()
        # Combine env admins with shared config admins
        env_admins = [e.strip() for e in self.admin_emails.split(",") if e.strip()]
        config_admins = shared_config.get("admins", [])
        return list(set(env_admins + config_admins))
    
    def is_admin(self, email: str) -> bool:
        """Check if an email belongs to an admin."""
        return email.lower() in [e.lower() for e in self.admin_email_list]


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
