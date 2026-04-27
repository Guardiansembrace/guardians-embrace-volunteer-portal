"""
Submissions API endpoints.
Handles weekly volunteer submissions - create, update, submit, and review.
"""

import logging
from datetime import timedelta
from typing import List, Optional

logger = logging.getLogger(__name__)

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.admin_access import AdminAccessScope, get_admin_access_context, require_admin_scopes
from app.core.config import load_shared_config
from app.core.project_access import can_contribute_to_project, can_view_project_submission
from app.core.rate_limit import rate_limit_by_user
from app.core.security import get_current_user
from app.core.submission_hours import (
    MAX_WEEKLY_HOURS,
    calculate_submission_hour_totals,
    get_current_hour_tracking_sections,
    sync_submission_total_hours,
)
from app.core.time import utc_now
from app.core.user_stats import sync_user_submission_stats, sync_user_submission_stats_by_user_id
from app.core.utils import (
    can_submit_for_week,
    get_schedule_now,
    get_submission_deadline,
    get_submission_window_bounds,
    get_previous_week_id,
    get_week_boundaries,
    get_week_id,
    is_submission_window_open,
)
from app.core.weekly_updates import get_weekly_update_settings
from app.models.project import Project
from app.models.project_work_item import ProjectWorkItem, WorkItemStatus
from app.models.user import User
from app.models.submission import (
    Submission,
    SubmissionCreate,
    SubmissionResponse,
    SubmissionSummary,
    SubmissionStatus,
    SubmissionAdminReview,
    WorkEntry,
)

router = APIRouter(prefix="/submissions", tags=["Submissions"])
project_router = APIRouter(prefix="/projects", tags=["Submissions"])

MAX_SELECTABLE_SUBMISSION_WEEKS = 8


def parse_submission_week_id(week_id: str | None) -> str:
    """Normalize and validate an ISO week ID."""
    candidate = (week_id or get_week_id()).strip()

    try:
        get_week_boundaries(candidate)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid week ID. Use ISO format like 2026-W14.",
        ) from exc

    return candidate


def build_recent_week_ids(count: int, start_week_id: str | None = None) -> list[str]:
    """Build a descending list of recent ISO week IDs."""
    if count <= 0:
        return []

    week_ids: list[str] = []
    current = start_week_id or get_week_id()
    for _ in range(count):
        week_ids.append(current)
        current = get_previous_week_id(current)

    return week_ids


def is_future_week(target_week_id: str, current_week_id: str | None = None) -> bool:
    """Return True when the target week is after the current schedule week."""
    target_week_start, _ = get_week_boundaries(target_week_id)
    current_week_start, _ = get_week_boundaries(current_week_id or get_week_id())
    return target_week_start > current_week_start


def is_week_inside_backfill_window(target_week_id: str, current_week_id: str | None = None) -> bool:
    """Check whether a week is inside the allowed backfill window."""
    current = current_week_id or get_week_id()
    return target_week_id in build_recent_week_ids(MAX_SELECTABLE_SUBMISSION_WEEKS, current)


async def get_submission_for_user_week_project(user_id: str, week_id: str, project_id: str) -> Submission | None:
    """Fetch a submission by user, week, and project."""
    return await Submission.find_one(
        {
            "user_id": user_id,
            "week_id": week_id,
            "project_id": project_id,
        }
    )


async def _get_submission_project_or_403(project_id: str, current_user: User) -> Project:
    """Load a project and ensure the current user can submit updates to it."""
    try:
        project = await Project.get(ObjectId(project_id), fetch_links=True)
    except Exception:
        project = None

    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if not can_contribute_to_project(project, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Project contribution access required",
        )

    return project


async def _get_submission_project_for_view(project_id: str, current_user: User) -> Project:
    """Load a project and ensure the current user can view project submissions."""
    try:
        project = await Project.get(ObjectId(project_id), fetch_links=True)
    except Exception:
        project = None

    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if not can_view_project_submission(project, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Project submission access required",
        )

    return project


