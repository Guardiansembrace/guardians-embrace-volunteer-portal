"""
Tests for application settings parsing.
"""

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
