"""
Comments API endpoints.
Handles comments on submissions.
"""

from datetime import datetime
from typing import List

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import get_current_user
from app.models.user import User, UserRole
from app.models.submission import Submission
from app.models.comment import (
    Comment,
    CommentCreate,
    CommentUpdate,
    CommentResponse,
)

router = APIRouter(prefix="/comments", tags=["Comments"])


def comment_to_response(c: Comment, replies: List[CommentResponse] = None) -> CommentResponse:
    """Convert a Comment document to a response model."""
    return CommentResponse(
        id=str(c.id),
        submission_id=c.submission_id,
        user_id=c.user_id,
        user_name=c.user_name,
        is_admin=c.is_admin,
        content=c.content if not c.is_deleted else "[deleted]",
        parent_id=c.parent_id,
        is_edited=c.is_edited,
        created_at=c.created_at,
        updated_at=c.updated_at,
        replies=replies or [],
    )


async def build_comment_tree(comments: List[Comment]) -> List[CommentResponse]:
    """Build a nested tree of comments and replies."""
    # Separate root comments and replies
    root_comments = [c for c in comments if c.parent_id is None and not c.is_deleted]
    replies_map = {}
    
    for c in comments:
        if c.parent_id and not c.is_deleted:
            if c.parent_id not in replies_map:
                replies_map[c.parent_id] = []
            replies_map[c.parent_id].append(c)
    
    # Build response with nested replies
    result = []
    for root in root_comments:
        root_id = str(root.id)
        nested_replies = [
            comment_to_response(r) 
            for r in replies_map.get(root_id, [])
        ]
        result.append(comment_to_response(root, nested_replies))
    
    return result


@router.get("/submission/{submission_id}", response_model=List[CommentResponse])
async def get_comments_for_submission(
    submission_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all comments for a submission."""
    # Verify submission exists and user has access
    try:
        submission = await Submission.get(ObjectId(submission_id))
    except Exception:
        submission = None
    
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found"
        )
    
    # Only submission owner or admin can view comments
    if str(current_user.id) != submission.user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view these comments"
        )
    
    comments = await Comment.find(
        Comment.submission_id == submission_id
    ).sort(Comment.created_at).to_list()
    
    return await build_comment_tree(comments)


@router.post("/submission/{submission_id}", response_model=CommentResponse)
async def create_comment(
    submission_id: str,
    data: CommentCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new comment on a submission."""
    # Verify submission exists
    try:
        submission = await Submission.get(ObjectId(submission_id))
    except Exception:
        submission = None
    
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found"
        )
    
    # Only submission owner or admin can comment
    if str(current_user.id) != submission.user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to comment on this submission"
        )
    
    # If replying, verify parent comment exists
    if data.parent_id:
        try:
            parent = await Comment.get(ObjectId(data.parent_id))
        except Exception:
            parent = None
        
        if parent is None or parent.submission_id != submission_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent comment not found"
            )
    
    comment = Comment(
        submission_id=submission_id,
        user_id=str(current_user.id),
        user_name=current_user.name,
        user_email=current_user.email,
        is_admin=current_user.role == UserRole.ADMIN,
        content=data.content,
        parent_id=data.parent_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    
    await comment.insert()
    
    return comment_to_response(comment)


@router.patch("/{comment_id}", response_model=CommentResponse)
async def update_comment(
    comment_id: str,
    data: CommentUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a comment (only by the author)."""
    try:
        comment = await Comment.get(ObjectId(comment_id))
    except Exception:
        comment = None
    
    if comment is None or comment.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )
    
    # Only author can edit
    if comment.user_id != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to edit this comment"
        )
    
    comment.content = data.content
    comment.is_edited = True
    comment.updated_at = datetime.utcnow()
    
    await comment.save()
    
    return comment_to_response(comment)


@router.delete("/{comment_id}")
async def delete_comment(
    comment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Soft delete a comment (by author or admin)."""
    try:
        comment = await Comment.get(ObjectId(comment_id))
    except Exception:
        comment = None
    
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found"
        )
    
    # Author or admin can delete
    if comment.user_id != str(current_user.id) and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this comment"
        )
    
    comment.is_deleted = True
    comment.updated_at = datetime.utcnow()
    
    await comment.save()
    
    return {"message": "Comment deleted"}