async def build_week_info(current_user: User, week_id: str, project_id: str | None = None) -> dict:
    """Build week metadata for the requested submission week."""
    week_start, week_end = get_week_boundaries(week_id)
    window_start, submission_deadline = get_submission_window_bounds(week_id)
    weekly_settings = get_weekly_update_settings()
    if project_id:
        await _get_submission_project_or_403(project_id, current_user)
        submission = await get_submission_for_user_week_project(str(current_user.id), week_id, project_id)
    else:
        submission = await Submission.find_one({"user_id": str(current_user.id), "week_id": week_id})

    return {
        "week_id": week_id,
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "submission_window_start": window_start.isoformat(),
        "submission_deadline": submission_deadline.isoformat(),
        "is_submission_window_open": is_submission_window_open(week_id),
        "allow_late_submissions": weekly_settings.allow_late_submissions,
        "has_submission": submission is not None,
        "submission_status": submission.status.value if submission else None,
        "submission_id": str(submission.id) if submission else None,
    }


async def refresh_user_submission_stats(current_user: User) -> None:
    """Recalculate denormalized submission totals and streaks from persisted data."""
    await sync_user_submission_stats(current_user)


async def apply_work_item_status_updates(entries: list[WorkEntry], current_user: "User") -> None:
    """For any work entry that carries a work_item_status_update, update the referenced work item.

    Only updates items the user is actually assigned to, to prevent accidental cross-project changes.
    Failures are logged but do not block the submission save.
    """
    seen: set[str] = set()
    for entry in entries:
        wid = entry.work_item_id
        new_status_raw = entry.work_item_status_update
        if not wid or not new_status_raw or wid in seen:
            continue
        seen.add(wid)
        try:
            new_status = WorkItemStatus(new_status_raw)
        except ValueError:
            logger.warning("Invalid work_item_status_update value %r – skipping", new_status_raw)
            continue
        try:
            from beanie import PydanticObjectId
            item = await ProjectWorkItem.get(PydanticObjectId(wid))
        except Exception:
            logger.warning("Work item %s not found – skipping status update", wid)
            continue
        if item is None:
            continue
        uid = str(current_user.id)
        is_assigned = (
            (item.assignee_id and str(item.assignee_id) == uid)
            or any(str(aid) == uid for aid in (item.assignee_ids or []))
        )
        if not is_assigned:
            logger.warning(
                "User %s is not assigned to work item %s – skipping status update",
                uid, wid,
            )
            continue
        item.status = new_status
        item.updated_by_id = current_user.id
        item.updated_by_name = current_user.name
        from app.core.time import utc_now as _utc_now
        item.updated_at = _utc_now()
        await item.save()
        logger.info("Work item %s status → %s (via submission by %s)", wid, new_status, current_user.email)


async def sync_submission_total_hours_if_needed(submission: Submission) -> bool:
    """Recalculate a submission's total hours and persist when a stale value is found."""
    previous_snapshot = (
        getattr(submission, "reported_hours", None),
        getattr(submission, "credited_hours", None),
        getattr(submission, "total_hours", None),
        tuple(getattr(submission, "hour_tracking_sections", []) or []),
    )
    sync_submission_total_hours(submission)
    next_snapshot = (
        getattr(submission, "reported_hours", None),
        getattr(submission, "credited_hours", None),
        getattr(submission, "total_hours", None),
        tuple(getattr(submission, "hour_tracking_sections", []) or []),
    )
    if next_snapshot == previous_snapshot:
        return False

    try:
        await submission.save()
    except Exception:
        logger.warning(
            "Failed to persist synced hours for submission %s",
            getattr(submission, "id", None),
            exc_info=True,
        )
    return True


async def sync_submission_totals_for_collection(submissions: list[Submission]) -> None:
    """Best-effort total-hours repair for a list of submissions."""
    tracked_sections = await get_current_hour_tracking_sections()
    for submission in submissions:
        try:
            previous_snapshot = (
                getattr(submission, "reported_hours", None),
                getattr(submission, "credited_hours", None),
                getattr(submission, "total_hours", None),
                tuple(getattr(submission, "hour_tracking_sections", []) or []),
            )
            sync_submission_total_hours(submission, tracked_sections)
            next_snapshot = (
                getattr(submission, "reported_hours", None),
                getattr(submission, "credited_hours", None),
                getattr(submission, "total_hours", None),
                tuple(getattr(submission, "hour_tracking_sections", []) or []),
            )
            if next_snapshot != previous_snapshot:
                await submission.save()
        except Exception:
            logger.warning(
                "Failed to recalculate hours for submission %s",
                getattr(submission, "id", None),
                exc_info=True,
            )


