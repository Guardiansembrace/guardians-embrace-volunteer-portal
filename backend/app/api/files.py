"""
File management API endpoints.

Storage priority:
1. AWS S3 when configured
2. Google Shared Drive when configured
3. Local filesystem for development fallback
"""

from __future__ import annotations

import logging
import traceback
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import RedirectResponse, Response
from googleapiclient.errors import HttpError
from pydantic import BaseModel
from botocore.exceptions import BotoCoreError, ClientError

from app.core.drive import get_drive_service, upload_file_to_drive
from app.core.rate_limit import rate_limit_by_user
from app.core.security import (
    create_file_download_token,
    get_current_user,
    get_optional_current_user,
    verify_file_download_token,
)
from app.core.storage import (
    PUBLIC_PREFIX,
    decode_storage_key,
    get_storage_service,
    is_s3_storage_enabled,
)
from app.core.time import utc_now
from app.core.utils import get_week_id
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["Files"])

# Maximum upload size: 25 MB
MAX_FILE_SIZE = 25 * 1024 * 1024
MAX_PUBLIC_IMAGE_SIZE = 5 * 1024 * 1024
BLOCKED_FILE_EXTENSIONS = {
    ".app",
    ".bat",
    ".cmd",
    ".com",
    ".cpl",
    ".exe",
    ".hta",
    ".js",
    ".jar",
    ".lnk",
    ".msi",
    ".ps1",
    ".scr",
    ".sh",
    ".vb",
    ".vbe",
    ".vbs",
}


class UploadedFileResponse(BaseModel):
    """Response after a successful file upload."""

    file_id: str
    filename: str
    mime_type: str
    drive_link: str
    uploaded_at: str
    storage_type: str = "local"


class PresignedUploadResponse(UploadedFileResponse):
    """Response used for direct browser-to-S3 uploads."""

    upload_url: str
    method: str = "PUT"
    headers: dict[str, str] | None = None


class DirectUploadRequest(BaseModel):
    """Request body for a direct S3 upload."""

    filename: str
    content_type: str | None = None
    size: int
    week_id: str | None = None


class PublicFileResponse(BaseModel):
    """Response for public file uploads such as project banner images."""

    url: str
    filename: str


class DownloadLinkResponse(BaseModel):
    """Short-lived URL used by the frontend to start a file download."""

    url: str


class DriveStatusResponse(BaseModel):
    """Response for the active file storage backend."""

    configured: bool
    message: str
    storage_type: str
    drive_name: str | None = None


class FileInfo(BaseModel):
    """File metadata returned from listing."""

    id: str
    name: str
    mime_type: str | None = None
    web_link: str | None = None
    size: str | None = None
    created_time: str | None = None


def _check_file_access(current_user: User) -> None:
    """Raise 403 if the user's file access window has expired."""
    if current_user.role in (UserRole.ADMIN, UserRole.TEAM_LEAD):
        return
    if current_user.file_access_expires is not None and utc_now() > current_user.file_access_expires:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your 7-day file access window has expired. Contact an admin.",
        )


def _build_absolute_url(request: Request, path: str) -> str:
    return f"{str(request.base_url).rstrip('/')}{path}"


def _build_internal_download_link(request: Request, file_id: str) -> str:
    return _build_absolute_url(request, f"/api/v1/files/download/{file_id}")


def _build_signed_download_link(request: Request, file_id: str) -> str:
    token = create_file_download_token(file_id)
    return _build_absolute_url(request, f"/api/v1/files/download/{file_id}?token={token}")


def _build_public_file_link(request: Request, file_id: str) -> str:
    return _build_absolute_url(request, f"/api/v1/files/public/{file_id}")


def _resolve_public_file_url(request: Request, file_id: str) -> str:
    storage = get_storage_service()
    if is_s3_storage_enabled():
        settings = storage.settings  # type: ignore[attr-defined]
        if settings.aws_public_assets_base_url:
            storage_key = decode_storage_key(file_id)
            return f"{settings.aws_public_assets_base_url.rstrip('/')}/{storage_key}"
    return _build_public_file_link(request, file_id)


def _build_uploaded_file_response(
    request: Request,
    *,
    file_id: str,
    filename: str,
    mime_type: str,
    uploaded_at: str,
    storage_type: str,
    drive_link: str | None = None,
) -> UploadedFileResponse:
    return UploadedFileResponse(
        file_id=file_id,
        filename=filename,
        mime_type=mime_type,
        drive_link=drive_link or _build_internal_download_link(request, file_id),
        uploaded_at=uploaded_at,
        storage_type=storage_type,
    )


def _authorize_download(file_id: str, token: str | None, current_user: Optional[User]) -> None:
    if current_user is not None:
        _check_file_access(current_user)
        return

    if token:
        authorized_file_id = verify_file_download_token(token)
        if authorized_file_id == file_id:
            return

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required to download this file.",
    )


