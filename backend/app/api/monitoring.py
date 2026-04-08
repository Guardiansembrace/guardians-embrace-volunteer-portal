"""
Monitoring API endpoints.
Receives frontend runtime error reports and writes them to backend logs.
"""

import json
import logging
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.rate_limit import rate_limit_by_ip
from app.core.security import get_optional_current_user
from app.core.time import utc_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/monitoring", tags=["Monitoring"])


class FrontendErrorReport(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    severity: Literal["error", "warning"] = "error"
    stack: Optional[str] = Field(default=None, max_length=10000)
    component_stack: Optional[str] = Field(default=None, max_length=10000)
    url: Optional[str] = Field(default=None, max_length=2000)
    route: Optional[str] = Field(default=None, max_length=500)
    user_agent: Optional[str] = Field(default=None, max_length=1000)
    release: Optional[str] = Field(default=None, max_length=200)
    environment: Optional[str] = Field(default=None, max_length=100)
    session_id: Optional[str] = Field(default=None, max_length=200)
    context: Dict[str, Any] = Field(default_factory=dict)


@router.post(
    "/frontend-errors",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limit_by_ip("frontend_errors"))],
)
async def capture_frontend_error(
    payload: FrontendErrorReport,
    request: Request,
    current_user=Depends(get_optional_current_user),
):
    """
    Capture a frontend runtime error and write it to backend logs.
    """
    settings = get_settings()
    request_id = getattr(request.state, "request_id", None)

    if not settings.monitoring_enabled or not settings.frontend_error_ingest_enabled:
        return {
            "accepted": False,
            "request_id": request_id,
            "timestamp": utc_now().isoformat(),
        }

    log_payload = {
        "request_id": request_id,
        "message": payload.message,
        "severity": payload.severity,
        "route": payload.route,
        "url": payload.url,
        "release": payload.release,
        "environment": payload.environment,
        "session_id": payload.session_id,
        "user_agent": payload.user_agent,
        "user_id": str(current_user.id) if current_user else None,
        "user_email": getattr(current_user, "email", None) if current_user else None,
        "context": payload.context,
        "stack": payload.stack,
        "component_stack": payload.component_stack,
    }

    log_message = "Frontend %s captured: %s | metadata=%s"
    serialized = json.dumps(log_payload, default=str)
    if payload.severity == "warning":
        logger.warning(log_message, payload.severity, payload.message, serialized)
    else:
        logger.error(log_message, payload.severity, payload.message, serialized)

    return {
        "accepted": True,
        "request_id": request_id,
        "timestamp": utc_now().isoformat(),
    }
