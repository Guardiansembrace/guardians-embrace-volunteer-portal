"""
File management API endpoints.

All files are stored on the organization's Shared Drive via Service Account.
Falls back to local storage if Drive is not configured.

Endpoints:
    GET  /files/drive-status     — check if Drive is connected
    GET  /files/drive-test       — test the Shared Drive connection
    POST /files/upload           — upload a single file
    POST /files/upload-multiple  — upload up to 10 files at once
    GET  /files/list             — list files (own files, or all for admins)
    GET  /files/download/{id}    — download a file by Drive file ID
    DELETE /files/{id}           — delete a file by Drive file ID (owner or admin)
"""

from typing import List, Optional
from datetime import datetime
import traceback
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import Response
from pydantic import BaseModel

from app.core.security import get_current_user
from app.core.drive import get_drive_service, upload_file_to_drive
from app.core.storage import get_storage_service
from app.core.utils import get_week_id
from app.models.user import User, UserRole
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["Files"])

# Maximum upload size: 25 MB
MAX_FILE_SIZE = 25 * 1024 * 1024


def _check_file_access(current_user: User):
    """
    Raise 403 if the user's 24-hour file access window has expired.
    Admins / team leads are always allowed.
    """
    if current_user.role in (UserRole.ADMIN, UserRole.TEAM_LEAD):
        return
    if (
        current_user.file_access_expires is not None
        and datetime.utcnow() > current_user.file_access_expires
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your 7-day file access window has expired. Contact an admin.",
        )


# ── Response Models ─────────────────────────────────────────────────────

class UploadedFileResponse(BaseModel):
    """Response after successful file upload."""
    file_id: str
    filename: str
    mime_type: str
    drive_link: str
    uploaded_at: str
    storage_type: str = "local"


class DriveStatusResponse(BaseModel):
    """Response for Drive integration status."""
    configured: bool
    message: str
    storage_type: str  # 'shared_drive' or 'local'
    drive_name: str | None = None


class FileInfo(BaseModel):
    """File metadata returned from listing."""
    id: str
    name: str
    mime_type: str | None = None
    web_link: str | None = None
    size: str | None = None
    created_time: str | None = None


# ── Drive Status ────────────────────────────────────────────────────────

@router.get("/drive-status", response_model=DriveStatusResponse)
async def get_drive_status(current_user: User = Depends(get_current_user)):
    """Check whether the Shared Drive connection is active."""
    drive = get_drive_service()
    if drive:
        return DriveStatusResponse(
            configured=True,
            message="Organization Shared Drive is active. Files are stored centrally.",
            storage_type="shared_drive",
            drive_name="Volunteer Submissions",
        )

    return DriveStatusResponse(
        configured=False,
        message="Google Drive not configured. Files stored on local server.",
        storage_type="local",
    )


@router.get("/drive-test")
async def test_drive_connection(current_user: User = Depends(get_current_user)):
    """Test the Shared Drive connection."""
    drive = get_drive_service()
    if not drive:
        return {"success": False, "message": "Shared Drive is not configured."}

    try:
        result = drive.test_connection()
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Upload ──────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadedFileResponse)
async def upload_file(
    file: UploadFile = File(...),
    week_id: str = Form(None),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a single file.
    Tries Shared Drive first, falls back to local storage.
    Files go to: Shared Drive / {Volunteer Name} / {YYYY-WNN} / filename
    """
    _check_file_access(current_user)
    target_week = week_id or get_week_id()
    logger.info(
        f"[FILES] Upload started: {file.filename} | week={target_week} | user={current_user.name}"
    )

    # Read & validate
    file_data = await _read_and_validate(file)
    mime_type = file.content_type or "application/octet-stream"

    # Try Shared Drive
    try:
        result = upload_file_to_drive(
            file_data=file_data,
            filename=file.filename,
            mime_type=mime_type,
            week_id=target_week,
            volunteer_name=current_user.name,
        )
        logger.info(f"[FILES] ✓ Drive upload OK: {result['file_id']}")
        return UploadedFileResponse(
            file_id=result["file_id"],
            filename=result["filename"],
            mime_type=mime_type,
            drive_link=result["drive_link"],
            uploaded_at=datetime.utcnow().isoformat(),
            storage_type=result["storage_type"],
        )
    except Exception as e:
        logger.warning(f"[FILES] Drive upload failed, falling back to local: {e}")
        traceback.print_exc()

    # Fallback: local storage
    return await _upload_local(file_data, file.filename, mime_type, target_week, current_user.name)


@router.post("/upload-multiple", response_model=List[UploadedFileResponse])
async def upload_multiple_files(
    files: List[UploadFile] = File(...),
    week_id: str = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Upload up to 10 files at once."""
    _check_file_access(current_user)
    if len(files) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 files per upload.",
        )

    target_week = week_id or get_week_id()
    results: List[UploadedFileResponse] = []

    for f in files:
        try:
            file_data = await _read_and_validate(f)
            mime_type = f.content_type or "application/octet-stream"

            # Try Drive
            try:
                result = upload_file_to_drive(
                    file_data=file_data,
                    filename=f.filename,
                    mime_type=mime_type,
                    week_id=target_week,
                    volunteer_name=current_user.name,
                )
                results.append(
                    UploadedFileResponse(
                        file_id=result["file_id"],
                        filename=result["filename"],
                        mime_type=mime_type,
                        drive_link=result["drive_link"],
                        uploaded_at=datetime.utcnow().isoformat(),
                        storage_type=result["storage_type"],
                    )
                )
                continue
            except Exception as e:
                logger.warning(f"[FILES] Drive failed for {f.filename}: {e}")

            # Fallback: local
            resp = await _upload_local(
                file_data, f.filename, mime_type, target_week, current_user.name
            )
            results.append(resp)

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[FILES] Error uploading {f.filename}: {e}")

    return results