def submission_to_response(s: Submission) -> SubmissionResponse:
    """Convert a Submission document to a response model."""
    return SubmissionResponse(
        id=str(s.id),
        user_id=s.user_id,
        user_email=s.user_email,
        user_name=s.user_name,
        project_id=getattr(s, "project_id", ""),
        project_name=getattr(s, "project_name", None),
        visibility=getattr(s, "visibility", "project_members"),
        week_id=s.week_id,
        week_start=s.week_start,
        week_end=s.week_end,
        past_work=s.past_work,
        present_work=s.present_work,
        future_work=s.future_work,
        reported_hours=getattr(s, "reported_hours", getattr(s, "total_hours", 0.0)),
        credited_hours=getattr(s, "credited_hours", getattr(s, "reported_hours", getattr(s, "total_hours", 0.0))),
        total_hours=getattr(s, "total_hours", getattr(s, "reported_hours", 0.0)),
        blockers=s.blockers,
        notes=s.notes,
        mood_rating=s.mood_rating,
        custom_responses=s.custom_responses,
        is_late=s.is_late,
        status=s.status,
        reviewed_by=s.reviewed_by,
        reviewed_at=s.reviewed_at,
        admin_notes=s.admin_notes,
        created_at=s.created_at,
        updated_at=s.updated_at,
        submitted_at=s.submitted_at,
    )


def submission_to_summary(s: Submission) -> SubmissionSummary:
    """Convert a Submission document to a summary model."""
    return SubmissionSummary(
        id=str(s.id),
        user_id=s.user_id,
        user_name=s.user_name,
        project_id=getattr(s, "project_id", ""),
        project_name=getattr(s, "project_name", None),
        week_id=s.week_id,
        reported_hours=getattr(s, "reported_hours", getattr(s, "total_hours", 0.0)),
        credited_hours=getattr(s, "credited_hours", getattr(s, "reported_hours", getattr(s, "total_hours", 0.0))),
        total_hours=getattr(s, "total_hours", getattr(s, "reported_hours", 0.0)),
        status=s.status,
        submitted_at=s.submitted_at,
        has_blockers=bool(s.blockers and s.blockers.strip()),
        is_late=s.is_late,
    )


@router.get("/current-week")
async def get_current_week_info(
    week_id: Optional[str] = Query(None, description="Week ID to inspect (e.g. 2026-W14)"),
    project_id: Optional[str] = Query(None, description="Project ID to scope the submission lookup."),
    current_user: User = Depends(get_current_user),
):
    """Get information about a submission week and the user's status for that week."""
    target_week_id = parse_submission_week_id(week_id)
    return await build_week_info(current_user, target_week_id, project_id)


