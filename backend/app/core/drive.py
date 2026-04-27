"""
Google Drive integration using Service Account → Shared Drive.

All files are stored on the organization's Shared Drive ("Volunteer Submissions").
Folder structure: Shared Drive Root / Volunteer Name / YYYY-WNN / files

Service Account: guardian-s-embrace-service-acc@guardians-embrace.iam.gserviceaccount.com
Shared Drive ID: configured via GOOGLE_DRIVE_SHARED_DRIVE_ID env var
"""

import io
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple, Dict, Any, List
import logging

from google.oauth2.service_account import Credentials as ServiceCredentials
from googleapiclient.discovery import build, Resource
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload
from googleapiclient.errors import HttpError

from app.core.config import get_settings
from app.models.project_file import ProjectFileSourceType

logger = logging.getLogger(__name__)

# Google Drive API scopes
SCOPES = ["https://www.googleapis.com/auth/drive"]

# Shared Drive constants
FOLDER_MIME = "application/vnd.google-apps.folder"


class SharedDriveService:
    """
    Google Drive service using a Service Account to manage files
    on the organization's Shared Drive.

    Folder structure:
        Shared Drive Root / {Volunteer Name} / {YYYY-WNN} / files
    """

    def __init__(self):
        self.settings = get_settings()
        self._service: Optional[Resource] = None
        self._shared_drive_id = self.settings.google_drive_shared_drive_id
        self._creds_json = self.settings.clean_google_drive_credentials_json

    def _sanitize_folder_name(self, value: str, *, fallback: str) -> str:
        """Sanitize a human-readable folder name."""
        safe_value = "".join(
            c for c in str(value or "") if c.isalnum() or c in (" ", "-", "_", ".")
        ).strip()
        return safe_value or fallback

    def _project_folder_name(self, project_id: str, project_name: str) -> str:
        safe_project_name = self._sanitize_folder_name(project_name, fallback="Project")
        safe_project_id = self._sanitize_folder_name(project_id, fallback="project")
        return f"{safe_project_id}-{safe_project_name}"

    # ── Initialization ──────────────────────────────────────────────

    def is_configured(self) -> bool:
        """Check if the Shared Drive service is properly configured."""
        if not self._shared_drive_id:
            logger.warning("[DRIVE] Not configured: GOOGLE_DRIVE_SHARED_DRIVE_ID missing")
            return False

        # Check credentials (JSON env var or file path)
        has_creds = bool(self._creds_json) or bool(self._resolve_creds_path())
        if not has_creds:
            logger.warning("[DRIVE] Not configured: No service account credentials found")
            return False

        logger.info("[DRIVE] Shared Drive service is configured")
        return True

    def _resolve_creds_path(self) -> Optional[str]:
        """Resolve the service account credentials file path."""
        file_path = self.settings.google_application_credentials
        if not file_path:
            file_path = "service-account.json"

        if os.path.isabs(file_path) and os.path.exists(file_path):
            return file_path

        # Try relative to backend root
        backend_root = Path(__file__).parent.parent.parent
        full_path = str(backend_root / file_path)
        if os.path.exists(full_path):
            return full_path

        # Try CWD
        if os.path.exists(file_path):
            return os.path.abspath(file_path)

        return None

    def _get_service(self) -> Resource:
        """Build or return cached Google Drive API service."""
        if self._service is not None:
            return self._service

        if not self.is_configured():
            raise RuntimeError("Google Drive Shared Drive service is not configured.")

        try:
            credentials = self._load_credentials()
            self._service = build("drive", "v3", credentials=credentials)
            logger.info("[DRIVE] Google Drive API service built — Shared Drive mode")
            return self._service
        except Exception as e:
            logger.error(f"[DRIVE] Failed to build service: {e}", exc_info=True)
            raise

    def _load_credentials(self) -> ServiceCredentials:
        """Load service account credentials from JSON env var or file."""
        if self._creds_json:
            creds_dict = json.loads(self._creds_json)
            logger.info(
                f"[DRIVE] Loaded credentials from env "
                f"(SA: {creds_dict.get('client_email')})"
            )
            return ServiceCredentials.from_service_account_info(creds_dict, scopes=SCOPES)

        creds_path = self._resolve_creds_path()
        if not creds_path:
            raise FileNotFoundError("Service account credentials file not found")

        logger.info(f"[DRIVE] Loading credentials from file: {creds_path}")
        return ServiceCredentials.from_service_account_file(creds_path, scopes=SCOPES)

    # ── Folder Management ───────────────────────────────────────────

    def _find_or_create_folder(self, name: str, parent_id: str) -> str:
        """
        Find an existing folder by name under parent, or create it.
        All operations use supportsAllDrives / includeItemsFromAllDrives
        for Shared Drive compatibility.
        """
        service = self._get_service()
        escaped = name.replace("'", "\\'")

        query = (
            f"name='{escaped}' "
            f"and mimeType='{FOLDER_MIME}' "
            f"and '{parent_id}' in parents "
            f"and trashed=false"
        )

        results = (
            service.files()
            .list(
                q=query,
                fields="files(id, name)",
                includeItemsFromAllDrives=True,
                supportsAllDrives=True,
                corpora="drive",
                driveId=self._shared_drive_id,
            )
            .execute()
        )

        files = results.get("files", [])
        if files:
            logger.debug(f"[DRIVE] Found folder '{name}' → {files[0]['id']}")
            return files[0]["id"]

        # Create the folder
        metadata = {
            "name": name,
            "mimeType": FOLDER_MIME,
            "parents": [parent_id],
        }

        folder = (
            service.files()
            .create(body=metadata, fields="id", supportsAllDrives=True)
            .execute()
        )

        folder_id = folder["id"]
        logger.info(f"[DRIVE] Created folder '{name}' → {folder_id}")
        return folder_id

    def get_volunteer_week_folder(self, volunteer_name: str, week_id: str) -> str:
        """
        Get or create:  Shared Drive / {Volunteer Name} / {YYYY-WNN}

        Returns the week folder ID where files should be uploaded.
        """
        # Sanitize volunteer name
        safe_name = "".join(
            c for c in volunteer_name if c.isalnum() or c in (" ", "-", "_", ".")
        ).strip()
        if not safe_name:
            safe_name = "Unknown Volunteer"

        # Step 1: Volunteer folder under Shared Drive root
        volunteer_folder_id = self._find_or_create_folder(
            safe_name, self._shared_drive_id
        )

        # Step 2: Week folder under volunteer folder
        week_folder_id = self._find_or_create_folder(week_id, volunteer_folder_id)

        return week_folder_id

    def get_project_root_folder(self, project_id: str, project_name: str) -> tuple[str, str]:
        """Get or create the readable project root folder."""
        projects_root_id = self._find_or_create_folder("01-Projects", self._shared_drive_id)
        project_folder_name = self._project_folder_name(project_id, project_name)
        project_root_id = self._find_or_create_folder(project_folder_name, projects_root_id)
        return project_root_id, project_folder_name

    def get_project_submission_folder(
        self,
        *,
        project_id: str,
        project_name: str,
        volunteer_name: str,
        week_id: str,
    ) -> tuple[str, str]:
        """Get or create the submission files folder for a project/week/user."""
        project_root_id, project_folder_name = self.get_project_root_folder(project_id, project_name)
        submissions_root_id = self._find_or_create_folder("01-Submissions", project_root_id)
        volunteer_folder_name = self._sanitize_folder_name(volunteer_name, fallback="Unknown Volunteer")
        volunteer_folder_id = self._find_or_create_folder(volunteer_folder_name, submissions_root_id)
        week_folder_id = self._find_or_create_folder(week_id, volunteer_folder_id)
        submission_files_folder_id = self._find_or_create_folder("01-Submission-Files", week_folder_id)
        folder_path = f"01-Projects/{project_folder_name}/01-Submissions/{volunteer_folder_name}/{week_id}/01-Submission-Files"
        return submission_files_folder_id, folder_path

    def get_project_general_files_folder(
        self,
        *,
        project_id: str,
        project_name: str,
        volunteer_name: str,
        upload_date: str,
    ) -> tuple[str, str]:
        """Get or create the general project files folder."""
        project_root_id, project_folder_name = self.get_project_root_folder(project_id, project_name)
        files_root_id = self._find_or_create_folder("02-Project-Files", project_root_id)
        volunteer_folder_name = self._sanitize_folder_name(volunteer_name, fallback="Unknown Volunteer")
        volunteer_folder_id = self._find_or_create_folder(volunteer_folder_name, files_root_id)
        date_folder_id = self._find_or_create_folder(upload_date, volunteer_folder_id)
        folder_path = f"01-Projects/{project_folder_name}/02-Project-Files/{volunteer_folder_name}/{upload_date}"
        return date_folder_id, folder_path

    def get_project_work_item_folder(
        self,
        *,
        project_id: str,
        project_name: str,
        work_item_id: str,
        work_item_title: Optional[str],
        volunteer_name: str,
    ) -> tuple[str, str]:
        """Get or create the work-item folder for a project file."""
        project_root_id, project_folder_name = self.get_project_root_folder(project_id, project_name)
        files_root_id = self._find_or_create_folder("03-Work-Item-Files", project_root_id)
        work_item_folder_name = self._project_folder_name(work_item_id, work_item_title or "Work Item")
        work_item_folder_id = self._find_or_create_folder(work_item_folder_name, files_root_id)
        volunteer_folder_name = self._sanitize_folder_name(volunteer_name, fallback="Unknown Volunteer")
        volunteer_folder_id = self._find_or_create_folder(volunteer_folder_name, work_item_folder_id)
        folder_path = f"01-Projects/{project_folder_name}/03-Work-Item-Files/{work_item_folder_name}/{volunteer_folder_name}"
        return volunteer_folder_id, folder_path

    # ── Upload ──────────────────────────────────────────────────────

    def upload_file(
        self,
        file_data: bytes,
        filename: str,
        mime_type: str,
        volunteer_name: str,
        week_id: str,
    ) -> Dict[str, str]:
        """
        Upload a file to: Shared Drive / Volunteer Name / Week / filename

        Returns dict with file_id, filename, drive_link, storage_type.
        """
        folder_id = self.get_volunteer_week_folder(volunteer_name, week_id)
        service = self._get_service()

        file_metadata = {"name": filename, "parents": [folder_id]}
        media = MediaIoBaseUpload(
            io.BytesIO(file_data), mimetype=mime_type, resumable=True
        )

        uploaded = (
            service.files()
            .create(
                body=file_metadata,
                media_body=media,
                fields="id, webViewLink",
                supportsAllDrives=True,
            )
            .execute()
        )

        file_id = uploaded["id"]
        web_link = uploaded.get("webViewLink", "")
        logger.info(f"[DRIVE] ✓ Uploaded '{filename}' → {file_id}")

        return {
            "file_id": file_id,
            "filename": filename,
            "drive_link": web_link,
            "storage_type": "shared_drive",
        }

    def upload_project_file(
        self,
        *,
        file_data: bytes,
        filename: str,
        mime_type: str,
        project_id: str,
        project_name: str,
        volunteer_name: str,
        source_type: ProjectFileSourceType,
        week_id: Optional[str] = None,
        work_item_id: Optional[str] = None,
        work_item_title: Optional[str] = None,
    ) -> Dict[str, str]:
        """Upload a file into a readable project-scoped folder structure."""
        if source_type == ProjectFileSourceType.SUBMISSION:
            if not week_id:
                raise ValueError("week_id is required for submission uploads")
            folder_id, folder_path = self.get_project_submission_folder(
                project_id=project_id,
                project_name=project_name,
                volunteer_name=volunteer_name,
                week_id=week_id,
            )
        elif source_type == ProjectFileSourceType.WORK_ITEM:
            if not work_item_id:
                raise ValueError("work_item_id is required for work item uploads")
            folder_id, folder_path = self.get_project_work_item_folder(
                project_id=project_id,
                project_name=project_name,
                work_item_id=work_item_id,
                work_item_title=work_item_title,
                volunteer_name=volunteer_name,
            )
        else:
            upload_date = week_id or datetime.utcnow().date().isoformat()
            folder_id, folder_path = self.get_project_general_files_folder(
                project_id=project_id,
                project_name=project_name,
                volunteer_name=volunteer_name,
                upload_date=upload_date,
            )

        service = self._get_service()
        file_metadata = {"name": filename, "parents": [folder_id]}
        media = MediaIoBaseUpload(io.BytesIO(file_data), mimetype=mime_type, resumable=True)

        uploaded = (
            service.files()
            .create(
                body=file_metadata,
                media_body=media,
                fields="id, webViewLink",
                supportsAllDrives=True,
            )
            .execute()
        )

        file_id = uploaded["id"]
        web_link = uploaded.get("webViewLink", "")
        logger.info("[DRIVE] Uploaded project file '%s' -> %s (%s)", filename, file_id, folder_path)
        return {
            "file_id": file_id,
            "filename": filename,
            "drive_link": web_link,
            "storage_type": "shared_drive",
            "folder_id": folder_id,
            "folder_path": folder_path,
        }

    # ── Download ────────────────────────────────────────────────────

    def download_file(self, file_id: str) -> Tuple[bytes, str, str]:
        """
        Download a file from Shared Drive by its file ID.

        Returns (file_bytes, filename, mime_type).
        """
        service = self._get_service()

        # Get file metadata
        meta = (
            service.files()
            .get(
                fileId=file_id,
                fields="name, mimeType, size",
                supportsAllDrives=True,
            )
            .execute()
        )

        filename = meta["name"]
        mime_type = meta.get("mimeType", "application/octet-stream")

        # Download content
        request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request)

        done = False
        while not done:
            _, done = downloader.next_chunk()

        logger.info(f"[DRIVE] ✓ Downloaded '{filename}' ({file_id})")
        return buffer.getvalue(), filename, mime_type

    # ── Delete ──────────────────────────────────────────────────────

    def delete_file(self, file_id: str) -> bool:
        """
        Delete (trash) a file from Shared Drive by its file ID.
        Content Managers can trash but not permanently delete.

        Returns True on success.
        """
        service = self._get_service()
        # On Shared Drives, Content Managers can trash but not permanently delete.
        # Use update(trashed=True) instead of files().delete().
        service.files().update(
            fileId=file_id,
            body={"trashed": True},
            supportsAllDrives=True,
        ).execute()
        logger.info(f"[DRIVE] ✓ Trashed file {file_id}")
        return True

    # ── List Files ──────────────────────────────────────────────────

    def list_files(
        self,
        volunteer_name: Optional[str] = None,
        week_id: Optional[str] = None,
        page_size: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        List files on the Shared Drive, optionally filtered by volunteer/week.

        Returns list of dicts with id, name, mimeType, webViewLink, size, createdTime.
        """
        service = self._get_service()

        query_parts = ["trashed=false", f"mimeType!='{FOLDER_MIME}'"]

        # If both volunteer + week specified, find exact folder
        if volunteer_name and week_id:
            try:
                folder_id = self.get_volunteer_week_folder(volunteer_name, week_id)
                query_parts.append(f"'{folder_id}' in parents")
            except Exception:
                return []
        elif volunteer_name:
            # List all files under volunteer folder (any week)
            safe_name = "".join(
                c for c in volunteer_name if c.isalnum() or c in (" ", "-", "_", ".")
            ).strip()
            try:
                vol_folder = self._find_or_create_folder(
                    safe_name, self._shared_drive_id
                )
                week_folders = self._list_subfolders(vol_folder)
                if not week_folders:
                    return []
                parent_queries = " or ".join(
                    f"'{fid}' in parents" for fid in week_folders
                )
                query_parts.append(f"({parent_queries})")
            except Exception:
                return []

        query = " and ".join(query_parts)

        results = (
            service.files()
            .list(
                q=query,
                fields="files(id, name, mimeType, webViewLink, size, createdTime, parents)",
                pageSize=page_size,
                includeItemsFromAllDrives=True,
                supportsAllDrives=True,
                corpora="drive",
                driveId=self._shared_drive_id,
                orderBy="createdTime desc",
            )
            .execute()
        )

        return results.get("files", [])

    def _list_subfolders(self, parent_id: str) -> List[str]:
        """List IDs of immediate subfolders."""
        service = self._get_service()
        query = (
            f"'{parent_id}' in parents "
            f"and mimeType='{FOLDER_MIME}' "
            f"and trashed=false"
        )
        results = (
            service.files()
            .list(
                q=query,
                fields="files(id)",
                includeItemsFromAllDrives=True,
                supportsAllDrives=True,
                corpora="drive",
                driveId=self._shared_drive_id,
            )
            .execute()
        )
        return [f["id"] for f in results.get("files", [])]

    # ── Utility ─────────────────────────────────────────────────────

    def get_file_metadata(self, file_id: str) -> Dict[str, Any]:
        """Get metadata for a single file."""
        service = self._get_service()
        return (
            service.files()
            .get(
                fileId=file_id,
                fields="id, name, mimeType, webViewLink, size, createdTime, parents",
                supportsAllDrives=True,
            )
            .execute()
        )

    def test_connection(self) -> Dict[str, Any]:
        """Test the Shared Drive connection and return drive info."""
        service = self._get_service()
        drive_info = (
            service.drives()
            .get(driveId=self._shared_drive_id, fields="id, name")
            .execute()
        )
        return {
            "success": True,
            "drive_id": drive_info["id"],
            "drive_name": drive_info["name"],
            "message": f"Connected to Shared Drive: {drive_info['name']}",
        }


# ── Singleton / Factory ────────────────────────────────────────────────

_drive_service: Optional[SharedDriveService] = None


def get_drive_service() -> Optional[SharedDriveService]:
    """
    Get the Shared Drive service singleton.
    Returns None if not configured (caller should fall back to local storage).
    """
    global _drive_service
    if _drive_service is None:
        _drive_service = SharedDriveService()

    if _drive_service.is_configured():
        return _drive_service
    return None


def upload_file_to_drive(
    file_data: bytes,
    filename: str,
    mime_type: str,
    week_id: str,
    volunteer_name: str,
) -> Dict[str, Any]:
    """
    Upload a file to the organization's Shared Drive.
    Raises RuntimeError if Drive is not configured.
    """
    service = get_drive_service()
    if not service:
        raise RuntimeError(
            "Google Drive is not configured. "
            "Set GOOGLE_DRIVE_SHARED_DRIVE_ID and service account credentials."
        )

    return service.upload_file(
        file_data=file_data,
        filename=filename,
        mime_type=mime_type,
        volunteer_name=volunteer_name,
        week_id=week_id,
    )


def upload_project_file_to_drive(
    *,
    file_data: bytes,
    filename: str,
    mime_type: str,
    project_id: str,
    project_name: str,
    volunteer_name: str,
    source_type: ProjectFileSourceType,
    week_id: Optional[str] = None,
    work_item_id: Optional[str] = None,
    work_item_title: Optional[str] = None,
) -> Dict[str, Any]:
    """Upload a project-scoped file to the organization's Shared Drive."""
    service = get_drive_service()
    if not service:
        raise RuntimeError(
            "Google Drive is not configured. "
            "Set GOOGLE_DRIVE_SHARED_DRIVE_ID and service account credentials."
        )

    return service.upload_project_file(
        file_data=file_data,
        filename=filename,
        mime_type=mime_type,
        project_id=project_id,
        project_name=project_name,
        volunteer_name=volunteer_name,
        source_type=source_type,
        week_id=week_id,
        work_item_id=work_item_id,
        work_item_title=work_item_title,
    )


logger.info("[DRIVE] Module loaded — Shared Drive service initialized")
