"""
Simple in-memory rate limiting helpers for sensitive API routes.

This is intentionally lightweight so we can harden the app without adding
external dependencies or changing the auth/session model first.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import ceil
from threading import Lock
from time import monotonic

from fastapi import Depends, HTTPException, Request, Response, status

from app.core.security import get_optional_current_user


@dataclass(frozen=True)
class RateLimitRule:
    max_requests: int
    window_seconds: int


@dataclass
class _WindowState:
    window_started_at: float
    request_count: int


RATE_LIMIT_RULES: dict[str, RateLimitRule] = {
    "auth_google": RateLimitRule(max_requests=10, window_seconds=300),
    "frontend_errors": RateLimitRule(max_requests=20, window_seconds=60),
    "invite_writes": RateLimitRule(max_requests=20, window_seconds=300),
    "reminder_writes": RateLimitRule(max_requests=5, window_seconds=300),
    "file_upload_writes": RateLimitRule(max_requests=20, window_seconds=300),
    "comment_writes": RateLimitRule(max_requests=60, window_seconds=60),
    "submission_writes": RateLimitRule(max_requests=30, window_seconds=60),
    "project_writes": RateLimitRule(max_requests=60, window_seconds=60),
    "project_member_writes": RateLimitRule(max_requests=30, window_seconds=60),
    "project_work_writes": RateLimitRule(max_requests=90, window_seconds=60),
    "project_join_request_writes": RateLimitRule(max_requests=20, window_seconds=300),
    "settings_writes": RateLimitRule(max_requests=10, window_seconds=300),
    "user_profile_writes": RateLimitRule(max_requests=20, window_seconds=300),
    "user_admin_writes": RateLimitRule(max_requests=20, window_seconds=300),
}

_RATE_LIMIT_STATE: dict[str, _WindowState] = {}
_RATE_LIMIT_LOCK = Lock()


def reset_rate_limit_state() -> None:
    """Clear in-memory rate limit counters, primarily for tests."""
    with _RATE_LIMIT_LOCK:
        _RATE_LIMIT_STATE.clear()


def _get_client_identifier(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _build_state_key(scope: str, actor_key: str) -> str:
    return f"{scope}:{actor_key}"


def _apply_rate_limit(
    *,
    scope: str,
    actor_key: str,
    response: Response,
) -> None:
    rule = RATE_LIMIT_RULES[scope]
    now = monotonic()
    state_key = _build_state_key(scope, actor_key)

    with _RATE_LIMIT_LOCK:
        state = _RATE_LIMIT_STATE.get(state_key)
        if state is None or (now - state.window_started_at) >= rule.window_seconds:
            state = _WindowState(window_started_at=now, request_count=0)
            _RATE_LIMIT_STATE[state_key] = state

        elapsed = now - state.window_started_at
        retry_after = max(1, ceil(rule.window_seconds - elapsed))

        if state.request_count >= rule.max_requests:
            headers = {
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(rule.max_requests),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(retry_after),
            }
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
                headers=headers,
            )

        state.request_count += 1
        remaining = max(0, rule.max_requests - state.request_count)
        reset_after = max(1, ceil(rule.window_seconds - (now - state.window_started_at)))

    response.headers["X-RateLimit-Limit"] = str(rule.max_requests)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    response.headers["X-RateLimit-Reset"] = str(reset_after)


def rate_limit_by_ip(scope: str):
    async def dependency(request: Request, response: Response):
        _apply_rate_limit(
            scope=scope,
            actor_key=f"ip:{_get_client_identifier(request)}",
            response=response,
        )

    return dependency


def rate_limit_by_user(scope: str):
    async def dependency(
        request: Request,
        response: Response,
        current_user=Depends(get_optional_current_user),
    ):
        if current_user is not None:
            actor_key = f"user:{current_user.id}:{_get_client_identifier(request)}"
        else:
            actor_key = f"ip:{_get_client_identifier(request)}"

        _apply_rate_limit(
            scope=scope,
            actor_key=actor_key,
            response=response,
        )

    return dependency