# ── List Files ──────────────────────────────────────────────────────────

@router.get("/list", response_model=List[FileInfo])
async def list_files(
    week_id: str = Query(None, description="Filter by week (e.g. 2026-W07)"),
    volunteer_name: str = Query(None, description="Filter by volunteer name (admin only)"),
    current_user: User = Depends(get_current_user),
):
    """
    List files for the current user (or all users if admin).
    
    - Volunteers see only their own files.
    - Admins can optionally filter by volunteer_name, or see all.
    """
    _check_file_access(current_user)
    drive = get_drive_service()
    if not drive:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Drive is not configured.",
        )

    # Determine whose files to list
    is_admin = current_user.role in (UserRole.ADMIN, UserRole.TEAM_LEAD)

    if is_admin and volunteer_name:
        target_name = volunteer_name
    elif is_admin and not volunteer_name:
        # Admin with no filter → list all files on the drive
        target_name = None
    else:
        # Regular volunteer → only their own files
        target_name = current_user.name

    try:
        raw_files = drive.list_files(
            volunteer_name=target_name,
            week_id=week_id,
        )
        return [
            FileInfo(
                id=f["id"],
                name=f["name"],
                mime_type=f.get("mimeType"),
                web_link=f.get("webViewLink"),
                size=f.get("size"),
                created_time=f.get("createdTime"),
            )
            for f in raw_files
        ]
    except Exception as e:
        logger.error(f"[FILES] list_files error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list files: {str(e)}",
        )


# ── Download ────────────────────────────────────────────────────────────

@router.get("/download/{file_id}")
async def download_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Download a file from Shared Drive by its Google Drive file ID.
    Any authenticated user can download (they need the file_id).
    """
    _check_file_access(current_user)
    drive = get_drive_service()

    # Try Shared Drive first
    if drive:
        try:
            file_bytes, filename, mime_type = drive.download_file(file_id)
            return Response(
                content=file_bytes,
                media_type=mime_type,
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "Content-Length": str(len(file_bytes)),
                },
            )
        except HttpError as e:
            if e.resp.status == 404:
                raise HTTPException(status_code=404, detail="File not found on Drive.")
            raise HTTPException(status_code=500, detail=f"Drive error: {str(e)}")
        except Exception as e:
            logger.error(f"[FILES] Download error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

    # Fallback: try local storage (file_id might be a stored filename)
    storage = get_storage_service()
    file_data = storage.get_file(file_id)
    if file_data is None:
        raise HTTPException(status_code=404, detail="File not found.")

    return Response(
        content=file_data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file_id}"'},
    )


# ── Delete ──────────────────────────────────────────────────────────────

@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Delete a file from Shared Drive.
    Any authenticated user can delete (access control is by knowing the file ID).
    Admins can delete any file.
    """
    _check_file_access(current_user)
    drive = get_drive_service()
    if not drive:
        # Try local storage
        storage = get_storage_service()
        if storage.delete_file(file_id):
            return {"success": True, "message": "File deleted from local storage."}
        raise HTTPException(status_code=404, detail="File not found.")

    try:
        drive.delete_file(file_id)
        logger.info(
            f"[FILES] File {file_id} deleted by {current_user.name} ({current_user.email})"
        )
        return {"success": True, "message": "File deleted from Shared Drive."}
    except HttpError as e:
        if e.resp.status == 404:
            raise HTTPException(status_code=404, detail="File not found on Drive.")
        raise HTTPException(status_code=500, detail=f"Drive error: {str(e)}")
    except Exception as e:
        logger.error(f"[FILES] Delete error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


# ── Folder Link ─────────────────────────────────────────────────────────

@router.get("/folder-link")
async def get_submission_folder_link(
    week_id: str = None,
    current_user: User = Depends(get_current_user),
):
    """Get info about where files are stored."""
    drive = get_drive_service()
    if drive:
        shared_drive_id = drive._shared_drive_id
        return {
            "storage_type": "shared_drive",
            "week_id": week_id or get_week_id(),
            "folder_name": "Volunteer Submissions",
            "folder_link": f"https://drive.google.com/drive/folders/{shared_drive_id}",
            "message": "Files are uploaded to the Organization's Shared Drive.",
        }

    return {
        "storage_type": "local",
        "week_id": week_id or get_week_id(),
        "message": "Files stored on local server.",
    }


# ── Helpers ─────────────────────────────────────────────────────────────

async def _read_and_validate(file: UploadFile) -> bytes:
    """Read upload data and validate size."""
    try:
        data = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read file: {str(e)}",
        )

    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 25 MB.",
        )
    return data


async def _upload_local(
    file_data: bytes,
    filename: str,
    mime_type: str,
    week_id: str,
    volunteer_name: str,
) -> UploadedFileResponse:
    """Upload to local storage as fallback."""
    storage = get_storage_service()
    result = storage.upload_volunteer_file(
        file_data=file_data,
        filename=filename,
        mime_type=mime_type,
        week_id=week_id,
        volunteer_name=volunteer_name,
    )
    return UploadedFileResponse(
        file_id=result["file_id"],
        filename=result["filename"],
        mime_type=result["mime_type"],
        drive_link=result["drive_link"],
        uploaded_at=result["uploaded_at"],
        storage_type="local",
    )
