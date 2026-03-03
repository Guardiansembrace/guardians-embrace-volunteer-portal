"""
Submissions API endpoints.
Handles weekly volunteer submissions - create, update, submit, and review.
"""

import logging
from datetime import datetime
from typing import List, Optional

logger = logging.getLogger(__name__)

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import load_shared_config
from app.core.security import get_current_user, get_current_admin_user
from app.core.utils import get_week_id, get_week_boundaries, get_previous_week_id, is_submission_window_open, get_submission_deadline
from app.models.user import User, UserRole
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


def calculate_total_hours(submission_data: SubmissionCreate) -> float:
    """Calculate total hours from all work entries."""
    total = 0.0
    for entry in submission_data.past_work:
        total += entry.hours
    for entry in submission_data.present_work:
        total += entry.hours
    return total


def submission_to_response(s: Submission) -> SubmissionResponse:
    """Convert a Submission document to a response model."""
    return SubmissionResponse(
        id=str(s.id),
        user_id=s.user_id,
        user_email=s.user_email,
        user_name=s.user_name,
        week_id=s.week_id,
        week_start=s.week_start,
        week_end=s.week_end,
        past_work=s.past_work,
        present_work=s.present_work,
        future_work=s.future_work,
        total_hours=s.total_hours,
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
        week_id=s.week_id,
        total_hours=s.total_hours,
        status=s.status,
        submitted_at=s.submitted_at,
        has_blockers=bool(s.blockers and s.blockers.strip()),
        is_late=s.is_late,
    )


@router.get("/current-week")
async def get_current_week_info(current_user: User = Depends(get_current_user)):
    """Get information about the current week and user's submission status."""
    week_id = get_week_id()
    week_start, week_end = get_week_boundaries(week_id)
    
    # Check if user has a submission for this week
    submission = await Submission.find_one(
        Submission.user_id == str(current_user.id),
        Submission.week_id == week_id
    )
    
    return {
        "week_id": week_id,
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "submission_deadline": get_submission_deadline().isoformat(),
        "is_submission_window_open": is_submission_window_open(),
        "has_submission": submission is not None,
        "submission_status": submission.status.value if submission else None,
        "submission_id": str(submission.id) if submission else None,
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
async def get_last_week_goals(current_user: User = Depends(get_current_user)):
    """
    Get last week's future_work entries to carry forward as this week's past_work.
    Returns empty list if no submission existed last week.
    """
    prev_week = get_previous_week_id()
    prev_submission = await Submission.find_one(
        Submission.user_id == str(current_user.id),
        Submission.week_id == prev_week
    )
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
    ).sort(-Submission.created_at).skip(skip).limit(limit).to_list()
    
    return [submission_to_summary(s) for s in submissions]


@router.get("/stats/overview")
async def get_submissions_stats(
    week_id: Optional[str] = Query(None, description="Week ID to get stats for"),
    current_user: User = Depends(get_current_admin_user)
):
    """Get submission statistics (admin only)."""
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


@router.post("", response_model=SubmissionResponse)
async def create_or_update_submission(
    data: SubmissionCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Create or update a submission for the current week.
    If a draft exists for this week, it will be updated.
    """
    week_id = get_week_id()
    week_start, week_end = get_week_boundaries(week_id)
    
    # Check for existing submission
    existing = await Submission.find_one(
        Submission.user_id == str(current_user.id),
        Submission.week_id == week_id
    )
    
    if existing:
        # Allow updating - if already submitted, revert to draft
        if existing.status != SubmissionStatus.DRAFT:
            logger.info("Reverting submitted entry to draft for %s", current_user.email)
            existing.status = SubmissionStatus.DRAFT
            existing.submitted_at = None
        
        # Update existing submission
        existing.past_work = data.past_work
        existing.present_work = data.present_work
        existing.future_work = data.future_work
        existing.blockers = data.blockers
        existing.notes = data.notes
        existing.mood_rating = data.mood_rating
        existing.custom_responses = data.custom_responses
        existing.total_hours = calculate_total_hours(data)
        existing.updated_at = datetime.utcnow()
        
        await existing.save()
        return submission_to_response(existing)
    
    # Create new submission
    submission = Submission(
        user_id=str(current_user.id),
        user_email=current_user.email,
        user_name=current_user.name,
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
        total_hours=calculate_total_hours(data),
        status=SubmissionStatus.DRAFT,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    
    await submission.insert()
    return submission_to_response(submission)


@router.get("", response_model=List[SubmissionSummary])
async def list_all_submissions(
    week_id: Optional[str] = Query(None, description="Filter by week"),
    status_filter: Optional[SubmissionStatus] = Query(None, alias="status", description="Filter by status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_admin_user)
):
    """List all submissions (admin only)."""
    query = {}
    if week_id:
        query["week_id"] = week_id
    if status_filter:
        query["status"] = status_filter
    
    submissions = await Submission.find(query).sort(-Submission.created_at).skip(skip).limit(limit).to_list()
    
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
    
    # Users can only view their own submissions unless admin
    if str(current_user.id) != submission.user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this submission"
        )
    
    return submission_to_response(submission)


@router.post("/{submission_id}/submit", response_model=SubmissionResponse)
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
    
    submission.status = SubmissionStatus.SUBMITTED
    submission.submitted_at = datetime.utcnow()
    submission.updated_at = datetime.utcnow()
    
    # Check if submission is late (after week end)
    submission.is_late = datetime.utcnow() > submission.week_end
    
    await submission.save()
    
    # Update user stats
    current_user.total_submissions += 1
    current_user.total_hours += submission.total_hours
    
    # Calculate streak — check if previous week had a submission
    prev_week = get_previous_week_id(submission.week_id)
    prev_sub = await Submission.find_one(
        Submission.user_id == str(current_user.id),
        Submission.week_id == prev_week,
        Submission.status != SubmissionStatus.DRAFT
    )
    if prev_sub:
        current_user.submission_streak = (current_user.submission_streak or 0) + 1
    else:
        current_user.submission_streak = 1
    
    await current_user.save()
    
    return submission_to_response(submission)


@router.post("/{submission_id}/review", response_model=SubmissionResponse)
async def review_submission(
    submission_id: str,
    review: SubmissionAdminReview,
    current_user: User = Depends(get_current_admin_user)
):
    """Mark a submission as reviewed (admin only)."""
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
    
    submission.status = SubmissionStatus.REVIEWED
    submission.reviewed_by = str(current_user.id)
    submission.reviewed_at = datetime.utcnow()
    submission.admin_notes = review.admin_notes
    submission.updated_at = datetime.utcnow()
    
    await submission.save()
    
    return submission_to_response(submission)
