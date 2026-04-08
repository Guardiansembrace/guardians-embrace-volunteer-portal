"""
Storage services for volunteer uploads and public project images.

S3 is preferred when configured so the application remains serverless-safe.
The local filesystem implementation remains available for development.
"""

from __future__ import annotations

import base64
import logging
import mimetypes
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote, unquote

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings
from app.core.time import utc_now

logger = logging.getLogger(__name__)

PRIVATE_PREFIX = "private"
PUBLIC_PREFIX = "public/project-banners"


@dataclass
class StoredFile:
    """Canonical file metadata returned by storage backends."""

    file_id: str
    filename: str
    mime_type: str
    storage_key: str
    storage_type: str
    uploaded_at: str

    def asdict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class PresignedUpload:
    """Data needed for a direct browser upload to S3."""

    file: StoredFile
    upload_url: str
    method: str = "PUT"
    headers: dict[str, str] | None = None


@dataclass
class StorageObject:
    """Downloaded object content and metadata."""

    content: bytes
    filename: str
    mime_type: str


def encode_storage_key(storage_key: str) -> str:
    """Encode a storage key into a URL-safe token."""
    encoded = base64.urlsafe_b64encode(storage_key.encode("utf-8")).decode("ascii")
    return encoded.rstrip("=")


def decode_storage_key(file_id: str) -> str:
    """Decode a URL-safe storage token back into the storage key."""
    padding = "=" * (-len(file_id) % 4)
    return base64.urlsafe_b64decode((file_id + padding).encode("ascii")).decode("utf-8")


def sanitize_segment(value: str) -> str:
    """Sanitize a path segment while keeping it readable."""
    cleaned = "".join(ch for ch in value if ch.isalnum() or ch in ("-", "_", ".")).strip()
    return cleaned or "unknown"


def build_private_storage_key(owner_id: str, week_id: str, filename: str) -> str:
    """Build a stable private storage key."""
    safe_owner = sanitize_segment(owner_id)
    safe_week = sanitize_segment(week_id)
    encoded_filename = quote(Path(filename).name, safe="")
    return f"{PRIVATE_PREFIX}/{safe_owner}/{safe_week}/{uuid.uuid4().hex}/{encoded_filename}"


def build_public_storage_key(filename: str) -> str:
    """Build a stable public storage key."""
    encoded_filename = quote(Path(filename).name, safe="")
    return f"{PUBLIC_PREFIX}/{uuid.uuid4().hex}/{encoded_filename}"


def filename_from_storage_key(storage_key: str) -> str:
    """Recover the original filename from a storage key."""
    return unquote(storage_key.rsplit("/", 1)[-1])


def guess_mime_type(filename: str, fallback: str = "application/octet-stream") -> str:
    """Guess a MIME type from the filename when none is stored."""
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or fallback


