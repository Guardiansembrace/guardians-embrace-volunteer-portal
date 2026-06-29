#!/usr/bin/env python
"""Migrate private volunteer uploads from S3 into the shared Google Drive.

This script is intentionally conservative:
- it only migrates objects under the `private/` prefix
- it never deletes S3 source files unless `--delete-source` is passed
- it skips Drive files that already exist with the same name in the same target folder
- it writes a manifest JSON file for every run
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import boto3
from bson import ObjectId
from botocore.exceptions import BotoCoreError, ClientError
from pymongo import MongoClient


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_PATH = REPO_ROOT / "backend" / ".env.aws"
DEFAULT_OUTPUT_DIR = REPO_ROOT / ".deployment" / "aws" / "migrations"


@dataclass
class MigrationResult:
    source_key: str
    owner_id: str
    owner_email: str | None
    owner_name: str | None
    week_id: str
    filename: str
    status: str
    message: str | None = None
    drive_file_id: str | None = None
    drive_link: str | None = None
    source_deleted: bool = False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-env", default=str(DEFAULT_ENV_PATH), help="Path to the backend env file")
    parser.add_argument("--environment-name", default="test", help="Environment name used to resolve the outputs file")
    parser.add_argument("--bucket", default="", help="S3 bucket name. Defaults to the bucket in .deployment/aws/<env>-outputs.json")
    parser.add_argument("--prefix", default="private/", help="S3 prefix to migrate")
    parser.add_argument("--week-id", default="", help="Optional week filter, such as 2026-W15")
    parser.add_argument("--owner-id", default="", help="Optional owner user id filter")
    parser.add_argument("--limit", type=int, default=0, help="Optional max number of objects to process")
    parser.add_argument("--dry-run", action="store_true", help="Plan the migration without uploading or deleting files")
    parser.add_argument("--delete-source", action="store_true", help="Delete each S3 source object only after a successful Drive upload")
    parser.add_argument("--output", default="", help="Optional manifest output path")
    return parser.parse_args()


def load_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def resolve_bucket_name(environment_name: str, explicit_bucket: str) -> str:
    if explicit_bucket:
        return explicit_bucket

    outputs_path = REPO_ROOT / ".deployment" / "aws" / f"{environment_name}-outputs.json"
    if not outputs_path.exists():
        raise SystemExit(
            f"Could not resolve bucket name. Pass --bucket or create {outputs_path} first."
        )

    outputs = json.loads(outputs_path.read_text(encoding="utf-8"))
    try:
        return outputs["backend"]["uploadsBucketName"]
    except KeyError as exc:
        raise SystemExit(f"Could not find backend.uploadsBucketName in {outputs_path}") from exc


def bootstrap_backend_env(env_values: dict[str, str]) -> None:
    for key, value in env_values.items():
        os.environ[key] = value

    backend_path = str(REPO_ROOT / "backend")
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)


def parse_private_storage_key(storage_key: str) -> tuple[str, str, str] | None:
    parts = storage_key.split("/", 4)
    if len(parts) != 5 or parts[0] != "private":
        return None
    owner_id = parts[1]
    week_id = parts[2]
    filename = unquote(parts[4])
    return owner_id, week_id, filename


def guess_mime_type(filename: str, fallback: str = "application/octet-stream") -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or fallback


def find_existing_drive_file(drive_service: Any, volunteer_name: str, week_id: str, filename: str) -> dict[str, str] | None:
    folder_id = drive_service.get_volunteer_week_folder(volunteer_name, week_id)
    service = drive_service._get_service()  # noqa: SLF001 - acceptable for a migration utility
    escaped_name = filename.replace("'", "\\'")
    response = (
        service.files()
        .list(
            q=f"name='{escaped_name}' and '{folder_id}' in parents and trashed=false",
            fields="files(id, webViewLink)",
            pageSize=1,
            includeItemsFromAllDrives=True,
            supportsAllDrives=True,
            corpora="drive",
            driveId=drive_service._shared_drive_id,  # noqa: SLF001 - acceptable for a migration utility
        )
        .execute()
    )
    files = response.get("files", [])
    return files[0] if files else None


def iter_private_objects(s3_client: Any, bucket_name: str, prefix: str) -> list[dict[str, Any]]:
    paginator = s3_client.get_paginator("list_objects_v2")
    objects: list[dict[str, Any]] = []
    for page in paginator.paginate(Bucket=bucket_name, Prefix=prefix):
        for item in page.get("Contents", []):
            key = item["Key"]
            if key.endswith("/"):
                continue
            objects.append(item)
    return objects


def main() -> int:
    args = parse_args()
    env_path = Path(args.backend_env).resolve()
    if not env_path.exists():
        raise SystemExit(f"Backend env file not found: {env_path}")

    env_values = load_dotenv(env_path)
    bootstrap_backend_env(env_values)

    from app.core.drive import SharedDriveService  # imported after env bootstrap

    bucket_name = resolve_bucket_name(args.environment_name, args.bucket)
    s3_client = boto3.client("s3", region_name=env_values.get("AWS_REGION") or None)
    drive_service = SharedDriveService()
    if not drive_service.is_configured():
        raise SystemExit("Google Drive is not configured. Check GOOGLE_DRIVE_SHARED_DRIVE_ID and service account credentials.")

    client = MongoClient(env_values["MONGODB_URI"])
    database = client[env_values["MONGODB_DATABASE"]]

    objects = iter_private_objects(s3_client, bucket_name, args.prefix)
    if args.owner_id:
        objects = [item for item in objects if f"/{args.owner_id}/" in item["Key"]]
    if args.week_id:
        objects = [item for item in objects if f"/{args.week_id}/" in item["Key"]]
    if args.limit > 0:
        objects = objects[: args.limit]

    results: list[MigrationResult] = []

    for item in objects:
        storage_key = item["Key"]
        parsed = parse_private_storage_key(storage_key)
        if parsed is None:
            results.append(
                MigrationResult(
                    source_key=storage_key,
                    owner_id="",
                    owner_email=None,
                    owner_name=None,
                    week_id="",
                    filename="",
                    status="skipped_invalid_key",
                    message="Storage key did not match the expected private/<owner>/<week>/<uuid>/<filename> format.",
                )
            )
            continue

        owner_id, week_id, filename = parsed
        owner = database.users.find_one({"_id": ObjectId(owner_id)}, {"name": 1, "email": 1})
        owner_name = owner.get("name") if owner else None
        owner_email = owner.get("email") if owner else None

        if not owner_name:
            results.append(
                MigrationResult(
                    source_key=storage_key,
                    owner_id=owner_id,
                    owner_email=owner_email,
                    owner_name=owner_name,
                    week_id=week_id,
                    filename=filename,
                    status="skipped_missing_user",
                    message="No matching user record was found for the S3 owner id.",
                )
            )
            continue

        if args.dry_run:
            results.append(
                MigrationResult(
                    source_key=storage_key,
                    owner_id=owner_id,
                    owner_email=owner_email,
                    owner_name=owner_name,
                    week_id=week_id,
                    filename=filename,
                    status="planned",
                    message="Dry run only. No upload performed.",
                )
            )
            continue

        existing_file = find_existing_drive_file(drive_service, owner_name, week_id, filename)
        if existing_file:
            results.append(
                MigrationResult(
                    source_key=storage_key,
                    owner_id=owner_id,
                    owner_email=owner_email,
                    owner_name=owner_name,
                    week_id=week_id,
                    filename=filename,
                    status="skipped_existing_drive_file",
                    message="A file with the same name already exists in the target Drive folder.",
                    drive_file_id=existing_file.get("id"),
                    drive_link=existing_file.get("webViewLink"),
                )
            )
            continue

        try:
            response = s3_client.get_object(Bucket=bucket_name, Key=storage_key)
            file_data = response["Body"].read()
            mime_type = response.get("ContentType") or guess_mime_type(filename)
            uploaded = drive_service.upload_file(
                file_data=file_data,
                filename=filename,
                mime_type=mime_type,
                volunteer_name=owner_name,
                week_id=week_id,
            )

            source_deleted = False
            if args.delete_source:
                s3_client.delete_object(Bucket=bucket_name, Key=storage_key)
                source_deleted = True

            results.append(
                MigrationResult(
                    source_key=storage_key,
                    owner_id=owner_id,
                    owner_email=owner_email,
                    owner_name=owner_name,
                    week_id=week_id,
                    filename=filename,
                    status="migrated",
                    drive_file_id=uploaded.get("file_id"),
                    drive_link=uploaded.get("drive_link"),
                    source_deleted=source_deleted,
                )
            )
        except (ClientError, BotoCoreError, RuntimeError, ValueError) as exc:
            results.append(
                MigrationResult(
                    source_key=storage_key,
                    owner_id=owner_id,
                    owner_email=owner_email,
                    owner_name=owner_name,
                    week_id=week_id,
                    filename=filename,
                    status="failed",
                    message=str(exc),
                )
            )

    client.close()

    DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = Path(args.output) if args.output else (
        DEFAULT_OUTPUT_DIR / f"private-s3-to-drive-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    )
    output_path.write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "bucket": bucket_name,
                "prefix": args.prefix,
                "dry_run": args.dry_run,
                "delete_source": args.delete_source,
                "results": [asdict(result) for result in results],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    migrated = sum(result.status == "migrated" for result in results)
    planned = sum(result.status == "planned" for result in results)
    skipped = sum(result.status.startswith("skipped") for result in results)
    failed = sum(result.status == "failed" for result in results)

    print(
        json.dumps(
            {
                "bucket": bucket_name,
                "objects_considered": len(results),
                "migrated": migrated,
                "planned": planned,
                "skipped": skipped,
                "failed": failed,
                "manifest": str(output_path),
            },
            indent=2,
        )
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