async def _read_and_validate(file: UploadFile, *, max_size: int = MAX_FILE_SIZE) -> bytes:
    """Read upload data and validate size and extension."""
    extension = Path(file.filename or "").suffix.lower()
    if extension in BLOCKED_FILE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Executable and script files are not allowed. Upload documents, images, spreadsheets, or PDFs instead.",
        )

    try:
        data = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read file: {exc}",
        ) from exc

    if len(data) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {max_size // (1024 * 1024)} MB.",
        )
    return data


def _validate_upload_request(filename: str, size: int) -> None:
    extension = Path(filename or "").suffix.lower()
    if extension in BLOCKED_FILE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Executable and script files are not allowed. Upload documents, images, spreadsheets, or PDFs instead.",
        )
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 25 MB.",
        )


async def _upload_local(
    request: Request,
    *,
    file_data: bytes,
    filename: str,
    mime_type: str,
    week_id: str,
    current_user: User,
) -> UploadedFileResponse:
    storage = get_storage_service()
    result = storage.upload_volunteer_file(
        file_data=file_data,
        filename=filename,
        mime_type=mime_type,
        owner_id=str(current_user.id),
        week_id=week_id,
    )
    return _build_uploaded_file_response(
        request,
        file_id=result.file_id,
        filename=result.filename,
        mime_type=result.mime_type,
        uploaded_at=result.uploaded_at,
        storage_type=result.storage_type,
    )


@router.get("/drive-status", response_model=DriveStatusResponse)
async def get_drive_status(current_user: User = Depends(get_current_user)):
    """Report which storage backend is currently active."""
    if is_s3_storage_enabled():
        storage = get_storage_service()
        return DriveStatusResponse(
            configured=True,
            message="AWS S3 storage is active. Files upload directly to cloud storage.",
            storage_type="s3",
            drive_name=getattr(storage, "bucket_name", None),
        )

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
        message="Cloud storage is not configured. Files are stored on the local server.",
        storage_type="local",
    )


@router.get("/drive-test")
async def test_drive_connection(current_user: User = Depends(get_current_user)):
    """Test the active cloud storage connection."""
    if is_s3_storage_enabled():
        storage = get_storage_service()
        return {
            "success": True,
            "storage_type": "s3",
            "bucket": getattr(storage, "bucket_name", None),
            "region": getattr(storage, "settings", None).aws_region if hasattr(storage, "settings") else None,
        }

    drive = get_drive_service()
    if not drive:
        return {"success": False, "message": "Shared Drive is not configured."}

    try:
        return drive.test_connection()
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@router.post(
    "/upload-url",
    response_model=PresignedUploadResponse,
    dependencies=[Depends(rate_limit_by_user("file_upload_writes"))],
)
async def create_upload_url(
    payload: DirectUploadRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Create a direct-to-S3 upload URL for private volunteer files."""
    _check_file_access(current_user)
    if not is_s3_storage_enabled():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Direct uploads are only available when S3 storage is configured.",
        )

    _validate_upload_request(payload.filename, payload.size)
    target_week = payload.week_id or get_week_id()
    mime_type = payload.content_type or "application/octet-stream"

    storage = get_storage_service()
    presigned_upload = storage.create_private_upload(
        filename=payload.filename,
        mime_type=mime_type,
        owner_id=str(current_user.id),
        week_id=target_week,
    )

    response = _build_uploaded_file_response(
        request,
        file_id=presigned_upload.file.file_id,
        filename=presigned_upload.file.filename,
        mime_type=presigned_upload.file.mime_type,
        uploaded_at=presigned_upload.file.uploaded_at,
        storage_type=presigned_upload.file.storage_type,
    )
    return PresignedUploadResponse(
        **response.model_dump(),
        upload_url=presigned_upload.upload_url,
        method=presigned_upload.method,
        headers=presigned_upload.headers,
    )


@router.post(
    "/upload",
    response_model=UploadedFileResponse,
    dependencies=[Depends(rate_limit_by_user("file_upload_writes"))],
)
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    week_id: str = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Upload a single file through the backend for non-S3 storage backends."""
    _check_file_access(current_user)

    if is_s3_storage_enabled():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This deployment uses direct-to-S3 uploads. Request an upload URL first.",
        )

    target_week = week_id or get_week_id()
    mime_type = file.content_type or "application/octet-stream"
    file_data = await _read_and_validate(file)

    drive = get_drive_service()
    if drive:
        try:
            result = upload_file_to_drive(
                file_data=file_data,
                filename=file.filename,
                mime_type=mime_type,
                week_id=target_week,
                volunteer_name=current_user.name,
            )
            logger.info("[FILES] Shared Drive upload OK: %s", result["file_id"])
            return _build_uploaded_file_response(
                request,
                file_id=result["file_id"],
                filename=result["filename"],
                mime_type=mime_type,
                uploaded_at=utc_now().isoformat(),
                storage_type=result["storage_type"],
                drive_link=result["drive_link"],
            )
        except Exception as exc:
            logger.warning("[FILES] Drive upload failed, falling back to local: %s", exc)
            traceback.print_exc()

    return await _upload_local(
        request,
        file_data=file_data,
        filename=file.filename,
        mime_type=mime_type,
        week_id=target_week,
        current_user=current_user,
    )