@router.get("/selectable-weeks")
async def get_selectable_submission_weeks(
    include_week_id: Optional[str] = Query(
        None,
        description="Include an existing week even if it falls outside the normal backfill window.",
    ),
    project_id: Optional[str] = Query(None, description="Project ID to scope the submission lookup."),
    current_user: User = Depends(get_current_user),
):
    """List weeks a volunteer can start or continue from the submission form."""
    current_week_id = get_week_id()
    candidate_week_ids = build_recent_week_ids(MAX_SELECTABLE_SUBMISSION_WEEKS, current_week_id)

    if include_week_id:
        included_week_id = parse_submission_week_id(include_week_id)
        if not is_future_week(included_week_id, current_week_id) and included_week_id not in candidate_week_ids:
            candidate_week_ids.append(included_week_id)

    if project_id:
        await _get_submission_project_or_403(project_id, current_user)
        submissions = await Submission.find(
            {
                "user_id": str(current_user.id),
                "project_id": project_id,
                "week_id": {"$in": candidate_week_ids},
            }
        ).to_list()
    else:
        submissions = await Submission.find(
            Submission.user_id == str(current_user.id),
            {"week_id": {"$in": candidate_week_ids}},
        ).to_list()
    submission_by_week = {submission.week_id: submission for submission in submissions}

    selectable_weeks: list[dict] = []
    seen_week_ids: set[str] = set()
    for candidate_week_id in candidate_week_ids:
        if candidate_week_id in seen_week_ids:
            continue
        seen_week_ids.add(candidate_week_id)

        submission = submission_by_week.get(candidate_week_id)
        if (
            candidate_week_id != current_week_id
            and submission is None
            and not can_submit_for_week(candidate_week_id)
        ):
            continue

        week_start, week_end = get_week_boundaries(candidate_week_id)
        selectable_weeks.append(
            {
                "week_id": candidate_week_id,
                "week_start": week_start.isoformat(),
                "week_end": week_end.isoformat(),
                "is_current": candidate_week_id == current_week_id,
                "has_submission": submission is not None,
                "submission_id": str(submission.id) if submission else None,
                "submission_status": submission.status.value if submission else None,
            }
        )

    selectable_weeks.sort(key=lambda entry: entry["week_start"], reverse=True)

    return {
        "current_week_id": current_week_id,
        "max_backfill_weeks": MAX_SELECTABLE_SUBMISSION_WEEKS,
        "weeks": selectable_weeks,
    }


@router.get("/categories")
async def get_work_categories():
    """Get available work categories/tags from shared config."""
    shared = load_shared_config()
    return {
        "categories": shared.get("work_categories", [
            "Outreach", "Admin", "Events", "Tech",
            "Fundraising", "Training", "Other"
        ])
    }


@router.get("/last-week-goals")
async def get_last_week_goals(
    week_id: Optional[str] = Query(None, description="Week ID to use as the submission target."),
    project_id: Optional[str] = Query(None, description="Project ID to scope the carry-forward lookup."),
    current_user: User = Depends(get_current_user),
):
    """
    Get last week's future_work entries to carry forward as this week's past_work.
    Returns empty list if no submission existed last week.
    """
    target_week_id = parse_submission_week_id(week_id)
    prev_week = get_previous_week_id(target_week_id)
    if not project_id:
        return {"goals": [], "from_week": prev_week}

    await _get_submission_project_or_403(project_id, current_user)
    prev_submission = await get_submission_for_user_week_project(str(current_user.id), prev_week, project_id)
    if not prev_submission or not prev_submission.future_work:
        return {"goals": [], "from_week": prev_week}
    return {
        "goals": [e.model_dump() for e in prev_submission.future_work],
        "from_week": prev_week,
    }


@router.get("/hours-trend")
async def get_hours_trend(
    weeks: int = Query(8, ge=1, le=52),
    current_user: User = Depends(get_current_user),
):
    """
    Get per-week total hours for the current user over the last N weeks.
    Returns a list ordered oldest → newest, suitable for a trend chart.
    """
    current_week = get_week_id()  # e.g. "2025-W05"
    week_ids = []
    wk = current_week
    for _ in range(weeks):
        week_ids.append(wk)
        wk = get_previous_week_id(wk)
    week_ids.reverse()  # oldest first

    submissions = await Submission.find(
        Submission.user_id == str(current_user.id),
        {"week_id": {"$in": week_ids}},
    ).to_list()
    await sync_submission_totals_for_collection(submissions)

    sub_map = {s.week_id: s for s in submissions}

    trend = []
    for wid in week_ids:
        s = sub_map.get(wid)
        trend.append({
            "week_id": wid,
            "total_hours": s.total_hours if s else 0,
            "submitted": s is not None and s.status != SubmissionStatus.DRAFT,
        })

    return {"trend": trend}