class LocalStorageService:
    """Filesystem-backed storage for development."""

    storage_type = "local"

    def __init__(self) -> None:
        self.settings = get_settings()
        self.upload_dir = Path(__file__).parent.parent.parent / "uploads"
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def upload_volunteer_file(
        self,
        *,
        file_data: bytes,
        filename: str,
        mime_type: str,
        owner_id: str,
        week_id: str,
    ) -> StoredFile:
        storage_key = build_private_storage_key(owner_id=owner_id, week_id=week_id, filename=filename)
        file_path = self.upload_dir / storage_key
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(file_data)
        logger.info("Saved local volunteer file: %s", storage_key)
        return StoredFile(
            file_id=encode_storage_key(storage_key),
            filename=filename,
            mime_type=mime_type,
            storage_key=storage_key,
            storage_type=self.storage_type,
            uploaded_at=utc_now().isoformat(),
        )

    def upload_public_file(
        self,
        *,
        file_data: bytes,
        filename: str,
        mime_type: str,
    ) -> StoredFile:
        storage_key = build_public_storage_key(filename)
        file_path = self.upload_dir / storage_key
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(file_data)
        logger.info("Saved local public file: %s", storage_key)
        return StoredFile(
            file_id=encode_storage_key(storage_key),
            filename=filename,
            mime_type=mime_type,
            storage_key=storage_key,
            storage_type=self.storage_type,
            uploaded_at=utc_now().isoformat(),
        )

    def get_object(self, file_id: str) -> Optional[StorageObject]:
        storage_key = decode_storage_key(file_id)
        file_path = self.upload_dir / storage_key
        if not file_path.exists():
            return None
        filename = filename_from_storage_key(storage_key)
        return StorageObject(
            content=file_path.read_bytes(),
            filename=filename,
            mime_type=guess_mime_type(filename),
        )

    def delete_file(self, file_id: str) -> bool:
        storage_key = decode_storage_key(file_id)
        file_path = self.upload_dir / storage_key
        if not file_path.exists():
            return False
        file_path.unlink()
        logger.info("Deleted local file: %s", storage_key)
        return True

    def list_private_files(
        self,
        *,
        owner_id: Optional[str] = None,
        week_id: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        prefix_parts = [PRIVATE_PREFIX]
        if owner_id:
            prefix_parts.append(sanitize_segment(owner_id))
        if week_id:
            prefix_parts.append(sanitize_segment(week_id))
        prefix = "/".join(prefix_parts)
        files: list[dict[str, Any]] = []

        for path in self.upload_dir.rglob("*"):
            if not path.is_file():
                continue
            storage_key = path.relative_to(self.upload_dir).as_posix()
            if prefix and not storage_key.startswith(prefix):
                continue

            filename = filename_from_storage_key(storage_key)
            stat = path.stat()
            files.append(
                {
                    "id": encode_storage_key(storage_key),
                    "name": filename,
                    "mime_type": guess_mime_type(filename),
                    "size": str(stat.st_size),
                    "created_time": datetime.fromtimestamp(stat.st_mtime, tz=utc_now().tzinfo).isoformat(),
                }
            )

        files.sort(key=lambda item: item["created_time"], reverse=True)
        return files


class S3StorageService:
    """S3-backed storage for serverless deployments."""

    storage_type = "s3"

    def __init__(self) -> None:
        self.settings = get_settings()
        self.bucket_name = self.settings.aws_s3_bucket
        self.client = boto3.client("s3", region_name=self.settings.aws_region or None)

    def is_configured(self) -> bool:
        return bool(self.bucket_name)

    def create_private_upload(
        self,
        *,
        filename: str,
        mime_type: str,
        owner_id: str,
        week_id: str,
    ) -> PresignedUpload:
        storage_key = build_private_storage_key(owner_id=owner_id, week_id=week_id, filename=filename)
        stored_file = StoredFile(
            file_id=encode_storage_key(storage_key),
            filename=filename,
            mime_type=mime_type,
            storage_key=storage_key,
            storage_type=self.storage_type,
            uploaded_at=utc_now().isoformat(),
        )
        upload_url = self.client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket_name,
                "Key": storage_key,
                "ContentType": mime_type,
            },
            ExpiresIn=300,
        )
        return PresignedUpload(
            file=stored_file,
            upload_url=upload_url,
            headers={"Content-Type": mime_type},
        )

    def upload_public_file(
        self,
        *,
        file_data: bytes,
        filename: str,
        mime_type: str,
    ) -> StoredFile:
        storage_key = build_public_storage_key(filename)
        self.client.put_object(
            Bucket=self.bucket_name,
            Key=storage_key,
            Body=file_data,
            ContentType=mime_type,
        )
        logger.info("Uploaded public S3 file: %s", storage_key)
        return StoredFile(
            file_id=encode_storage_key(storage_key),
            filename=filename,
            mime_type=mime_type,
            storage_key=storage_key,
            storage_type=self.storage_type,
            uploaded_at=utc_now().isoformat(),
        )

    def get_object(self, file_id: str) -> Optional[StorageObject]:
        storage_key = decode_storage_key(file_id)
        try:
            response = self.client.get_object(Bucket=self.bucket_name, Key=storage_key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                return None
            raise

        filename = filename_from_storage_key(storage_key)
        return StorageObject(
            content=response["Body"].read(),
            filename=filename,
            mime_type=response.get("ContentType") or guess_mime_type(filename),
        )

    def create_download_url(self, file_id: str, *, expires_seconds: int = 300, inline: bool = False) -> str:
        storage_key = decode_storage_key(file_id)
        filename = filename_from_storage_key(storage_key)
        disposition = "inline" if inline else "attachment"
        safe_filename = filename.replace('"', "")
        return self.client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket_name,
                "Key": storage_key,
                "ResponseContentDisposition": f'{disposition}; filename="{safe_filename}"',
            },
            ExpiresIn=expires_seconds,
        )

    def delete_file(self, file_id: str) -> bool:
        storage_key = decode_storage_key(file_id)
        self.client.delete_object(Bucket=self.bucket_name, Key=storage_key)
        logger.info("Deleted S3 file: %s", storage_key)
        return True

    def list_private_files(
        self,
        *,
        owner_id: Optional[str] = None,
        week_id: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        prefix_parts = [PRIVATE_PREFIX]
        if owner_id:
            prefix_parts.append(sanitize_segment(owner_id))
        if week_id:
            prefix_parts.append(sanitize_segment(week_id))
        prefix = "/".join(prefix_parts)

        paginator = self.client.get_paginator("list_objects_v2")
        files: list[dict[str, Any]] = []

        for page in paginator.paginate(Bucket=self.bucket_name, Prefix=prefix):
            for item in page.get("Contents", []):
                storage_key = item["Key"]
                if storage_key.endswith("/"):
                    continue
                filename = filename_from_storage_key(storage_key)
                files.append(
                    {
                        "id": encode_storage_key(storage_key),
                        "name": filename,
                        "mime_type": guess_mime_type(filename),
                        "size": str(item.get("Size", 0)),
                        "created_time": item["LastModified"].isoformat(),
                    }
                )

        files.sort(key=lambda item: item["created_time"], reverse=True)
        return files


_storage_service: Optional[object] = None


def get_storage_service() -> LocalStorageService | S3StorageService:
    """Return the configured object storage backend."""
    global _storage_service
    settings = get_settings()

    if isinstance(_storage_service, S3StorageService) and _storage_service.bucket_name == settings.aws_s3_bucket:
        return _storage_service
    if isinstance(_storage_service, LocalStorageService) and not settings.aws_s3_bucket:
        return _storage_service

    if settings.aws_s3_bucket:
        _storage_service = S3StorageService()
    else:
        _storage_service = LocalStorageService()
    return _storage_service


def is_s3_storage_enabled() -> bool:
    """Return True when S3 is configured as the primary object store."""
    return bool(get_settings().aws_s3_bucket)
