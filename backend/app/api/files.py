"""
File management API endpoints.

Private volunteer files use a configurable backend:
1. Explicit backend from PRIVATE_FILE_STORAGE_BACKEND when set
2. Otherwise AWS S3 when configured
3. Otherwise Google Shared Drive when configured
4. Otherwise local filesystem for development fallback

Public project assets continue to use the object-store backend.
"""

from __future__ import annotations

import logging
import traceback
from pathlib import Path
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import RedirectResponse, Response
from googleapiclient.errors import HttpError
from pydantic import BaseModel
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings
from app.core.drive import get_drive_service, upload_file_to_drive, upload_project_file_to_drive
from app.core.project_access import can_contribute_to_project, can_view_project_submission
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
from app.models.project import Project
from app.models.project_file import ProjectFile, ProjectFileResponse, ProjectFileSourceType
from app.models.project_work_item import ProjectWorkItem
from app.models.submission import Submission
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["Files"])
project_files_router = APIRouter(prefix="/projects", tags=["Files"])
submission_files_router = APIRouter(prefix="/submissions", tags=["Files"])

PRIVATE_STORAGE_S3 = "s3"
PRIVATE_STORAGE_SHARED_DRIVE = "shared_drive"
PRIVATE_STORAGE_LOCAL = "local"
_DRIVE_SERVICE_UNSET = object()

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
    project_file_id: str | None = None
    project_id: str | None = None
    project_name: str | None = None
    submission_id: str | None = None
    work_item_id: str | None = None
    source_type: ProjectFileSourceType | None = None
    uploaded_by_name: str | None = None
    week_id: str | None = None
    size_bytes: int | None = None


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
    project_id: str | None = None
    submission_id: str | None = None
    work_item_id: str | None = None
    source_type: ProjectFileSourceType | None = None


class FinalizeUploadRequest(BaseModel):
    """Finalize metadata for a direct upload after the browser PUT succeeds."""

    file_id: str
    filename: str
    mime_type: str
    uploaded_at: str
    storage_type: str
    size: int | None = None
    week_id: str | None = None
    project_id: str | None = None
    submission_id: str | None = None
    work_item_id: str | None = None
    source_type: ProjectFileSourceType | None = None


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


class _ResolvedUploadContext(BaseModel):
    project_id: str | None = None
    project_name: str | None = None
    submission_id: str | None = None
    work_item_id: str | None = None
    source_type: ProjectFileSourceType | None = None
    week_id: str | None = None
    work_item_title: str | None = None


async def _get_project_for_file_context(project_id: str, current_user: User) -> Project:
    try:
        project = await Project.get(ObjectId(project_id), fetch_links=True)
    except Exception:
        project = None

    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    if not can_contribute_to_project(project, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Project contribution access required.",
        )

    return project


