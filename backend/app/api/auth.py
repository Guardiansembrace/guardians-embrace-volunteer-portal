"""
Authentication API endpoints.
Handles Google OAuth login and token management.
"""

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from app.core.config import get_settings
from app.core.security import create_access_token, verify_google_token
from app.models.user import User, UserRole, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])


class GoogleLoginRequest(BaseModel):
    """Request body for Google OAuth login."""
    access_token: str


class AuthResponse(BaseModel):
    """Response after successful authentication."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


@router.post("/google", response_model=AuthResponse)
async def login_with_google(request: GoogleLoginRequest):
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
            # Create new user
            # Check if this email should be an admin
            role = UserRole.ADMIN if settings.is_admin(email) else UserRole.VOLUNTEER
            
            # Admins have no file access expiry; volunteers get 7 days
            file_access_expires = None if role == UserRole.ADMIN else (datetime.utcnow() + timedelta(days=7))
            
            user = User(
                email=email,
                google_id=google_id,
                name=name,
                picture=picture,
                role=role,
                is_active=True,
                profile_complete=False,  # Must set full name first
                file_access_expires=file_access_expires,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                last_login=datetime.utcnow(),
                google_access_token=request.access_token,
            )
            await user.insert()
            logger.info("New user created: %s (role: %s)", email, role)
        else:
            # Update existing user
            user.last_login = datetime.utcnow()
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
        
        # Build user response
        user_response = UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            picture=user.picture,
            role=user.role,
            team=user.team,
            is_active=user.is_active,
            total_hours=user.total_hours,
            total_submissions=user.total_submissions,
            submission_streak=user.submission_streak,
            profile_complete=user.profile_complete,
            file_access_expires=user.file_access_expires,
            created_at=user.created_at,
            last_login=user.last_login,
        )
        
        return AuthResponse(
            access_token=access_token,
            user=user_response,
        )
    
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Log unexpected errors
        logger.error("Unexpected error during login: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Authentication error: {str(e)}"
        )


@router.get("/verify")
async def verify_token():
    """
    Verify the current token is valid.
    Returns basic status - use /users/me for full user data.
    """
    return {"valid": True}
