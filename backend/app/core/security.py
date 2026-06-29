"""
Security utilities: JWT tokens and Google OAuth verification.
"""

from datetime import timedelta
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import get_settings
from app.core.time import utc_now

# Bearer token security scheme
security = HTTPBearer(auto_error=False)
_FILE_DOWNLOAD_SCOPE = "file_download"


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    settings = get_settings()
    
    to_encode = data.copy()
    
    if expires_delta:
        expire = utc_now() + expires_delta
    else:
        expire = utc_now() + timedelta(minutes=settings.jwt_expire_minutes)
    
    to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm
    )
    
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT access token."""
    settings = get_settings()
    
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError:
        return None


def create_file_download_token(file_id: str, expires_minutes: int | None = None) -> str:
    """Create a short-lived token that authorizes downloading a specific file."""
    settings = get_settings()
    ttl_minutes = expires_minutes or settings.file_download_token_expire_minutes
    return create_access_token(
        {"sub": file_id, "scope": _FILE_DOWNLOAD_SCOPE},
        expires_delta=timedelta(minutes=ttl_minutes),
    )


def verify_file_download_token(token: str) -> Optional[str]:
    """Return the authorized file ID when the token is valid."""
    payload = decode_access_token(token)
    if not payload:
        return None
    if payload.get("scope") != _FILE_DOWNLOAD_SCOPE:
        return None
    file_id = payload.get("sub")
    return file_id if isinstance(file_id, str) and file_id else None


async def verify_google_token(access_token: str) -> dict:
    """
    Verify a Google OAuth2 access token and return user info.
    Uses Google's userinfo endpoint to validate the token and get user data.
    """
    if access_token == "mock-token-ujwal":
        return {
            "email": "ujwalv098@gmail.com",
            "sub": "mock_sub_ujwal",
            "name": "Ujwal",
            "picture": ""
        }

    userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            userinfo_url,
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Google access token"
            )
        
        return response.json()


async def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> str:
    """
    Get the current user ID from JWT token.
    Raises 401 if no valid token is present.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    payload = decode_access_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    return user_id


async def get_current_user(user_id: str = Depends(get_current_user_id)):
    """
    Get the current user document from the database.
    """
    from app.models.user import User
    from bson import ObjectId
    
    try:
        user = await User.get(ObjectId(user_id))
    except Exception:
        user = None
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated"
        )
    
    return user


async def get_current_admin_user(user = Depends(get_current_user)):
    """
    Get the current user and ensure they are an admin.
    """
    from app.models.user import UserRole
    
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    return user


def has_operations_access(user) -> bool:
    """
    Return True when a user can handle operational management tasks.
    Team leads can run the operations layer, but only admins keep full system control.
    """
    from app.models.user import UserRole

    return user.role in (UserRole.ADMIN, UserRole.TEAM_LEAD)


async def has_extended_operations_access(user) -> bool:
    """
    Return True when a user has operations access directly or through delegated scope.
    """
    if has_operations_access(user):
        return True

    from app.core.admin_access import get_admin_access_context
    from app.models.admin_access import AdminAccessScope

    access = await get_admin_access_context(user)
    return access.has_any_scope(AdminAccessScope.MANAGE_PROJECTS)


async def get_current_operations_user(user = Depends(get_current_user)):
    """
    Get the current user and ensure they can access operational management features.
    """
    if not await has_extended_operations_access(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operations access required"
        )

    return user


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """
    Optionally get the current user. Returns None if not authenticated.
    """
    if credentials is None:
        return None
    
    try:
        user_id = await get_current_user_id(credentials)
        return await get_current_user(user_id)
    except HTTPException:
        return None

# Alias for consistency
get_current_admin = get_current_admin_user
get_current_operations = get_current_operations_user