async def _resolve_upload_context(
    *,
    current_user: User,
    week_id: str | None,
    project_id: str | None,
    submission_id: str | None,
    work_item_id: str | None,
    source_type: ProjectFileSourceType | None,
) -> _ResolvedUploadContext:
    """Validate upload context and load linked records when needed."""
    if not project_id:
        return _ResolvedUploadContext(week_id=week_id)

    project = await _get_project_for_file_context(project_id, current_user)
    resolved_source_type = source_type

    resolved_submission_id: str | None = None
    if submission_id:
        try:
            submission = await Submission.get(ObjectId(submission_id))
        except Exception:
            submission = None

        if submission is None or getattr(submission, "project_id", None) != str(project.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")

        is_ops = current_user.role in (UserRole.ADMIN, UserRole.TEAM_LEAD)
        if str(current_user.id) != submission.user_id and not is_ops:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the submission owner or operations staff can attach files to this submission.",
            )

        resolved_submission_id = str(submission.id)
        resolved_source_type = resolved_source_type or ProjectFileSourceType.SUBMISSION
        week_id = week_id or submission.week_id

    resolved_work_item_id: str | None = None
    work_item_title: str | None = None
    if work_item_id:
        try:
            work_item = await ProjectWorkItem.get(ObjectId(work_item_id))
        except Exception:
            work_item = None

        if work_item is None or str(work_item.project_id) != str(project.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work item not found.")

        resolved_work_item_id = str(work_item.id)
        work_item_title = getattr(work_item, "title", None)
        resolved_source_type = resolved_source_type or ProjectFileSourceType.WORK_ITEM

    resolved_source_type = resolved_source_type or ProjectFileSourceType.PROJECT

    return _ResolvedUploadContext(
        project_id=str(project.id),
        project_name=project.name,
        submission_id=resolved_submission_id,
        work_item_id=resolved_work_item_id,
        source_type=resolved_source_type,
        week_id=week_id,
        work_item_title=work_item_title,
    )


def _serialize_project_file(project_file: ProjectFile, request: Request) -> ProjectFileResponse:
    """Convert a persisted project file into the upload/list response shape."""
    drive_link = project_file.external_link or _build_internal_download_link(request, project_file.storage_file_id)
    return ProjectFileResponse(
        project_file_id=str(project_file.id),
        file_id=project_file.storage_file_id,
        filename=project_file.filename,
        mime_type=project_file.mime_type,
        drive_link=drive_link,
        uploaded_at=project_file.created_at.isoformat(),
        storage_type=project_file.storage_type,
        project_id=project_file.project_id,
        project_name=project_file.project_name,
        submission_id=project_file.submission_id,
        work_item_id=project_file.work_item_id,
        source_type=project_file.source_type,
        uploaded_by_name=project_file.uploaded_by_name,
        week_id=project_file.week_id,
        size_bytes=project_file.size_bytes,
    )


async def _create_project_file_metadata(
    *,
    context: _ResolvedUploadContext,
    current_user: User,
    file_id: str,
    filename: str,
    mime_type: str,
    storage_type: str,
    external_link: str | None,
    size_bytes: int | None,
) -> ProjectFile | None:
    """Persist project-linked file metadata when project context is provided."""
    if not context.project_id or not context.source_type:
        return None

    project_file = ProjectFile(
        project_id=context.project_id,
        project_name=context.project_name,
        submission_id=context.submission_id,
        work_item_id=context.work_item_id,
        source_type=context.source_type,
        storage_file_id=file_id,
        storage_type=storage_type,
        external_link=external_link,
        filename=filename,
        mime_type=mime_type,
        size_bytes=size_bytes,
        week_id=context.week_id,
        uploaded_by_user_id=str(current_user.id),
        uploaded_by_name=current_user.name,
    )
    await project_file.insert()
    return project_file


def _attach_project_file_fields(
    response: UploadedFileResponse,
    project_file: ProjectFile | None,
) -> UploadedFileResponse:
    """Copy persisted project metadata onto an upload response."""
    if project_file is None:
        return response

    return response.model_copy(
        update={
            "project_file_id": str(project_file.id),
            "project_id": project_file.project_id,
            "project_name": project_file.project_name,
            "submission_id": project_file.submission_id,
            "work_item_id": project_file.work_item_id,
            "source_type": project_file.source_type,
            "uploaded_by_name": project_file.uploaded_by_name,
            "week_id": project_file.week_id,
            "size_bytes": project_file.size_bytes,
        }
    )


def _get_private_file_storage_backend(drive_service=_DRIVE_SERVICE_UNSET) -> str:
    """Return the active backend for volunteer submission files."""
    configured_backend = get_settings().private_file_storage_backend
    drive = get_drive_service() if drive_service is _DRIVE_SERVICE_UNSET else drive_service
    s3_enabled = is_s3_storage_enabled()

    if configured_backend == "drive":
        if drive:
            return PRIVATE_STORAGE_SHARED_DRIVE
        return PRIVATE_STORAGE_S3 if s3_enabled else PRIVATE_STORAGE_LOCAL
    if configured_backend == "s3":
        if s3_enabled:
            return PRIVATE_STORAGE_S3
        return PRIVATE_STORAGE_SHARED_DRIVE if drive else PRIVATE_STORAGE_LOCAL
    if configured_backend == "local":
        return PRIVATE_STORAGE_LOCAL

    if s3_enabled:
        return PRIVATE_STORAGE_S3
    if drive:
        return PRIVATE_STORAGE_SHARED_DRIVE
    return PRIVATE_STORAGE_LOCAL


def _check_file_access(
    current_user: User,
    *,
    allow_storage_after_expiry: bool = False,
) -> None:
    """Raise 403 if the user's legacy file access window has expired."""
    if current_user.role in (UserRole.ADMIN, UserRole.TEAM_LEAD):
        return
    if allow_storage_after_expiry:
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
    context: _ResolvedUploadContext,
) -> UploadedFileResponse:
    storage = get_storage_service()
    result = storage.upload_volunteer_file(
        file_data=file_data,
        filename=filename,
        mime_type=mime_type,
        owner_id=str(current_user.id),
        week_id=week_id,
    )
    response = _build_uploaded_file_response(
        request,
        file_id=result.file_id,
        filename=result.filename,
        mime_type=result.mime_type,
        uploaded_at=result.uploaded_at,
        storage_type=result.storage_type,
    )
    project_file = await _create_project_file_metadata(
        context=context,
        current_user=current_user,
        file_id=result.file_id,
        filename=result.filename,
        mime_type=result.mime_type,
        storage_type=result.storage_type,
        external_link=None,
        size_bytes=len(file_data),
    )
    return _attach_project_file_fields(response, project_file)


