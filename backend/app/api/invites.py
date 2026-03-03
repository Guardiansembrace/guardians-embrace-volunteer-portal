from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from beanie import PydanticObjectId

from app.core.security import get_current_admin_user
from app.core.email import send_email, build_invitation_html, is_email_configured
from app.models.user import User, UserRole
from app.models.allowed_email import AllowedEmail, AllowedEmailCreate

router = APIRouter(prefix="/invites", tags=["invites"])


@router.get("", response_model=List[AllowedEmail])
async def list_invites(
    current_admin: User = Depends(get_current_admin_user)
):
    """
    List all pending invitations (allowed emails).
    """
    invites = await AllowedEmail.find_all().to_list()
    return invites


@router.post("", response_model=AllowedEmail, status_code=status.HTTP_201_CREATED)
async def invite_user(
    invite_in: AllowedEmailCreate,
    background_tasks: BackgroundTasks,
    current_admin: User = Depends(get_current_admin_user)
):
    """
    Invite a user by email (add to allowed list) and send an email notification.
    """
    # Check if email is already allowed
    existing_invite = await AllowedEmail.find_one(AllowedEmail.email == invite_in.email)
    if existing_invite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already invited"
        )
        
    # Check if user already registered
    existing_user = await User.find_one(User.email == invite_in.email)
    
    invite = AllowedEmail(
        email=invite_in.email,
        role=invite_in.role,
        invited_by=current_admin.email
    )
    await invite.insert()

    # Send Invitation Email
    if is_email_configured():
        html_body = build_invitation_html(
            email=invite.email,
            role=invite.role,
            invited_by=current_admin.email or "Admin"
        )
        background_tasks.add_task(
            send_email,
            to_emails=[invite.email],
            subject="You're invited to Guardian's Embrace Volunteer Portal",
            html_body=html_body,
            text_body=f"You have been invited to Guardian's Embrace Volunteer Portal as a {invite.role}. Login at http://localhost:5173/login"
        )
    
    return invite


@router.delete("/{email}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(
    email: str,
    current_admin: User = Depends(get_current_admin_user)
):
    """
    Revoke an invitation.
    """
    invite = await AllowedEmail.find_one(AllowedEmail.email == email)
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )
        

@router.post("/{email}/resend", status_code=status.HTTP_200_OK)
async def resend_invite(
    email: str,
    background_tasks: BackgroundTasks,
    current_admin: User = Depends(get_current_admin_user)
):
    """
    Resend an invitation email.
    """
    invite = await AllowedEmail.find_one(AllowedEmail.email == email)
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )

    # Send Invitation Email
    if is_email_configured():
        html_body = build_invitation_html(
            email=invite.email,
            role=invite.role,
            invited_by=invite.invited_by or current_admin.email or "Admin"
        )
        background_tasks.add_task(
            send_email,
            to_emails=[invite.email],
            subject="reminder: You're invited to Guardian's Embrace Volunteer Portal",
            html_body=html_body,
            text_body=f"You have been invited to Guardian's Embrace Volunteer Portal as a {invite.role}. Login at http://localhost:5173/login"
        )
    
    return {"message": "Invitation resent"}

