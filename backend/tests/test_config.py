"""
Tests for application settings parsing.
"""

from pathlib import Path

from app.core.config import Settings


class TestSettings:
    """Settings parsing should be resilient to environment-style values."""

    def test_debug_accepts_release_mode_string(self):
        settings = Settings(debug="release")
        assert settings.debug is False

    def test_debug_accepts_development_mode_string(self):
        settings = Settings(debug="development")
        assert settings.debug is True

    def test_admin_email_list_merges_env_and_shared_config(self, monkeypatch):
        monkeypatch.setattr(
            "app.core.config.load_shared_config",
            lambda: {"admins": ["shared-admin@example.com", "env-admin@example.com"]},
        )

        settings = Settings(admin_emails="env-admin@example.com, second-admin@example.com")

        assert sorted(settings.admin_email_list) == [
            "env-admin@example.com",
            "second-admin@example.com",
            "shared-admin@example.com",
        ]

    def test_settings_load_backend_env_even_when_cwd_is_repo_root(self, monkeypatch):
        repo_root = Path(__file__).resolve().parents[2]
        monkeypatch.chdir(repo_root)
        monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)

        settings = Settings()

        assert "http://localhost:5173" in settings.allowed_origins
