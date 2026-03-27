"""
Authentication API endpoints.
Handles Google OAuth login and token management.
"""

import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from app.core.admin_access import build_user_response
from app.core.audit import write_audit_log
from app.core.config import get_settings
from app.core.rate_limit import rate_limit_by_ip
from app.core.security import create_access_token, verify_google_token, get_current_user
from app.core.time import utc_now
from app.models.audit_log import AuditLogEventType
from app.models.user import User, UserRole, UserResponse
from app.models.allowed_email import AllowedEmail

router = APIRouter(prefix="/auth", tags=["Authentication"])


class GoogleLoginRequest(BaseModel):
    """Request body for Google OAuth login."""
    access_token: str


class AuthResponse(BaseModel):
    """Response after successful authentication."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


@router.post(
    "/google",
    response_model=AuthResponse,
    dependencies=[Depends(rate_limit_by_ip("auth_google"))],
)
async def login_with_google(request: GoogleLoginRequest, http_request: Request):
    """
    Authenticate a user with a Google OAuth2 access token.
    
    - Validates the token with Google
    - Creates a new user if first login
    - Updates existing user's last_login
    - Returns a JWT token for API access
    """
    try:
        # Verify the Google token and get user info
        google_user = await verify_google_token(request.access_token)
        logger.info("Google user info retrieved: %s", google_user.get('email', 'unknown'))
        
        email = google_user.get("email")
        google_id = google_user.get("sub")
        name = google_user.get("name", email.split("@")[0] if email else "User")
        picture = google_user.get("picture")
        
        if not email or not google_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not retrieve user info from Google"
            )
        
        # Check if user exists
        user = await User.find_one(User.email == email)
        settings = get_settings()
        
        if user is None:
            # Check if this email is allowed (invited)
            # EXCEPTION: If is_admin(email) is true, allow it (bootstrap admin)
            is_bootstrap_admin = settings.is_admin(email)
            allowed_email_entry = await AllowedEmail.find_one(AllowedEmail.email == email)
            
            if not is_bootstrap_admin and not allowed_email_entry:
                logger.warning("Unauthorized login attempt: %s", email)
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied. You must be invited to join this portal."
                )
            
            # Create new user
            # Determine role: Admin if bootstrap, else check invite, else Volunteer
            if is_bootstrap_admin:
                role = UserRole.ADMIN
            elif allowed_email_entry:
                role = allowed_email_entry.role
            else:
                role = UserRole.VOLUNTEER # Should not happen due to check above
            
            # Operations staff have no file access expiry; volunteers get 7 days
            file_access_expires = None if role in (UserRole.ADMIN, UserRole.TEAM_LEAD) else (utc_now() + timedelta(days=7))
            
            user = User(
                email=email,
                google_id=google_id,
                name=name,
                picture=picture,
                role=role,
                is_active=True,
                profile_complete=False,  # Must set full name first
                file_access_expires=file_access_expires,
                created_at=utc_now(),
                updated_at=utc_now(),
                last_login=utc_now(),
                google_access_token=request.access_token,
            )
            await user.insert()
            logger.info("New user created: %s (role: %s)", email, role)
        else:
            # Update existing user
            user.last_login = utc_now()
            user.picture = picture  # Update profile picture in case it changed
            user.google_id = google_id  # Ensure google_id is set
            user.google_access_token = request.access_token  # Refresh token for Drive
            
            # Check if this user should be promoted to admin
            if settings.is_admin(email) and user.role != UserRole.ADMIN:
                user.role = UserRole.ADMIN
                logger.info("User promoted to admin: %s", email)
            
            await user.save()
            logger.info("Existing user logged in: %s", email)
        
        # Create JWT token
        token_data = {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
        }
        access_token = create_access_token(token_data)
        
        user_response = await build_user_response(user)

        await write_audit_log(
            request=http_request,
            actor=user,
            event_type=AuditLogEventType.SECURITY,
            action="auth.google_login",
            resource_type="user_session",
            resource_id=str(user.id),
            summary=f"{user.email} logged in with Google OAuth",
            status_code=status.HTTP_200_OK,
            metadata={"is_new_user": user.created_at == user.last_login},
        )
        
        return AuthResponse(
            access_token=access_token,
            user=user_response,
        )
    
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Log unexpected errors but do not expose internals to the client
        logger.error("Unexpected error during login: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed. Please try again."
        )


@router.get("/verify")
async def verify_token(current_user: User = Depends(get_current_user)):
    """
    Verify the current token is valid.
    Returns basic status - use /users/me for full user data.
    """
    return {"valid": True, "user_id": str(current_user.id)}