@router.get("/attendance")
async def get_attendance(
    weeks: int = Query(12, ge=4, le=52),
    current_user: User = Depends(get_current_user),
):
    """
    Get weekly attendance grid for the current user.
    Returns a list of week_ids with their submission status, ordered oldest → newest.
    """
    current_week = get_week_id()
    week_ids = []
    wk = current_week
    for _ in range(weeks):
        week_ids.append(wk)
        wk = get_previous_week_id(wk)
    week_ids.reverse()

    submissions = await Submission.find(
        Submission.user_id == str(current_user.id),
        {"week_id": {"$in": week_ids}},
    ).to_list()
    await sync_submission_totals_for_collection(submissions)

    sub_map = {s.week_id: s for s in submissions}

    grid = []
    for wid in week_ids:
        s = sub_map.get(wid)
        status = "none"
        hours = 0.0
        if s:
            hours = s.total_hours
            if s.status == SubmissionStatus.DRAFT:
                status = "draft"
            elif s.status == SubmissionStatus.SUBMITTED:
                status = "submitted"
            elif s.status == SubmissionStatus.REVIEWED:
                status = "reviewed"
        grid.append({
            "week_id": wid,
            "status": status,
            "total_hours": hours,
            "is_current": wid == current_week,
        })

    submitted_count = sum(1 for g in grid if g["status"] in ("submitted", "reviewed"))
    return {
        "grid": grid,
        "total_weeks": weeks,
        "submitted_weeks": submitted_count,
        "attendance_rate": round(submitted_count / max(weeks - 1, 1) * 100, 1),  # exclude current week
    }


@router.get("/my", response_model=List[SubmissionSummary])
async def get_my_submissions(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """Get all submissions for the current user."""
    submissions = await Submission.find(
        Submission.user_id == str(current_user.id)
    ).sort(-Submission.week_start).skip(skip).limit(limit).to_list()
    await sync_submission_totals_for_collection(submissions)
    
    return [submission_to_summary(s) for s in submissions]


@router.get("/stats/overview")
async def get_submissions_stats(
    week_id: Optional[str] = Query(None, description="Week ID to get stats for"),
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.REVIEW_SUBMISSIONS))
):
    """Get submission statistics for operations staff."""
    from beanie.operators import In
    
    target_week = week_id or get_week_id()
    
    # This week stats
    drafts = await Submission.find(
        Submission.week_id == target_week,
        Submission.status == SubmissionStatus.DRAFT
    ).count()
    
    submitted = await Submission.find(
        Submission.week_id == target_week,
        In(Submission.status, [SubmissionStatus.SUBMITTED, SubmissionStatus.REVIEWED])
    ).count()
    
    # Get total hours for the week
    week_submissions = await Submission.find(
        Submission.week_id == target_week,
        In(Submission.status, [SubmissionStatus.SUBMITTED, SubmissionStatus.REVIEWED])
    ).to_list()
    await sync_submission_totals_for_collection(week_submissions)
    total_hours = sum(s.total_hours for s in week_submissions)
    
    # Count submissions with blockers
    blockers_count = sum(1 for s in week_submissions if s.blockers and s.blockers.strip())
    
    # All time stats
    total_all_time = await Submission.find(
        In(Submission.status, [SubmissionStatus.SUBMITTED, SubmissionStatus.REVIEWED])
    ).count()
    
    return {
        "week_id": target_week,
        "this_week": {
            "total_drafts": drafts,
            "total_submitted": submitted,
            "total_hours": total_hours,
            "blockers_count": blockers_count,
        },
        "all_time": {
            "total_submissions": total_all_time,
        }
    }


