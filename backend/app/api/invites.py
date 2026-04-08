import asyncio
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks

from app.core.admin_access import AdminAccessScope, require_admin_scopes
from app.core.rate_limit import rate_limit_by_user
from app.core.config import get_settings
from app.core.email import send_email, build_invitation_html, is_email_configured
from app.models.user import User, UserRole
from app.models.allowed_email import AllowedEmail, AllowedEmailCreate, AllowedEmailRecord, InvitePortalStatus

router = APIRouter(prefix="/invites", tags=["invites"])


def _build_invited_user_name(email: str) -> str:
    local_part = email.split("@", 1)[0]
    normalized = local_part.replace(".", " ").replace("_", " ").replace("-", " ").strip()
    if not normalized:
        return email
    return " ".join(part.capitalize() for part in normalized.split())


async def _sync_pending_user(email: str, role: UserRole) -> None:
    existing_user = await User.find_one(User.email == email)
    if existing_user:
        if existing_user.invited_only:
            existing_user.name = _build_invited_user_name(email)
            existing_user.role = role
            existing_user.is_active = True
            existing_user.profile_complete = False
            existing_user.last_login = None
        await existing_user.save()
        return

    placeholder_user = User(
        email=email,
        name=_build_invited_user_name(email),
        role=role,
        is_active=True,
        profile_complete=False,
        invited_only=True,
        last_login=None,
    )
    await placeholder_user.insert()


async def _build_invite_record(invite: AllowedEmail) -> AllowedEmailRecord:
    linked_user = await User.find_one(User.email == invite.email)
    is_pending_login = linked_user is None or linked_user.invited_only

    return AllowedEmailRecord(
        id=str(getattr(invite, "id", "")) or None,
        email=invite.email,
        role=invite.role,
        invited_by=invite.invited_by,
        created_at=invite.created_at,
        portal_status=InvitePortalStatus.PENDING_LOGIN if is_pending_login else InvitePortalStatus.ACCESS_RECORD,
        has_logged_in=bool(linked_user and linked_user.last_login and not linked_user.invited_only),
        user_name=getattr(linked_user, "name", None),
        user_last_login=getattr(linked_user, "last_login", None),
    )


@router.get("", response_model=List[AllowedEmailRecord])
async def list_invites(
    current_admin: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_INVITES))
):
    """
    List invite records along with each email's current portal login state.
    """
    invites = await AllowedEmail.find_all().to_list()
    if not invites:
        return []
    return list(await asyncio.gather(*(_build_invite_record(invite) for invite in invites)))


@router.post(
    "",
    response_model=AllowedEmail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_by_user("invite_writes"))],
)
async def invite_user(
    invite_in: AllowedEmailCreate,
    background_tasks: BackgroundTasks,
    current_admin: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_INVITES))
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
        
    invite = AllowedEmail(
        email=invite_in.email,
        role=invite_in.role,
        invited_by=current_admin.email
    )
    await invite.insert()
    await _sync_pending_user(invite.email, invite.role)

    # Send Invitation Email
    if is_email_configured():
        settings = get_settings()
        login_url = f"{settings.frontend_url}/login"
        html_body = build_invitation_html(
            email=invite.email,
            role=invite.role,
            invited_by=current_admin.email or "Admin",
            portal_url=settings.frontend_url,
        )
        background_tasks.add_task(
            send_email,
            to_emails=[invite.email],
            subject="You're invited to Guardian's Embrace Volunteer Portal",
            html_body=html_body,
            text_body=f"You have been invited to Guardian's Embrace Volunteer Portal as a {invite.role}. Login at {login_url}"
        )

    return invite


@router.delete(
    "/{email}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit_by_user("invite_writes"))],
)
async def revoke_invite(
    email: str,
    current_admin: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_INVITES))
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

    pending_user = await User.find_one(User.email == email)
    if pending_user and pending_user.invited_only:
        pending_user.is_active = False
        await pending_user.save()
    
    await invite.delete()

@router.post(
    "/{email}/resend",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit_by_user("invite_writes"))],
)
async def resend_invite(
    email: str,
    background_tasks: BackgroundTasks,
    current_admin: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_INVITES))
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
        settings = get_settings()
        login_url = f"{settings.frontend_url}/login"
        html_body = build_invitation_html(
            email=invite.email,
            role=invite.role,
            invited_by=invite.invited_by or current_admin.email or "Admin",
            portal_url=settings.frontend_url,
        )
        background_tasks.add_task(
            send_email,
            to_emails=[invite.email],
            subject="Reminder: You're invited to Guardian's Embrace Volunteer Portal",
            html_body=html_body,
            text_body=f"You have been invited to Guardian's Embrace Volunteer Portal as a {invite.role}. Login at {login_url}"
        )

    return {"message": "Invitation resent"}