@router.get("/drive-status", response_model=DriveStatusResponse)
async def get_drive_status(current_user: User = Depends(get_current_user)):
    """Report which storage backend is currently active."""
    drive = get_drive_service()
    private_backend = _get_private_file_storage_backend(drive)

    if private_backend == PRIVATE_STORAGE_S3:
        storage = get_storage_service()
        return DriveStatusResponse(
            configured=True,
            message="AWS S3 storage is active for volunteer file uploads.",
            storage_type=PRIVATE_STORAGE_S3,
            drive_name=getattr(storage, "bucket_name", None),
        )

    if private_backend == PRIVATE_STORAGE_SHARED_DRIVE and drive:
        return DriveStatusResponse(
            configured=True,
            message="Organization Shared Drive is active for volunteer file uploads.",
            storage_type=PRIVATE_STORAGE_SHARED_DRIVE,
            drive_name="Volunteer Submissions",
        )

    return DriveStatusResponse(
        configured=False,
        message="Cloud storage is not configured for volunteer files. Files are stored on the local server.",
        storage_type=PRIVATE_STORAGE_LOCAL,
    )


@router.get("/drive-test")
async def test_drive_connection(current_user: User = Depends(get_current_user)):
    """Test the active cloud storage connection."""
    drive = get_drive_service()
    private_backend = _get_private_file_storage_backend(drive)

    if private_backend == PRIVATE_STORAGE_S3:
        storage = get_storage_service()
        return {
            "success": True,
            "storage_type": PRIVATE_STORAGE_S3,
            "bucket": getattr(storage, "bucket_name", None),
            "region": getattr(storage, "settings", None).aws_region if hasattr(storage, "settings") else None,
        }

    if private_backend != PRIVATE_STORAGE_SHARED_DRIVE or not drive:
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
    _check_file_access(current_user, allow_storage_after_expiry=True)
    if _get_private_file_storage_backend() != PRIVATE_STORAGE_S3:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Direct uploads are only available when volunteer files use S3 storage.",
        )

    _validate_upload_request(payload.filename, payload.size)
    context = await _resolve_upload_context(
        current_user=current_user,
        week_id=payload.week_id,
        project_id=payload.project_id,
        submission_id=payload.submission_id,
        work_item_id=payload.work_item_id,
        source_type=payload.source_type,
    )
    target_week = context.week_id or get_week_id()
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
    "/upload-complete",
    response_model=UploadedFileResponse,
    dependencies=[Depends(rate_limit_by_user("file_upload_writes"))],
)
async def finalize_upload(
    payload: FinalizeUploadRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Persist project/submission metadata after a direct upload succeeds."""
    _check_file_access(current_user, allow_storage_after_expiry=True)
    context = await _resolve_upload_context(
        current_user=current_user,
        week_id=payload.week_id,
        project_id=payload.project_id,
        submission_id=payload.submission_id,
        work_item_id=payload.work_item_id,
        source_type=payload.source_type,
    )
    response = _build_uploaded_file_response(
        request,
        file_id=payload.file_id,
        filename=payload.filename,
        mime_type=payload.mime_type,
        uploaded_at=payload.uploaded_at,
        storage_type=payload.storage_type,
    )
    project_file = await _create_project_file_metadata(
        context=context,
        current_user=current_user,
        file_id=payload.file_id,
        filename=payload.filename,
        mime_type=payload.mime_type,
        storage_type=payload.storage_type,
        external_link=None,
        size_bytes=payload.size,
    )
    return _attach_project_file_fields(response, project_file)


@router.post(
    "/upload",
    response_model=UploadedFileResponse,
    dependencies=[Depends(rate_limit_by_user("file_upload_writes"))],
)
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    week_id: str = Form(None),
    project_id: str | None = Form(None),
    submission_id: str | None = Form(None),
    work_item_id: str | None = Form(None),
    source_type: ProjectFileSourceType | None = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Upload a single file through the backend for non-S3 storage backends."""
    _check_file_access(current_user, allow_storage_after_expiry=True)

    drive = get_drive_service()
    private_backend = _get_private_file_storage_backend(drive)

    if private_backend == PRIVATE_STORAGE_S3:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This deployment uses direct-to-S3 uploads. Request an upload URL first.",
        )

    context = await _resolve_upload_context(
        current_user=current_user,
        week_id=week_id,
        project_id=project_id,
        submission_id=submission_id,
        work_item_id=work_item_id,
        source_type=source_type,
    )
    target_week = context.week_id or get_week_id()
    mime_type = file.content_type or "application/octet-stream"
    file_data = await _read_and_validate(file)

    if private_backend == PRIVATE_STORAGE_SHARED_DRIVE and drive:
        try:
            if context.project_id and context.project_name and context.source_type:
                result = upload_project_file_to_drive(
                    file_data=file_data,
                    filename=file.filename,
                    mime_type=mime_type,
                    project_id=context.project_id,
                    project_name=context.project_name,
                    volunteer_name=current_user.name,
                    source_type=context.source_type,
                    week_id=context.week_id,
                    work_item_id=context.work_item_id,
                    work_item_title=context.work_item_title,
                )
            else:
                result = upload_file_to_drive(
                    file_data=file_data,
                    filename=file.filename,
                    mime_type=mime_type,
                    week_id=target_week,
                    volunteer_name=current_user.name,
                )
            logger.info("[FILES] Shared Drive upload OK: %s", result["file_id"])
            response = _build_uploaded_file_response(
                request,
                file_id=result["file_id"],
                filename=result["filename"],
                mime_type=mime_type,
                uploaded_at=utc_now().isoformat(),
                storage_type=result["storage_type"],
                drive_link=result["drive_link"],
            )
            project_file = await _create_project_file_metadata(
                context=context,
                current_user=current_user,
                file_id=result["file_id"],
                filename=result["filename"],
                mime_type=mime_type,
                storage_type=result["storage_type"],
                external_link=result.get("drive_link"),
                size_bytes=len(file_data),
            )
            return _attach_project_file_fields(response, project_file)
        except Exception as exc:
            logger.warning("[FILES] Drive upload failed, falling back to alternate storage: %s", exc)
            traceback.print_exc()

    return await _upload_local(
        request,
        file_data=file_data,
        filename=file.filename,
        mime_type=mime_type,
        week_id=target_week,
        current_user=current_user,
        context=context,
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
    project_id: str | None = Form(None),
    submission_id: str | None = Form(None),
    work_item_id: str | None = Form(None),
    source_type: ProjectFileSourceType | None = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Upload up to 10 files at once for non-S3 storage backends."""
    _check_file_access(current_user, allow_storage_after_expiry=True)
    drive = get_drive_service()
    private_backend = _get_private_file_storage_backend(drive)

    if private_backend == PRIVATE_STORAGE_S3:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This deployment uses direct-to-S3 uploads. Upload files one at a time with presigned URLs.",
        )
    if len(files) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 files per upload.",
        )

    context = await _resolve_upload_context(
        current_user=current_user,
        week_id=week_id,
        project_id=project_id,
        submission_id=submission_id,
        work_item_id=work_item_id,
        source_type=source_type,
    )
    target_week = context.week_id or get_week_id()
    results: List[UploadedFileResponse] = []

    for uploaded_file in files:
        try:
            mime_type = uploaded_file.content_type or "application/octet-stream"
            file_data = await _read_and_validate(uploaded_file)

            if private_backend == PRIVATE_STORAGE_SHARED_DRIVE and drive:
                try:
                    if context.project_id and context.project_name and context.source_type:
                        result = upload_project_file_to_drive(
                            file_data=file_data,
                            filename=uploaded_file.filename,
                            mime_type=mime_type,
                            project_id=context.project_id,
                            project_name=context.project_name,
                            volunteer_name=current_user.name,
                            source_type=context.source_type,
                            week_id=context.week_id,
                            work_item_id=context.work_item_id,
                            work_item_title=context.work_item_title,
                        )
                    else:
                        result = upload_file_to_drive(
                            file_data=file_data,
                            filename=uploaded_file.filename,
                            mime_type=mime_type,
                            week_id=target_week,
                            volunteer_name=current_user.name,
                        )
                    response = _build_uploaded_file_response(
                            request,
                            file_id=result["file_id"],
                            filename=result["filename"],
                            mime_type=mime_type,
                            uploaded_at=utc_now().isoformat(),
                            storage_type=result["storage_type"],
                            drive_link=result["drive_link"],
                        )
                    project_file = await _create_project_file_metadata(
                        context=context,
                        current_user=current_user,
                        file_id=result["file_id"],
                        filename=result["filename"],
                        mime_type=mime_type,
                        storage_type=result["storage_type"],
                        external_link=result.get("drive_link"),
                        size_bytes=len(file_data),
                    )
                    results.append(_attach_project_file_fields(response, project_file))
                    continue
                except Exception as exc:
                    logger.warning("[FILES] Drive failed for %s, falling back to alternate storage: %s", uploaded_file.filename, exc)

            results.append(
                await _upload_local(
                    request,
                    file_data=file_data,
                    filename=uploaded_file.filename,
                    mime_type=mime_type,
                    week_id=target_week,
                    current_user=current_user,
                    context=context,
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
    drive = get_drive_service()
    private_backend = _get_private_file_storage_backend(drive)

    if private_backend != PRIVATE_STORAGE_SHARED_DRIVE:
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


@submission_files_router.get("/{submission_id}/files", response_model=List[ProjectFileResponse])
async def get_submission_files(
    submission_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """List files attached to a specific submission."""
    try:
        submission = await Submission.get(ObjectId(submission_id))
    except Exception:
        submission = None

    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")

    if str(current_user.id) != submission.user_id:
        try:
            project = await Project.get(ObjectId(submission.project_id), fetch_links=True)
        except Exception:
            project = None
        if project is None or not can_view_project_submission(project, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view these submission files.",
            )

    files = await ProjectFile.find(
        {
            "submission_id": submission_id,
            "is_deleted": False,
        }
    ).sort(-ProjectFile.created_at).to_list()
    return [_serialize_project_file(project_file, request) for project_file in files]


@project_files_router.get("/{project_id}/files", response_model=List[ProjectFileResponse])
async def get_project_files(
    project_id: str,
    request: Request,
    source_type: ProjectFileSourceType | None = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    """List project-scoped files, including submission attachments."""
    await _get_project_for_file_context(project_id, current_user)
    query: dict[str, object] = {
        "project_id": project_id,
        "is_deleted": False,
    }
    if source_type is not None:
        query["source_type"] = source_type

    files = await ProjectFile.find(query).sort(-ProjectFile.created_at).to_list()
    return [_serialize_project_file(project_file, request) for project_file in files]


@router.get("/download/{file_id}")
async def download_file(
    file_id: str,
    token: str | None = Query(default=None),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Download a file by ID, using auth headers or a short-lived signed token."""
    _authorize_download(file_id, token, current_user)
    drive = get_drive_service()
    private_backend = _get_private_file_storage_backend(drive)

    if private_backend == PRIVATE_STORAGE_S3:
        storage = get_storage_service()
        try:
            return RedirectResponse(url=storage.create_download_url(file_id), status_code=status.HTTP_307_TEMPORARY_REDIRECT)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                raise HTTPException(status_code=404, detail="File not found.") from exc
            raise HTTPException(status_code=500, detail=f"S3 error: {exc}") from exc
        except BotoCoreError as exc:
            raise HTTPException(status_code=500, detail=f"S3 error: {exc}") from exc

    if private_backend == PRIVATE_STORAGE_SHARED_DRIVE and drive:
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

    if not is_ops:
        # Project leads can delete files attached to their projects
        associated = await ProjectFile.find(
            ProjectFile.storage_file_id == file_id,
            ProjectFile.is_deleted == False,  # noqa: E712
        ).to_list()
        for pf in associated:
            if pf.project_id:
                proj = await Project.get(pf.project_id)
                if proj and proj.lead_id and str(proj.lead_id) == str(current_user.id):
                    is_ops = True
                    break

    drive = get_drive_service()
    private_backend = _get_private_file_storage_backend(drive)

    if private_backend != PRIVATE_STORAGE_SHARED_DRIVE:
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
            project_file_docs = await ProjectFile.find(
                {
                    "storage_file_id": file_id,
                    "is_deleted": False,
                }
            ).to_list()
            for project_file in project_file_docs:
                project_file.is_deleted = True
                project_file.deleted_at = utc_now()
                await project_file.save()
            return {"success": True, "message": "File deleted successfully."}
        raise HTTPException(status_code=404, detail="File not found.")

    if not is_ops:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and team leads can delete files from the Shared Drive.",
        )

    try:
        drive.delete_file(file_id)
        project_file_docs = await ProjectFile.find(
            {
                "storage_file_id": file_id,
                "is_deleted": False,
            }
        ).to_list()
        for project_file in project_file_docs:
            project_file.is_deleted = True
            project_file.deleted_at = utc_now()
            await project_file.save()
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
    drive = get_drive_service()
    private_backend = _get_private_file_storage_backend(drive)

    if private_backend == PRIVATE_STORAGE_S3:
        storage = get_storage_service()
        return {
            "storage_type": PRIVATE_STORAGE_S3,
            "week_id": week_id or get_week_id(),
            "folder_name": getattr(storage, "bucket_name", None),
            "folder_link": None,
            "message": "Volunteer files are uploaded to AWS S3.",
        }

    if private_backend == PRIVATE_STORAGE_SHARED_DRIVE and drive:
        return {
            "storage_type": PRIVATE_STORAGE_SHARED_DRIVE,
            "week_id": week_id or get_week_id(),
            "folder_name": "Volunteer Submissions",
            "folder_link": f"https://drive.google.com/drive/folders/{drive._shared_drive_id}",
            "message": "Volunteer files are uploaded to the organization's Shared Drive.",
        }

    return {
        "storage_type": PRIVATE_STORAGE_LOCAL,
        "week_id": week_id or get_week_id(),
        "folder_link": None,
        "message": "Volunteer files are stored on the local server.",
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