@router.post(
    "",
    response_model=SubmissionResponse,
    dependencies=[Depends(rate_limit_by_user("submission_writes"))],
)
async def create_or_update_submission(
    data: SubmissionCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Create or update a submission for the selected week.
    If a draft exists for that week, it will be updated.
    """
    week_id = parse_submission_week_id(data.week_id)

    if is_future_week(week_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can only submit the current week or recent past weeks.",
        )

    week_start, week_end = get_week_boundaries(week_id)

    if not can_submit_for_week(week_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The submission window for the selected week is currently closed.",
        )

    tracked_sections = await get_current_hour_tracking_sections()
    totals = calculate_submission_hour_totals(data, tracked_sections)
    project = await _get_submission_project_or_403(data.project_id, current_user)
    
    # Check for existing submission
    existing = await get_submission_for_user_week_project(str(current_user.id), week_id, data.project_id)

    if existing is None and not is_week_inside_backfill_window(week_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You can only start submissions for the current week and the previous {MAX_SELECTABLE_SUBMISSION_WEEKS - 1} weeks.",
        )
    
    if existing:
        if existing.status == SubmissionStatus.REVIEWED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Reviewed submissions cannot be edited.",
            )

        # Allow updating - if already submitted, revert to draft
        reverted_from_submitted = existing.status != SubmissionStatus.DRAFT
        if existing.status != SubmissionStatus.DRAFT:
            logger.info("Reverting submitted entry to draft for %s", current_user.email)
            existing.status = SubmissionStatus.DRAFT
            existing.submitted_at = None
            existing.reviewed_by = None
            existing.reviewed_at = None
            existing.admin_notes = None
        
        # Update existing submission
        existing.past_work = data.past_work
        existing.present_work = data.present_work
        existing.future_work = data.future_work
        existing.blockers = data.blockers
        existing.notes = data.notes
        existing.mood_rating = data.mood_rating
        existing.custom_responses = data.custom_responses
        sync_submission_total_hours(existing, tracked_sections)
        existing.project_name = project.name
        existing.updated_at = utc_now()
        
        await existing.save()
        all_entries = list(data.past_work) + list(data.present_work) + list(data.future_work)
        await apply_work_item_status_updates(all_entries, current_user)
        if reverted_from_submitted:
            await refresh_user_submission_stats(current_user)
        return submission_to_response(existing)

    # Create new submission
    submission = Submission(
        user_id=str(current_user.id),
        user_email=current_user.email,
        user_name=current_user.name,
        project_id=str(project.id),
        project_name=project.name,
        week_id=week_id,
        week_start=week_start,
        week_end=week_end,
        past_work=data.past_work,
        present_work=data.present_work,
        future_work=data.future_work,
        blockers=data.blockers,
        notes=data.notes,
        mood_rating=data.mood_rating,
        custom_responses=data.custom_responses,
        hour_tracking_sections=sorted(tracked_sections),
        reported_hours=totals.reported_hours,
        credited_hours=totals.credited_hours,
        total_hours=totals.total_hours,
        status=SubmissionStatus.DRAFT,
        created_at=utc_now(),
        updated_at=utc_now(),
    )

    await submission.insert()
    all_entries = list(data.past_work) + list(data.present_work) + list(data.future_work)
    await apply_work_item_status_updates(all_entries, current_user)
    return submission_to_response(submission)


@router.get("", response_model=List[SubmissionSummary])
async def list_all_submissions(
    week_id: Optional[str] = Query(None, description="Filter by week"),
    status_filter: Optional[SubmissionStatus] = Query(None, alias="status", description="Filter by status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.REVIEW_SUBMISSIONS))
):
    """List all submissions for operational review."""
    query = {}
    if week_id:
        query["week_id"] = week_id
    if status_filter:
        query["status"] = status_filter
    
    submissions = await Submission.find(query).sort(-Submission.created_at).skip(skip).limit(limit).to_list()
    await sync_submission_totals_for_collection(submissions)
    
    return [submission_to_summary(s) for s in submissions]


@router.get("/{submission_id}", response_model=SubmissionResponse)
async def get_submission(
    submission_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific submission by ID."""
    try:
        submission = await Submission.get(ObjectId(submission_id))
    except Exception:
        submission = None
    
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found"
        )
    await sync_submission_total_hours_if_needed(submission)
    
    # Users can only view their own submissions unless they have operations access
    access = await get_admin_access_context(current_user)
    if str(current_user.id) != submission.user_id and not access.has_any_scope(AdminAccessScope.REVIEW_SUBMISSIONS):
        project_id = getattr(submission, "project_id", None)
        if not project_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this submission"
            )

        project = await _get_submission_project_for_view(project_id, current_user)
        if not can_view_project_submission(project, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this submission"
            )
    
    return submission_to_response(submission)