@router.post(
    "/upload-multiple",
    response_model=List[UploadedFileResponse],
    dependencies=[Depends(rate_limit_by_user("file_upload_writes"))],
)
async def upload_multiple_files(
    request: Request,
    files: List[UploadFile] = File(...),
    week_id: str = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Upload up to 10 files at once for non-S3 storage backends."""
    _check_file_access(current_user)
    if is_s3_storage_enabled():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This deployment uses direct-to-S3 uploads. Upload files one at a time with presigned URLs.",
        )
    if len(files) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 files per upload.",
        )

    target_week = week_id or get_week_id()
    results: List[UploadedFileResponse] = []

    for uploaded_file in files:
        try:
            mime_type = uploaded_file.content_type or "application/octet-stream"
            file_data = await _read_and_validate(uploaded_file)

            drive = get_drive_service()
            if drive:
                try:
                    result = upload_file_to_drive(
                        file_data=file_data,
                        filename=uploaded_file.filename,
                        mime_type=mime_type,
                        week_id=target_week,
                        volunteer_name=current_user.name,
                    )
                    results.append(
                        _build_uploaded_file_response(
                            request,
                            file_id=result["file_id"],
                            filename=result["filename"],
                            mime_type=mime_type,
                            uploaded_at=utc_now().isoformat(),
                            storage_type=result["storage_type"],
                            drive_link=result["drive_link"],
                        )
                    )
                    continue
                except Exception as exc:
                    logger.warning("[FILES] Drive failed for %s: %s", uploaded_file.filename, exc)

            results.append(
                await _upload_local(
                    request,
                    file_data=file_data,
                    filename=uploaded_file.filename,
                    mime_type=mime_type,
                    week_id=target_week,
                    current_user=current_user,
                )
            )
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("[FILES] Error uploading %s: %s", uploaded_file.filename, exc)

    return results


@router.get("/list", response_model=List[FileInfo])
async def list_files(
    request: Request,
    week_id: str = Query(None, description="Filter by week (e.g. 2026-W07)"),
    volunteer_name: str = Query(None, description="Reserved for Drive-based filtering"),
    current_user: User = Depends(get_current_user),
):
    """List files for the current user, or all files for admins/team leads."""
    _check_file_access(current_user)

    if is_s3_storage_enabled() or not get_drive_service():
        storage = get_storage_service()
        owner_id = None if current_user.role in (UserRole.ADMIN, UserRole.TEAM_LEAD) else str(current_user.id)
        raw_files = storage.list_private_files(owner_id=owner_id, week_id=week_id)
        return [
            FileInfo(
                id=file_info["id"],
                name=file_info["name"],
                mime_type=file_info.get("mime_type"),
                web_link=_build_internal_download_link(request, file_info["id"]),
                size=file_info.get("size"),
                created_time=file_info.get("created_time"),
            )
            for file_info in raw_files
        ]

    drive = get_drive_service()
    is_admin = current_user.role in (UserRole.ADMIN, UserRole.TEAM_LEAD)
    target_name = volunteer_name if is_admin and volunteer_name else (None if is_admin else current_user.name)

    try:
        raw_files = drive.list_files(volunteer_name=target_name, week_id=week_id)
        return [
            FileInfo(
                id=file_info["id"],
                name=file_info["name"],
                mime_type=file_info.get("mimeType"),
                web_link=file_info.get("webViewLink"),
                size=file_info.get("size"),
                created_time=file_info.get("createdTime"),
            )
            for file_info in raw_files
        ]
    except Exception as exc:
        logger.error("[FILES] list_files error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list files: {exc}",
        ) from exc


@router.get("/download-link/{file_id}", response_model=DownloadLinkResponse)
async def get_download_link(
    file_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Return a short-lived, browser-safe download URL for a private file."""
    _check_file_access(current_user)
    return DownloadLinkResponse(url=_build_signed_download_link(request, file_id))


@router.get("/download/{file_id}")
async def download_file(
    file_id: str,
    token: str | None = Query(default=None),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Download a file by ID, using auth headers or a short-lived signed token."""
    _authorize_download(file_id, token, current_user)

    if is_s3_storage_enabled():
        storage = get_storage_service()
        try:
            return RedirectResponse(url=storage.create_download_url(file_id), status_code=status.HTTP_307_TEMPORARY_REDIRECT)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                raise HTTPException(status_code=404, detail="File not found.") from exc
            raise HTTPException(status_code=500, detail=f"S3 error: {exc}") from exc
        except BotoCoreError as exc:
            raise HTTPException(status_code=500, detail=f"S3 error: {exc}") from exc

    drive = get_drive_service()
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
        except HttpError as exc:
            if exc.resp.status == 404:
                raise HTTPException(status_code=404, detail="File not found on Drive.") from exc
            raise HTTPException(status_code=500, detail=f"Drive error: {exc}") from exc
        except Exception as exc:
            logger.error("[FILES] Download error: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Download failed: {exc}") from exc

    storage = get_storage_service()
    file_object = storage.get_object(file_id)
    if file_object is None:
        raise HTTPException(status_code=404, detail="File not found.")

    return Response(
        content=file_object.content,
        media_type=file_object.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{file_object.filename}"'},
    )


@router.delete(
    "/{file_id}",
    dependencies=[Depends(rate_limit_by_user("file_upload_writes"))],
)
async def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a private file from S3, Drive, or local storage."""
    _check_file_access(current_user)

    is_ops = current_user.role in (UserRole.ADMIN, UserRole.TEAM_LEAD)

    if is_s3_storage_enabled() or not get_drive_service():
        storage_key = decode_storage_key(file_id)
        if not is_ops:
            owner_id = storage_key.split("/", 3)[1] if "/" in storage_key else ""
            if owner_id != str(current_user.id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized to delete this file.",
                )

        storage = get_storage_service()
        if storage.delete_file(file_id):
            return {"success": True, "message": "File deleted successfully."}
        raise HTTPException(status_code=404, detail="File not found.")

    drive = get_drive_service()
    if not is_ops:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and team leads can delete files from the Shared Drive.",
        )

    try:
        drive.delete_file(file_id)
        return {"success": True, "message": "File deleted from Shared Drive."}
    except HttpError as exc:
        if exc.resp.status == 404:
            raise HTTPException(status_code=404, detail="File not found on Drive.") from exc
        raise HTTPException(status_code=500, detail=f"Drive error: {exc}") from exc
    except Exception as exc:
        logger.error("[FILES] Delete error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Delete failed: {exc}") from exc


@router.get("/folder-link")
async def get_submission_folder_link(
    week_id: str = None,
    current_user: User = Depends(get_current_user),
):
    """Get info about where files are stored."""
    if is_s3_storage_enabled():
        storage = get_storage_service()
        return {
            "storage_type": "s3",
            "week_id": week_id or get_week_id(),
            "folder_name": getattr(storage, "bucket_name", None),
            "folder_link": None,
            "message": "Files are uploaded to AWS S3.",
        }

    drive = get_drive_service()
    if drive:
        return {
            "storage_type": "shared_drive",
            "week_id": week_id or get_week_id(),
            "folder_name": "Volunteer Submissions",
            "folder_link": f"https://drive.google.com/drive/folders/{drive._shared_drive_id}",
            "message": "Files are uploaded to the organization's Shared Drive.",
        }

    return {
        "storage_type": "local",
        "week_id": week_id or get_week_id(),
        "folder_link": None,
        "message": "Files are stored on the local server.",
    }


@router.post(
    "/public/upload",
    response_model=PublicFileResponse,
    dependencies=[Depends(rate_limit_by_user("file_upload_writes"))],
)
async def upload_public_image(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a public image, such as a project banner."""
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    file_data = await _read_and_validate(file, max_size=MAX_PUBLIC_IMAGE_SIZE)
    mime_type = file.content_type or "application/octet-stream"
    storage = get_storage_service()
    result = storage.upload_public_file(
        file_data=file_data,
        filename=file.filename or "image",
        mime_type=mime_type,
    )
    return PublicFileResponse(url=_resolve_public_file_url(request, result.file_id), filename=result.filename)


@router.get("/public/{file_id}")
async def get_public_file(file_id: str):
    """Serve public assets such as project banner images."""
    storage_key = decode_storage_key(file_id)
    if not storage_key.startswith(PUBLIC_PREFIX):
        raise HTTPException(status_code=404, detail="Public file not found.")

    if is_s3_storage_enabled():
        storage = get_storage_service()
        settings = storage.settings  # type: ignore[attr-defined]
        if settings.aws_public_assets_base_url:
            return RedirectResponse(
                url=f"{settings.aws_public_assets_base_url.rstrip('/')}/{storage_key}",
                status_code=status.HTTP_307_TEMPORARY_REDIRECT,
            )

    storage = get_storage_service()
    file_object = storage.get_object(file_id)
    if file_object is None:
        raise HTTPException(status_code=404, detail="Public file not found.")

    return Response(content=file_object.content, media_type=file_object.mime_type)
