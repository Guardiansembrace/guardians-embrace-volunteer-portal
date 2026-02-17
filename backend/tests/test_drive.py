"""
Tests for Google Drive (Shared Drive) integration.
"""

import pytest
from unittest.mock import MagicMock, patch

from app.core.drive import SharedDriveService, get_drive_service


class TestSharedDriveService:
    """Tests for SharedDriveService class."""

    def test_is_configured_returns_false_when_no_credentials(self):
        """Should return False when credentials are not set."""
        with patch('app.core.drive.get_settings') as mock_settings:
            mock_settings.return_value.google_drive_credentials_json = ""
            mock_settings.return_value.google_application_credentials = ""
            mock_settings.return_value.google_drive_shared_drive_id = ""
            service = SharedDriveService()
            assert service.is_configured() is False

    def test_is_configured_returns_true_when_credentials_set(self):
        """Should return True when credentials JSON and shared drive ID are set."""
        with patch('app.core.drive.get_settings') as mock_settings:
            mock_settings.return_value.google_drive_credentials_json = '{"type": "service_account"}'
            mock_settings.return_value.google_application_credentials = ""
            mock_settings.return_value.google_drive_shared_drive_id = "0AHyIR8SWswHXUk9PVA"
            mock_settings.return_value.clean_google_drive_credentials_json = '{"type": "service_account"}'
            service = SharedDriveService()
            assert service.is_configured() is True


class TestGetDriveService:
    """Tests for get_drive_service singleton."""

    def test_returns_same_instance(self):
        """Should return the same instance on multiple calls."""
        import app.core.drive as drive_module
        drive_module._drive_service = None

        service1 = get_drive_service()
        service2 = get_drive_service()
        # Both should be the same object (or both None if not configured)
        assert service1 is service2