@router.post(
    "/{submission_id}/submit",
    response_model=SubmissionResponse,
    dependencies=[Depends(rate_limit_by_user("submission_writes"))],
)
async def submit_submission(
    submission_id: str,
    current_user: User = Depends(get_current_user)
):
    """Submit a draft submission for review."""
    try:
        submission = await Submission.get(ObjectId(submission_id))
    except Exception:
        submission = None
    
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found"
        )
    
    # Only owner can submit
    if str(current_user.id) != submission.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to submit this draft"
        )
    
    if submission.status != SubmissionStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission is not a draft"
        )

    if not can_submit_for_week(submission.week_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The submission window for the selected week is currently closed.",
        )

    sync_submission_total_hours(submission)

    all_entries = list(submission.past_work) + list(submission.present_work) + list(submission.future_work)
    await apply_work_item_status_updates(all_entries, current_user)

    submission.status = SubmissionStatus.SUBMITTED
    submission.submitted_at = utc_now()
    submission.updated_at = utc_now()
    
    # Check if submission is late (after week end)
    submission.is_late = get_schedule_now() > get_submission_deadline(submission.week_id)
    
    await submission.save()
    
    await refresh_user_submission_stats(current_user)
    
    return submission_to_response(submission)


@router.post(
    "/{submission_id}/review",
    response_model=SubmissionResponse,
    dependencies=[Depends(rate_limit_by_user("submission_writes"))],
)
async def review_submission(
    submission_id: str,
    review: SubmissionAdminReview,
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.REVIEW_SUBMISSIONS))
):
    """Mark a submission as reviewed (operations or admin)."""
    try:
        submission = await Submission.get(ObjectId(submission_id))
    except Exception:
        submission = None
    
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found"
        )
    
    if submission.status == SubmissionStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot review a draft submission"
        )
    sync_submission_total_hours(submission)
    submission.status = SubmissionStatus.REVIEWED
    submission.reviewed_by = str(current_user.id)
    submission.reviewed_at = utc_now()
    submission.admin_notes = review.admin_notes
    submission.updated_at = utc_now()
    
    await submission.save()
    
    return submission_to_response(submission)


_DELETE_WINDOW_DAYS = 7


@router.delete(
    "/{submission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit_by_user("submission_writes"))],
)
async def delete_submission(
    submission_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a submission.

    Owners may delete their own draft or submitted submissions within 7 days of
    submission (or creation for drafts). Reviewed submissions and anything older
    than 7 days require admin access.
    """
    try:
        submission = await Submission.get(ObjectId(submission_id))
    except Exception:
        submission = None

    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    access = await get_admin_access_context(current_user)
    is_admin = access.has_any_scope(AdminAccessScope.REVIEW_SUBMISSIONS)
    is_owner = str(submission.user_id) == str(current_user.id)

    if not is_owner and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised to delete this submission")

    if not is_admin:
        if submission.status == SubmissionStatus.REVIEWED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Reviewed submissions cannot be deleted",
            )
        reference_time = submission.submitted_at or submission.created_at
        if utc_now() - reference_time > timedelta(days=_DELETE_WINDOW_DAYS):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Submissions can only be deleted within {_DELETE_WINDOW_DAYS} days of submission",
            )

    deleted_submission_owner_id = submission.user_id
    await submission.delete()
    await sync_user_submission_stats_by_user_id(deleted_submission_owner_id)
    return None


@project_router.get("/{project_id}/submissions", response_model=List[SubmissionSummary])
async def get_project_submissions(
    project_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    """List all submissions visible within a project."""
    await _get_submission_project_for_view(project_id, current_user)
    submissions = await Submission.find({"project_id": project_id}).sort(-Submission.week_start).skip(skip).limit(limit).to_list()
    await sync_submission_totals_for_collection(submissions)
    return [submission_to_summary(submission) for submission in submissions]


@project_router.get("/{project_id}/submissions/{submission_id}", response_model=SubmissionResponse)
async def get_project_submission(
    project_id: str,
    submission_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get a single project-scoped submission."""
    await _get_submission_project_for_view(project_id, current_user)
    try:
        submission = await Submission.get(ObjectId(submission_id))
    except Exception:
        submission = None

    if submission is None or submission.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )

    await sync_submission_total_hours_if_needed(submission)
    return submission_to_response(submission)
