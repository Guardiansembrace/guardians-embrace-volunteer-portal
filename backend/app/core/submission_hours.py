"""Helpers for calculating and syncing submission hour totals."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Any, Iterable, Mapping

from fastapi import HTTPException, status

from app.models.settings import AdminSettings
from app.models.submission import Submission, SubmissionCreate

MAX_WEEKLY_HOURS = 168.0
_DEFAULT_TRACKED_SECTIONS = {"past", "present"}


@dataclass(frozen=True)
class SubmissionHourTotals:
    reported_hours: float
    credited_hours: float

    @property
    def total_hours(self) -> float:
        """Legacy alias used by existing API consumers."""
        return self.reported_hours


def _normalize_hours(hours: float, section_label: str, index: int) -> float:
    if not isfinite(hours):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{section_label} entry {index} hours must be a valid number.",
        )
    if hours < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{section_label} entry {index} hours cannot be negative.",
        )
    if hours > MAX_WEEKLY_HOURS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{section_label} entry {index} hours cannot exceed {MAX_WEEKLY_HOURS:.0f}.",
        )
    return hours


def _iter_entry_collection(entries: Any) -> Iterable[Any]:
    if entries is None:
        return []
    if isinstance(entries, (str, bytes, Mapping)):
        return []
    if isinstance(entries, Iterable):
        return entries
    return []


def _get_entry_hours(entry: Any) -> float:
    raw_hours = entry.get("hours", 0.0) if isinstance(entry, Mapping) else getattr(entry, "hours", 0.0)
    try:
        return float(raw_hours or 0.0)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hours must be a valid number.",
        ) from exc


def _sum_entry_hours(entries: Any, section_label: str) -> float:
    total = 0.0
    for index, entry in enumerate(_iter_entry_collection(entries), start=1):
        total += _normalize_hours(_get_entry_hours(entry), section_label, index)
    return total


def _custom_section_totals(custom_responses: Mapping[str, Any] | None) -> dict[str, float]:
    section_totals: dict[str, float] = {}
    for section_id, raw_entries in (custom_responses or {}).items():
        entries = list(_iter_entry_collection(raw_entries))
        if not entries:
            continue
        section_totals[section_id] = _sum_entry_hours(entries, f"{section_id} section")
    return section_totals


def _nonzero_section_ids(submission_data: SubmissionCreate) -> set[str]:
    section_ids: set[str] = set()
    if _sum_entry_hours(submission_data.past_work, "Past work") > 0:
        section_ids.add("past")
    if _sum_entry_hours(submission_data.present_work, "Present work") > 0:
        section_ids.add("present")
    for section_id, total in _custom_section_totals(submission_data.custom_responses).items():
        if total > 0:
            section_ids.add(section_id)
    return section_ids


def calculate_submission_hour_totals(
    submission_data: SubmissionCreate,
    tracked_sections: Iterable[str] | None = None,
) -> SubmissionHourTotals:
    """Calculate both reported and credited hours for a submission payload."""
    tracked = set(tracked_sections or _DEFAULT_TRACKED_SECTIONS)
    tracked.add("past")

    past_hours = _sum_entry_hours(submission_data.past_work, "Past work")
    present_hours = _sum_entry_hours(submission_data.present_work, "Present work")
    _sum_entry_hours(submission_data.future_work, "Future work")
    custom_hours = _custom_section_totals(submission_data.custom_responses)

    reported_hours = past_hours
    if "present" in tracked:
        reported_hours += present_hours
    for section_id, total in custom_hours.items():
        if section_id in tracked:
            reported_hours += total

    if reported_hours > MAX_WEEKLY_HOURS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Total weekly hours cannot exceed {MAX_WEEKLY_HOURS:.0f}.",
        )

    return SubmissionHourTotals(
        reported_hours=reported_hours,
        credited_hours=past_hours,
    )


def calculate_total_hours(
    submission_data: SubmissionCreate,
    tracked_sections: Iterable[str] | None = None,
) -> float:
    """Return the legacy total-hours value, which now mirrors reported hours."""
    return calculate_submission_hour_totals(submission_data, tracked_sections).total_hours


def build_submission_create_payload(submission: Submission) -> SubmissionCreate:
    """Rebuild a submission payload for validation and total recalculation."""
    return SubmissionCreate(
        week_id=getattr(submission, "week_id", None),
        project_id=getattr(submission, "project_id", "legacy-project"),
        past_work=submission.past_work,
        present_work=submission.present_work,
        future_work=submission.future_work,
        blockers=submission.blockers,
        notes=submission.notes,
        mood_rating=submission.mood_rating,
        custom_responses=submission.custom_responses or {},
    )


async def get_current_hour_tracking_sections() -> set[str]:
    """Load the current form sections that are configured to track hours."""
    tracked_sections = set(_DEFAULT_TRACKED_SECTIONS)
    try:
        settings_doc = await AdminSettings.find_one({"settings_id": "global"})
    except Exception:
        settings_doc = None

    form_sections = getattr(settings_doc, "form_sections", None) or []
    if form_sections:
        tracked_sections.update(
            section.id
            for section in form_sections
            if getattr(section, "showHours", False) and getattr(section, "id", None) != "future"
        )

    tracked_sections.add("past")
    return tracked_sections


def resolve_hour_tracking_sections(
    submission: Submission | SubmissionCreate,
    tracked_sections: Iterable[str] | None = None,
) -> set[str]:
    """Resolve the sections that should count toward reported hours."""
    resolved = set(tracked_sections or getattr(submission, "hour_tracking_sections", []) or _DEFAULT_TRACKED_SECTIONS)
    resolved.update(_nonzero_section_ids(build_submission_create_payload(submission) if isinstance(submission, Submission) else submission))
    resolved.update(_DEFAULT_TRACKED_SECTIONS)
    resolved.add("past")
    return resolved


def sync_submission_total_hours(
    submission: Submission,
    tracked_sections: Iterable[str] | None = None,
) -> float:
    """Validate stored hours and keep reported, credited, and legacy totals in sync."""
    resolved_sections = resolve_hour_tracking_sections(submission, tracked_sections)
    totals = calculate_submission_hour_totals(build_submission_create_payload(submission), resolved_sections)
    submission.hour_tracking_sections = sorted(resolved_sections)
    submission.reported_hours = totals.reported_hours
    submission.credited_hours = totals.credited_hours
    submission.total_hours = totals.total_hours
    return totals.total_hours
