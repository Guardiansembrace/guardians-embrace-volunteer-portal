"""Backfill submission reported/credited hours and user credited totals.

Usage:
    python scripts/aws/backfill_submission_hours.py --env-file backend/.env.aws
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterable

from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient, UpdateOne

MAX_WEEKLY_HOURS = 168.0
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = REPO_ROOT / ".deployment" / "aws" / "migrations"


@dataclass
class SubmissionHours:
    reported_hours: float
    credited_hours: float
    hour_tracking_sections: list[str]

    @property
    def total_hours(self) -> float:
        return self.reported_hours


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill submission hour fields in MongoDB.")
    parser.add_argument("--env-file", default=str(REPO_ROOT / "backend" / ".env.aws"), help="Path to the backend env file.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Directory where the backfill report is written.")
    parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing them.")
    return parser.parse_args()


def load_env(env_file: str) -> dict[str, str]:
    values = {key: value for key, value in dotenv_values(env_file).items() if value is not None}
    required = ["MONGODB_URI", "MONGODB_DATABASE"]
    missing = [key for key in required if not values.get(key)]
    if missing:
        raise RuntimeError(f"Missing required env vars in {env_file}: {', '.join(missing)}")
    return values


def parse_hours(raw_hours: Any) -> float:
    try:
        hours = float(raw_hours)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid hours value: {raw_hours!r}") from None
    if not math.isfinite(hours):
        raise ValueError(f"Hours must be finite: {raw_hours!r}")
    if hours < 0:
        raise ValueError(f"Hours cannot be negative: {raw_hours!r}")
    if hours > MAX_WEEKLY_HOURS:
        raise ValueError(f"Hours cannot exceed {MAX_WEEKLY_HOURS:.0f}: {raw_hours!r}")
    return hours


def normalize_section_ids(raw_section_ids: Any) -> set[str]:
    if not isinstance(raw_section_ids, list):
        return set()
    return {
        str(section_id)
        for section_id in raw_section_ids
        if isinstance(section_id, (str, int, float)) and str(section_id) and str(section_id) != "future"
    }


def sum_entry_hours(entries: Any) -> float:
    if not isinstance(entries, list):
        return 0.0
    total = 0.0
    for entry in entries:
        if isinstance(entry, dict):
            total += parse_hours(entry.get("hours", 0.0))
    return total


def iter_custom_section_totals(custom_responses: Any) -> Iterable[tuple[str, float]]:
    if not isinstance(custom_responses, dict):
        return []
    totals: list[tuple[str, float]] = []
    for section_id, entries in custom_responses.items():
        totals.append((str(section_id), sum_entry_hours(entries)))
    return totals


def calculate_submission_hours(document: dict[str, Any]) -> SubmissionHours:
    past_hours = sum_entry_hours(document.get("past_work"))
    present_hours = sum_entry_hours(document.get("present_work"))
    _ = sum_entry_hours(document.get("future_work"))

    reported_hours = past_hours + present_hours
    tracked_sections = {"past", "present"}
    tracked_sections.update(normalize_section_ids(document.get("hour_tracking_sections")))

    for section_id, total in iter_custom_section_totals(document.get("custom_responses")):
        if total <= 0:
            continue
        reported_hours += total
        tracked_sections.add(section_id)

    if reported_hours > MAX_WEEKLY_HOURS:
        raise ValueError(f"Reported hours cannot exceed {MAX_WEEKLY_HOURS:.0f}: {reported_hours}")

    return SubmissionHours(
        reported_hours=reported_hours,
        credited_hours=past_hours,
        hour_tracking_sections=sorted(tracked_sections),
    )


def get_previous_week_id(week_id: str) -> str:
    year_str, week_str = week_id.split("-W", maxsplit=1)
    week_start = datetime.fromisocalendar(int(year_str), int(week_str), 1)
    previous_week = week_start - timedelta(days=7)
    previous_iso = previous_week.isocalendar()
    return f"{previous_iso.year}-W{previous_iso.week:02d}"


def calculate_submission_streak(week_ids: set[str]) -> int:
    if not week_ids:
        return 0
    latest_week = max(
        week_ids,
        key=lambda week_id: datetime.fromisocalendar(int(week_id.split("-W", 1)[0]), int(week_id.split("-W", 1)[1]), 1),
    )
    streak = 0
    week_cursor = latest_week
    while week_cursor in week_ids:
        streak += 1
        week_cursor = get_previous_week_id(week_cursor)
    return streak


def main() -> None:
    args = parse_args()
    env_values = load_env(args.env_file)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    client = MongoClient(env_values["MONGODB_URI"])
    database = client[env_values["MONGODB_DATABASE"]]
    submissions_collection = database.submissions
    users_collection = database.users

    submission_updates: list[UpdateOne] = []
    user_credits: dict[str, float] = defaultdict(float)
    user_submission_counts: dict[str, int] = defaultdict(int)
    user_week_ids: dict[str, set[str]] = defaultdict(set)
    invalid_submission_ids: list[str] = []

    try:
        submissions = list(submissions_collection.find({}))
        for submission in submissions:
            submission_id = str(submission.get("_id"))
            try:
                hours = calculate_submission_hours(submission)
            except ValueError:
                invalid_submission_ids.append(submission_id)
                continue

            if (
                submission.get("reported_hours") != hours.reported_hours
                or submission.get("credited_hours") != hours.credited_hours
                or submission.get("total_hours") != hours.total_hours
                or submission.get("hour_tracking_sections") != hours.hour_tracking_sections
            ):
                submission_updates.append(
                    UpdateOne(
                        {"_id": submission["_id"]},
                        {
                            "$set": {
                                "reported_hours": hours.reported_hours,
                                "credited_hours": hours.credited_hours,
                                "total_hours": hours.total_hours,
                                "hour_tracking_sections": hours.hour_tracking_sections,
                            }
                        },
                    )
                )

            if submission.get("status") in {"submitted", "reviewed"}:
                user_id = submission.get("user_id")
                if user_id:
                    user_credits[user_id] += hours.credited_hours
                    user_submission_counts[user_id] += 1
                    week_id = submission.get("week_id")
                    if isinstance(week_id, str) and week_id:
                        user_week_ids[user_id].add(week_id)

        user_updates: list[UpdateOne] = []
        for user in users_collection.find({}, {"total_hours": 1, "total_submissions": 1, "submission_streak": 1}):
            user_id = str(user.get("_id"))
            object_id = user.get("_id")
            if not isinstance(object_id, ObjectId):
                continue
            total_hours = user_credits.get(user_id, 0.0)
            total_submissions = user_submission_counts.get(user_id, 0)
            submission_streak = calculate_submission_streak(user_week_ids.get(user_id, set()))
            if (
                user.get("total_hours") != total_hours
                or user.get("total_submissions") != total_submissions
                or user.get("submission_streak") != submission_streak
            ):
                user_updates.append(
                    UpdateOne(
                        {"_id": object_id},
                        {
                            "$set": {
                                "total_hours": total_hours,
                                "total_submissions": total_submissions,
                                "submission_streak": submission_streak,
                            }
                        },
                    )
                )

        if not args.dry_run:
            if submission_updates:
                submissions_collection.bulk_write(submission_updates, ordered=False)
            if user_updates:
                users_collection.bulk_write(user_updates, ordered=False)

        report = {
            "dry_run": args.dry_run,
            "submissions_scanned": len(submissions),
            "submission_updates": len(submission_updates),
            "user_updates": len(user_updates),
            "invalid_submissions": invalid_submission_ids,
        }
        output_path = output_dir / f"submission-hours-backfill-{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.json"
        output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps({**report, "report_path": str(output_path)}, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    main()
