import asyncio
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.main import db
from app.core import rate_limit as rate_limit_core
from app.core.security import get_current_admin_user, get_current_operations_user, get_current_user
from app.core.time import utc_now
from app.api import invites as invites_api
from app.api import admin_access as admin_access_api
from app.api import auth as auth_api
from app.api import comments as comments_api
from app.api import monitoring as monitoring_api
from app.api import files as files_api
from app.api import notifications as notifications_api
from app.api import projects as projects_api
from app.api import project_join_requests as project_join_requests_api
from app.api import project_work_items as project_work_items_api
from app.api import settings as settings_api
from app.api import submissions as submissions_api
from app.api import users as users_api
from app.core import admin_access as admin_access_core
from app.models.admin_access import AdminAccessGrantCreate, AdminAccessScope
from app.models.settings import AdminSettings, FormSection, WeeklyUpdateSettings
from app.models.submission import SubmissionStatus
from app.models.user import UserRole


class FakeField:
    def __init__(self, name: str):
        self.name = name

    def __eq__(self, other):
        return (self.name, "==", other)

    def __ne__(self, other):
        return (self.name, "!=", other)


def make_user(
    *,
    role: UserRole = UserRole.VOLUNTEER,
    profile_complete: bool = True,
    invited_only: bool = False,
    last_login: datetime | None = datetime(2026, 3, 18),
):
    user = SimpleNamespace(
        id="user-123",
        email="user@example.com",
        name="Portal User",
        picture=None,
        role=role,
        team="Operations",
        is_active=True,
        invited_only=invited_only,
        total_hours=12.5,
        total_submissions=4,
        submission_streak=2,
        profile_complete=profile_complete,
        file_access_expires=None,
        created_at=datetime(2026, 3, 1),
        last_login=last_login,
        updated_at=datetime(2026, 3, 18),
    )
    user.save = AsyncMock()
    return user


def make_user_response_payload(user):
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "role": user.role,
        "team": user.team,
        "is_active": user.is_active,
        "invited_only": getattr(user, "invited_only", False),
        "total_hours": getattr(user, "total_hours", 0.0),
        "total_submissions": getattr(user, "total_submissions", 0),
        "submission_streak": getattr(user, "submission_streak", 0),
        "profile_complete": getattr(user, "profile_complete", False),
        "file_access_expires": getattr(user, "file_access_expires", None),
        "admin_access": {
            "can_access_portal": False,
            "is_delegated": False,
            "scopes": [],
        },
        "created_at": user.created_at,
        "last_login": user.last_login,
    }


@pytest.fixture
def api_client(monkeypatch):
    monkeypatch.setattr(db, "connect", AsyncMock())
    monkeypatch.setattr(db, "disconnect", AsyncMock())
    rate_limit_core.reset_rate_limit_state()

    with TestClient(app) as client:
        yield client

    rate_limit_core.reset_rate_limit_state()
    app.dependency_overrides.clear()


def test_get_current_user_profile_keeps_pending_login_state(api_client):
    user = make_user(profile_complete=False, invited_only=True, last_login=None)
    app.dependency_overrides[get_current_user] = lambda: user

    response = api_client.get("/api/v1/users/me")

    assert response.status_code == 200
    body = response.json()
    assert body["invited_only"] is True
    assert body["last_login"] is None


def test_team_lead_can_list_active_users_for_project_assignment(api_client, monkeypatch):
    team_lead = make_user(role=UserRole.TEAM_LEAD)
    app.dependency_overrides[get_current_user] = lambda: team_lead

    chain = MagicMock()
    chain.skip.return_value = chain
    chain.limit.return_value = chain
    chain.to_list = AsyncMock(return_value=[])

    find_mock = MagicMock(return_value=chain)
    monkeypatch.setattr(users_api, "User", SimpleNamespace(find=find_mock))

    response = api_client.get("/api/v1/users?is_active=true")

    assert response.status_code == 200
    assert response.json() == []
    find_mock.assert_called_once_with({"is_active": True})


def test_set_name_updates_profile_and_marks_user_complete(api_client):
    user = make_user(profile_complete=False)
    app.dependency_overrides[get_current_user] = lambda: user

    response = api_client.post("/api/v1/users/me/set-name", json={"full_name": "Jane Doe"})

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Jane Doe"
    assert body["profile_complete"] is True
    assert user.name == "Jane Doe"
    assert user.profile_complete is True
    user.save.assert_awaited_once()


def test_set_name_rejects_too_short_values(api_client):
    user = make_user(profile_complete=False)
    app.dependency_overrides[get_current_user] = lambda: user

    response = api_client.post("/api/v1/users/me/set-name", json={"full_name": "J"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Name must be at least 2 characters."
    user.save.assert_not_awaited()


def test_get_current_week_info_reports_existing_submission(api_client, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: make_user()

    fake_submission = SimpleNamespace(
        id="submission-123",
        status=SubmissionStatus.SUBMITTED,
    )

    monkeypatch.setattr(submissions_api, "get_week_id", lambda: "2026-W12")
    monkeypatch.setattr(
        submissions_api,
        "get_week_boundaries",
        lambda _week_id: (datetime(2026, 3, 16), datetime(2026, 3, 22)),
    )
    monkeypatch.setattr(
        submissions_api,
        "get_submission_window_bounds",
        lambda _week_id: (datetime(2026, 3, 20, 9, 0), datetime(2026, 3, 22, 23, 59)),
    )
    monkeypatch.setattr(submissions_api, "get_weekly_update_settings", lambda: SimpleNamespace(allow_late_submissions=False))
    monkeypatch.setattr(submissions_api, "is_submission_window_open", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(submissions_api.Submission, "user_id", FakeField("user_id"), raising=False)
    monkeypatch.setattr(submissions_api.Submission, "week_id", FakeField("week_id"), raising=False)
    monkeypatch.setattr(submissions_api.Submission, "find_one", AsyncMock(return_value=fake_submission))

    response = api_client.get("/api/v1/submissions/current-week")

    assert response.status_code == 200
    body = response.json()
    assert body["week_id"] == "2026-W12"
    assert body["has_submission"] is True
    assert body["submission_status"] == "submitted"
    assert body["submission_id"] == "submission-123"
    assert body["submission_window_start"] == "2026-03-20T09:00:00"
    assert body["submission_deadline"] == "2026-03-22T23:59:00"
    assert body["allow_late_submissions"] is False


def test_get_current_week_info_accepts_explicit_week_id(api_client, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: make_user()

    monkeypatch.setattr(
        submissions_api,
        "get_week_boundaries",
        lambda week_id: (datetime(2026, 3, 9), datetime(2026, 3, 15)) if week_id == "2026-W11" else (datetime(2026, 3, 16), datetime(2026, 3, 22)),
    )
    monkeypatch.setattr(
        submissions_api,
        "get_submission_window_bounds",
        lambda week_id: (datetime(2026, 3, 13, 9, 0), datetime(2026, 3, 15, 23, 59)) if week_id == "2026-W11" else (datetime(2026, 3, 20, 9, 0), datetime(2026, 3, 22, 23, 59)),
    )
    monkeypatch.setattr(submissions_api, "get_weekly_update_settings", lambda: SimpleNamespace(allow_late_submissions=True))
    monkeypatch.setattr(submissions_api, "is_submission_window_open", lambda week_id, *_args, **_kwargs: week_id == "2026-W11")
    monkeypatch.setattr(submissions_api.Submission, "user_id", FakeField("user_id"), raising=False)
    monkeypatch.setattr(submissions_api.Submission, "week_id", FakeField("week_id"), raising=False)
    monkeypatch.setattr(submissions_api.Submission, "find_one", AsyncMock(return_value=None))

    response = api_client.get("/api/v1/submissions/current-week?week_id=2026-W11")

    assert response.status_code == 200
    body = response.json()
    assert body["week_id"] == "2026-W11"
    assert body["week_start"] == "2026-03-09T00:00:00"
    assert body["week_end"] == "2026-03-15T00:00:00"
    assert body["is_submission_window_open"] is True
    assert body["has_submission"] is False


def test_get_selectable_submission_weeks_filters_closed_past_weeks(api_client, monkeypatch):
    user = make_user()
    app.dependency_overrides[get_current_user] = lambda: user

    draft_submission = SimpleNamespace(
        id="submission-older-draft",
        week_id="2026-W11",
        status=SubmissionStatus.DRAFT,
    )

    monkeypatch.setattr(submissions_api, "get_week_id", lambda: "2026-W12")
    monkeypatch.setattr(submissions_api, "build_recent_week_ids", lambda *_args, **_kwargs: ["2026-W12", "2026-W11", "2026-W10"])
    monkeypatch.setattr(
        submissions_api,
        "get_week_boundaries",
        lambda week_id: {
            "2026-W12": (datetime(2026, 3, 16), datetime(2026, 3, 22)),
            "2026-W11": (datetime(2026, 3, 9), datetime(2026, 3, 15)),
            "2026-W10": (datetime(2026, 3, 2), datetime(2026, 3, 8)),
        }[week_id],
    )
    monkeypatch.setattr(submissions_api, "can_submit_for_week", lambda week_id, *_args, **_kwargs: week_id == "2026-W12")
    monkeypatch.setattr(submissions_api.Submission, "user_id", FakeField("user_id"), raising=False)
    monkeypatch.setattr(submissions_api.Submission, "find", MagicMock(return_value=SimpleNamespace(to_list=AsyncMock(return_value=[draft_submission]))), raising=False)

    response = api_client.get("/api/v1/submissions/selectable-weeks")

    assert response.status_code == 200
    body = response.json()
    assert [week["week_id"] for week in body["weeks"]] == ["2026-W12", "2026-W11"]
    assert body["weeks"][1]["submission_id"] == "submission-older-draft"
    assert body["weeks"][1]["submission_status"] == "draft"


def test_create_submission_rejects_when_window_closed(api_client, monkeypatch):
    user = make_user()
    app.dependency_overrides[get_current_user] = lambda: user

    monkeypatch.setattr(submissions_api, "get_week_id", lambda: "2026-W12")
    monkeypatch.setattr(
        submissions_api,
        "get_week_boundaries",
        lambda _week_id: (datetime(2026, 3, 16), datetime(2026, 3, 22, 23, 59, 59)),
    )
    monkeypatch.setattr(submissions_api, "can_submit_for_week", lambda *_args, **_kwargs: False)

    response = api_client.post(
        "/api/v1/submissions",
        json={
            "project_id": "507f1f77bcf86cd799439012",
            "past_work": [],
            "present_work": [],
            "future_work": [],
            "blockers": "",
            "notes": "",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "The submission window for the selected week is currently closed."


def test_create_submission_allows_recent_selected_week(api_client, monkeypatch):
    user = make_user()
    app.dependency_overrides[get_current_user] = lambda: user

    insert_mock = AsyncMock()
    project = SimpleNamespace(id="507f1f77bcf86cd799439012", name="Food Drive 2026")
    monkeypatch.setattr(submissions_api, "get_week_id", lambda: "2026-W12")
    monkeypatch.setattr(
        submissions_api,
        "get_week_boundaries",
        lambda week_id: (datetime(2026, 3, 9), datetime(2026, 3, 15)) if week_id == "2026-W11" else (datetime(2026, 3, 16), datetime(2026, 3, 22)),
    )
    monkeypatch.setattr(submissions_api, "can_submit_for_week", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(submissions_api, "_get_submission_project_or_403", AsyncMock(return_value=project))
    monkeypatch.setattr(submissions_api, "apply_work_item_status_updates", AsyncMock(), raising=False)
    monkeypatch.setattr(submissions_api.Submission, "user_id", FakeField("user_id"), raising=False)
    monkeypatch.setattr(submissions_api.Submission, "week_id", FakeField("week_id"), raising=False)
    monkeypatch.setattr(submissions_api.Submission, "find_one", AsyncMock(return_value=None), raising=False)
    monkeypatch.setattr(submissions_api.Submission, "insert", insert_mock, raising=False)
    monkeypatch.setattr(submissions_api.Submission, "_document_settings", MagicMock(), raising=False)

    response = api_client.post(
        "/api/v1/submissions",
        json={
            "project_id": "507f1f77bcf86cd799439012",
            "week_id": "2026-W11",
            "past_work": [{"description": "Catch-up outreach", "hours": 3}],
            "present_work": [],
            "future_work": [],
            "blockers": "",
            "notes": "Backfilled missed week",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["week_id"] == "2026-W11"
    assert body["project_id"] == "507f1f77bcf86cd799439012"
    assert body["project_name"] == "Food Drive 2026"
    assert body["status"] == "draft"
    assert body["total_hours"] == 3
    insert_mock.assert_awaited_once()


def test_create_submission_rejects_weeks_outside_backfill_window(api_client, monkeypatch):
    user = make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    project = SimpleNamespace(id="507f1f77bcf86cd799439012", name="Food Drive 2026")

    monkeypatch.setattr(submissions_api, "get_week_id", lambda: "2026-W12")
    monkeypatch.setattr(
        submissions_api,
        "get_week_boundaries",
        lambda week_id: (datetime(2026, 1, 12), datetime(2026, 1, 18)) if week_id == "2026-W03" else (datetime(2026, 3, 16), datetime(2026, 3, 22)),
    )
    monkeypatch.setattr(submissions_api, "can_submit_for_week", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(submissions_api, "_get_submission_project_or_403", AsyncMock(return_value=project))
    monkeypatch.setattr(submissions_api.Submission, "user_id", FakeField("user_id"), raising=False)
    monkeypatch.setattr(submissions_api.Submission, "week_id", FakeField("week_id"), raising=False)
    monkeypatch.setattr(submissions_api.Submission, "find_one", AsyncMock(return_value=None), raising=False)

    response = api_client.post(
        "/api/v1/submissions",
        json={
            "project_id": "507f1f77bcf86cd799439012",
            "week_id": "2026-W03",
            "past_work": [],
            "present_work": [],
            "future_work": [],
            "blockers": "",
            "notes": "",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "You can only start submissions for the current week and the previous 7 weeks."


def test_google_login_rejects_uninvited_email(api_client, monkeypatch):
    monkeypatch.setattr(
        auth_api,
        "verify_google_token",
        AsyncMock(
            return_value={
                "email": "outsider@example.com",
                "sub": "google-user-1",
                "name": "Outside User",
            }
        ),
    )
    monkeypatch.setattr(auth_api, "get_settings", lambda: SimpleNamespace(is_admin=lambda _email: False))
    create_access_token_mock = MagicMock(return_value="jwt-token")
    monkeypatch.setattr(auth_api, "create_access_token", create_access_token_mock)
    monkeypatch.setattr(auth_api, "write_audit_log", AsyncMock())

    class FakeAllowedEmailDoc:
        email = FakeField("email")
        find_one = AsyncMock(return_value=None)

    class FakeUserDoc:
        email = FakeField("email")
        find_one = AsyncMock(return_value=None)

    monkeypatch.setattr(auth_api, "AllowedEmail", FakeAllowedEmailDoc)
    monkeypatch.setattr(auth_api, "User", FakeUserDoc)

    response = api_client.post(
        "/api/v1/auth/google",
        json={"access_token": "google-token"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Access denied. You must be invited to join this portal."
    create_access_token_mock.assert_not_called()


def test_google_login_activates_existing_invited_user(api_client, monkeypatch):
    invited_user = make_user(role=UserRole.VOLUNTEER, invited_only=True, profile_complete=False, last_login=None)
    invited_user.is_active = False

    monkeypatch.setattr(
        auth_api,
        "verify_google_token",
        AsyncMock(
            return_value={
                "email": invited_user.email,
                "sub": "google-user-2",
                "name": "Portal User Updated",
                "picture": "https://example.com/avatar.png",
            }
        ),
    )
    monkeypatch.setattr(auth_api, "get_settings", lambda: SimpleNamespace(is_admin=lambda _email: False))
    monkeypatch.setattr(
        auth_api,
        "AllowedEmail",
        SimpleNamespace(
            email=FakeField("email"),
            find_one=AsyncMock(return_value=SimpleNamespace(role=UserRole.TEAM_LEAD)),
        ),
    )
    monkeypatch.setattr(
        auth_api,
        "User",
        SimpleNamespace(
            email=FakeField("email"),
            find_one=AsyncMock(return_value=invited_user),
        ),
    )
    create_access_token_mock = MagicMock(return_value="signed-jwt")
    monkeypatch.setattr(auth_api, "create_access_token", create_access_token_mock)
    monkeypatch.setattr(
        auth_api,
        "build_user_response",
        AsyncMock(side_effect=lambda user: make_user_response_payload(user)),
    )
    write_audit_log_mock = AsyncMock()
    monkeypatch.setattr(auth_api, "write_audit_log", write_audit_log_mock)

    response = api_client.post(
        "/api/v1/auth/google",
        json={"access_token": "google-token"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"] == "signed-jwt"
    assert body["user"]["role"] == "team_lead"
    assert body["user"]["invited_only"] is False
    assert invited_user.name == "Portal User Updated"
    assert invited_user.picture == "https://example.com/avatar.png"
    assert invited_user.google_id == "google-user-2"
    assert invited_user.google_access_token == "google-token"
    assert invited_user.role == UserRole.TEAM_LEAD
    assert invited_user.invited_only is False
    assert invited_user.is_active is True
    invited_user.save.assert_awaited_once()
    create_access_token_mock.assert_called_once()
    write_audit_log_mock.assert_awaited_once()


def test_google_login_accepts_legacy_mixed_case_invite_record(api_client, monkeypatch):
    inserted_users: list[object] = []

    @dataclass
    class FakeAllowedEmailDoc:
        email: str
        role: UserRole = UserRole.VOLUNTEER
        invited_by: str | None = None
        created_at: datetime = field(default_factory=utc_now)
        save: AsyncMock = field(default_factory=AsyncMock)

    FakeAllowedEmailDoc.email = FakeField("email")
    legacy_invite = FakeAllowedEmailDoc(email="Harshini.Sony@gmail.com")

    @dataclass
    class FakeUserDoc:
        email: str
        google_id: str | None = None
        name: str = "Portal User"
        picture: str | None = None
        role: UserRole = UserRole.VOLUNTEER
        team: str | None = None
        is_active: bool = True
        profile_complete: bool = False
        invited_only: bool = False
        file_access_expires: datetime | None = None
        total_hours: float = 0.0
        total_submissions: int = 0
        submission_streak: int = 0
        created_at: datetime = field(default_factory=utc_now)
        updated_at: datetime = field(default_factory=utc_now)
        last_login: datetime | None = None
        google_access_token: str | None = None
        id: str = "legacy-user-1"

        async def insert(self):
            inserted_users.append(self)

    FakeUserDoc.email = FakeField("email")

    async def fake_allowed_find_one(query):
        if isinstance(query, tuple):
            return None
        return legacy_invite

    async def fake_user_find_one(_query):
        return None

    monkeypatch.setattr(
        auth_api,
        "verify_google_token",
        AsyncMock(
            return_value={
                "email": "harshini.sony@gmail.com",
                "sub": "google-user-harshini",
                "name": "Harshini Sony",
            }
        ),
    )
    monkeypatch.setattr(auth_api, "get_settings", lambda: SimpleNamespace(is_admin=lambda _email: False))
    monkeypatch.setattr(
        auth_api,
        "AllowedEmail",
        SimpleNamespace(
            email=FakeField("email"),
            find_one=AsyncMock(side_effect=fake_allowed_find_one),
        ),
    )
    monkeypatch.setattr(
        auth_api,
        "User",
        FakeUserDoc,
    )
    monkeypatch.setattr(FakeUserDoc, "find_one", AsyncMock(side_effect=fake_user_find_one), raising=False)
    monkeypatch.setattr(auth_api, "create_access_token", MagicMock(return_value="jwt-token"))
    monkeypatch.setattr(
        auth_api,
        "build_user_response",
        AsyncMock(side_effect=lambda user: make_user_response_payload(user)),
    )
    monkeypatch.setattr(auth_api, "write_audit_log", AsyncMock())

    response = api_client.post(
        "/api/v1/auth/google",
        json={"access_token": "google-token"},
    )

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "harshini.sony@gmail.com"
    assert inserted_users[0].email == "harshini.sony@gmail.com"
    legacy_invite.save.assert_awaited_once()


def test_create_submission_rejects_negative_hours(api_client, monkeypatch):
    user = make_user()
    app.dependency_overrides[get_current_user] = lambda: user

    find_one_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(submissions_api, "get_week_id", lambda: "2026-W12")
    monkeypatch.setattr(
        submissions_api,
        "get_week_boundaries",
        lambda _week_id: (datetime(2026, 3, 16), datetime(2026, 3, 22, 23, 59, 59)),
    )
    monkeypatch.setattr(submissions_api, "can_submit_for_week", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(submissions_api.Submission, "find_one", find_one_mock, raising=False)

    response = api_client.post(
        "/api/v1/submissions",
        json={
            "project_id": "507f1f77bcf86cd799439012",
            "past_work": [{"description": "Follow-up calls", "hours": -1}],
            "present_work": [],
            "future_work": [],
            "blockers": "",
            "notes": "",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Past work entry 1 hours cannot be negative."
    find_one_mock.assert_not_awaited()


def test_create_submission_rejects_total_hours_above_weekly_limit(api_client, monkeypatch):
    user = make_user()
    app.dependency_overrides[get_current_user] = lambda: user

    find_one_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(submissions_api, "get_week_id", lambda: "2026-W12")
    monkeypatch.setattr(
        submissions_api,
        "get_week_boundaries",
        lambda _week_id: (datetime(2026, 3, 16), datetime(2026, 3, 22, 23, 59, 59)),
    )
    monkeypatch.setattr(submissions_api, "can_submit_for_week", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(submissions_api.Submission, "find_one", find_one_mock, raising=False)

    response = api_client.post(
        "/api/v1/submissions",
        json={
            "project_id": "507f1f77bcf86cd799439012",
            "past_work": [{"description": "Weekend event", "hours": 120}],
            "present_work": [{"description": "Planning", "hours": 60}],
            "future_work": [],
            "blockers": "",
            "notes": "",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Total weekly hours cannot exceed 168."
    find_one_mock.assert_not_awaited()


def test_submit_submission_rejects_when_window_closed(api_client, monkeypatch):
    user = make_user()
    app.dependency_overrides[get_current_user] = lambda: user

    fake_submission = SimpleNamespace(
        id="507f1f77bcf86cd799439011",
        user_id=str(user.id),
        week_id="2026-W12",
        status=SubmissionStatus.DRAFT,
    )

    monkeypatch.setattr(submissions_api.Submission, "get", AsyncMock(return_value=fake_submission), raising=False)
    monkeypatch.setattr(submissions_api, "can_submit_for_week", lambda *_args, **_kwargs: False)

    response = api_client.post("/api/v1/submissions/507f1f77bcf86cd799439011/submit")

    assert response.status_code == 403
    assert response.json()["detail"] == "The submission window for the selected week is currently closed."


def test_submit_submission_rejects_invalid_draft_hours(api_client, monkeypatch):
    user = make_user()
    app.dependency_overrides[get_current_user] = lambda: user

    fake_submission = SimpleNamespace(
        id="507f1f77bcf86cd799439011",
        user_id=str(user.id),
        week_id="2026-W12",
        status=SubmissionStatus.DRAFT,
        past_work=[{"description": "Weekend event", "hours": 120}],
        present_work=[{"description": "Planning", "hours": 60}],
        future_work=[],
        blockers=None,
        notes=None,
        mood_rating=None,
        custom_responses={},
        total_hours=180.0,
        save=AsyncMock(),
    )

    monkeypatch.setattr(submissions_api.Submission, "get", AsyncMock(return_value=fake_submission), raising=False)
    monkeypatch.setattr(submissions_api, "can_submit_for_week", lambda *_args, **_kwargs: True)

    response = api_client.post("/api/v1/submissions/507f1f77bcf86cd799439011/submit")

    assert response.status_code == 400
    assert response.json()["detail"] == "Total weekly hours cannot exceed 168."
    fake_submission.save.assert_not_awaited()
    user.save.assert_not_awaited()


def test_get_settings_creates_default_when_missing(api_client, monkeypatch):
    user = make_user()
    app.dependency_overrides[get_current_user] = lambda: user

    insert_mock = AsyncMock()

    @dataclass
    class FakeSettingsDoc:
        settings_id: str = "global"
        tags: list[str] = field(
            default_factory=lambda: [
                "Outreach",
                "Admin",
                "Events",
                "Tech",
                "Fundraising",
                "Training",
                "Social Media",
                "Research",
                "Mentoring",
                "Other",
            ]
        )
        active_projects: list[str] = field(default_factory=list)
        form_sections: list[dict] = field(
            default_factory=lambda: [
                {
                    "id": "past",
                    "title": "Past Work",
                    "subtitle": "What was done",
                    "icon": "list",
                    "type": "work_entries",
                    "showHours": True,
                    "required": False,
                },
                {
                    "id": "present",
                    "title": "Present Work",
                    "subtitle": "In progress",
                    "icon": "refresh",
                    "type": "work_entries",
                    "showHours": True,
                    "required": False,
                },
                {
                    "id": "future",
                    "title": "Future Work",
                    "subtitle": "Planned",
                    "icon": "target",
                    "type": "work_entries",
                    "showHours": False,
                    "required": False,
                },
            ]
        )
        weekly_updates: WeeklyUpdateSettings = field(default_factory=WeeklyUpdateSettings)
        insert: AsyncMock = field(default=insert_mock)

        @classmethod
        async def find_one(cls, *_args, **_kwargs):
            return None

    FakeSettingsDoc.settings_id = FakeField("settings_id")
    monkeypatch.setattr(settings_api, "AdminSettings", FakeSettingsDoc)

    response = api_client.get("/api/v1/settings")

    assert response.status_code == 200
    body = response.json()
    assert body["settings_id"] == "global"
    assert len(body["form_sections"]) >= 3
    insert_mock.assert_awaited_once()


def test_update_settings_persists_admin_changes(api_client, monkeypatch):
    admin = make_user(role=UserRole.ADMIN)
    app.dependency_overrides[get_current_user] = lambda: admin

    monkeypatch.setattr(
        AdminSettings,
        "get_settings",
        classmethod(lambda cls: SimpleNamespace(motor_collection=object())),
    )
    monkeypatch.setattr(settings_api.AdminSettings, "settings_id", FakeField("settings_id"), raising=False)

    existing_settings = AdminSettings(
        tags=["Outreach"],
        active_projects=["Project A"],
        form_sections=[FormSection(id="past", title="Past Work", type="work_entries", showHours=True)],
    )
    save_mock = AsyncMock()
    monkeypatch.setattr(AdminSettings, "save", save_mock)
    monkeypatch.setattr(AdminSettings, "find_one", AsyncMock(return_value=existing_settings))

    response = api_client.put(
        "/api/v1/settings",
        json={
            "settings_id": "global",
            "tags": ["Outreach", "Training"],
            "active_projects": ["Project A", "Project B"],
            "weekly_updates": {
                "window_mode": "scheduled",
                "submissions_open_day": "friday",
                "submissions_open_hour": 9,
                "submissions_open_minute": 0,
                "deadline_day": "sunday",
                "deadline_hour": 20,
                "deadline_minute": 30,
                "allow_late_submissions": False,
                "timezone": "America/New_York",
            },
            "form_sections": [
                {
                    "id": "past",
                    "title": "Past Work",
                    "subtitle": "Completed tasks",
                    "icon": "list",
                    "type": "work_entries",
                    "showHours": True,
                    "required": False,
                }
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["settings"]["tags"] == ["Outreach", "Training"]
    assert body["settings"]["weekly_updates"]["window_mode"] == "scheduled"
    save_mock.assert_awaited_once()


def test_invite_and_revoke_flow(api_client, monkeypatch):
    admin = make_user(role=UserRole.ADMIN)
    admin.email = "admin@example.com"
    app.dependency_overrides[get_current_user] = lambda: admin

    inserted_invites: list[object] = []

    @dataclass
    class FakeAllowedEmailDoc:
        email: str
        role: UserRole = UserRole.VOLUNTEER
        invited_by: str | None = None
        created_at: datetime = field(default_factory=utc_now)

        async def insert(self):
            inserted_invites.append(self)

        async def delete(self):
            return None

    FakeAllowedEmailDoc.email = FakeField("email")

    inserted_users: list[object] = []

    @dataclass
    class FakeUserDoc:
        email: str
        name: str
        role: UserRole
        is_active: bool = True
        profile_complete: bool = False
        invited_only: bool = False
        last_login: datetime | None = None

        async def insert(self):
            inserted_users.append(self)

        async def save(self):
            return None

    FakeUserDoc.email = FakeField("email")

    async def fake_invite_find_one(*_args, **_kwargs):
        return None

    async def fake_user_find_one(*_args, **_kwargs):
        return inserted_users[0] if inserted_users else None

    delete_mock = AsyncMock()

    monkeypatch.setattr(invites_api, "AllowedEmail", FakeAllowedEmailDoc)
    monkeypatch.setattr(invites_api, "User", FakeUserDoc)
    monkeypatch.setattr("app.api.invites.is_email_configured", lambda: False)
    monkeypatch.setattr(FakeAllowedEmailDoc, "find_one", AsyncMock(side_effect=fake_invite_find_one), raising=False)
    monkeypatch.setattr(FakeUserDoc, "find_one", AsyncMock(side_effect=fake_user_find_one), raising=False)

    create_response = api_client.post(
        "/api/v1/invites",
        json={"email": "Test@Example.com", "role": "volunteer"},
    )

    assert create_response.status_code == 201
    assert create_response.json()["email"] == "test@example.com"
    assert inserted_invites[0].invited_by == "admin@example.com"
    assert inserted_users[0].email == "test@example.com"
    assert inserted_users[0].invited_only is True
    assert inserted_users[0].is_active is True
    assert inserted_users[0].last_login is None

    invite_to_delete = inserted_invites[0]
    invite_to_delete.delete = delete_mock
    monkeypatch.setattr(FakeAllowedEmailDoc, "find_one", AsyncMock(return_value=invite_to_delete), raising=False)
    inserted_users[0].save = AsyncMock()

    revoke_response = api_client.delete("/api/v1/invites/TEST@EXAMPLE.COM")

    assert revoke_response.status_code == 204
    delete_mock.assert_awaited_once()
    assert inserted_users[0].is_active is False
    inserted_users[0].save.assert_awaited_once()


def test_invite_user_blocks_case_insensitive_duplicates(api_client, monkeypatch):
    admin = make_user(role=UserRole.ADMIN)
    admin.email = "admin@example.com"
    app.dependency_overrides[get_current_user] = lambda: admin

    existing_invite = SimpleNamespace(email="Harshini.Sony@gmail.com", save=AsyncMock())

    async def fake_invite_find_one(query):
        if isinstance(query, tuple):
            return None
        return existing_invite

    monkeypatch.setattr(
        invites_api,
        "AllowedEmail",
        SimpleNamespace(
            email=FakeField("email"),
            find_one=AsyncMock(side_effect=fake_invite_find_one),
        ),
    )
    monkeypatch.setattr("app.api.invites.is_email_configured", lambda: False)

    response = api_client.post(
        "/api/v1/invites",
        json={"email": "harshini.sony@gmail.com", "role": "volunteer"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "User already invited"


def test_list_invites_reports_pending_vs_access_records(api_client, monkeypatch):
    admin = make_user(role=UserRole.ADMIN)
    app.dependency_overrides[get_current_user] = lambda: admin

    invite_docs = [
        SimpleNamespace(
            id="invite-1",
            email="pending@example.com",
            role=UserRole.VOLUNTEER,
            invited_by="admin@example.com",
            created_at=datetime(2026, 4, 2, 10, 0),
        ),
        SimpleNamespace(
            id="invite-2",
            email="logged@example.com",
            role=UserRole.TEAM_LEAD,
            invited_by="admin@example.com",
            created_at=datetime(2026, 4, 2, 11, 0),
        ),
    ]

    invite_chain = MagicMock()
    invite_chain.to_list = AsyncMock(return_value=invite_docs)

    async def fake_user_find_one(*args, **_kwargs):
        email = args[0][2]
        if email == "pending@example.com":
            return SimpleNamespace(invited_only=True, name="Pending User", last_login=None)
        if email == "logged@example.com":
            return SimpleNamespace(invited_only=False, name="Logged User", last_login=datetime(2026, 4, 3, 9, 30))
        return None

    monkeypatch.setattr(invites_api, "AllowedEmail", SimpleNamespace(find_all=MagicMock(return_value=invite_chain)))
    monkeypatch.setattr(
        invites_api,
        "User",
        SimpleNamespace(
            email=FakeField("email"),
            find_one=AsyncMock(side_effect=fake_user_find_one),
        ),
    )

    response = api_client.get("/api/v1/invites")

    assert response.status_code == 200
    body = response.json()
    assert body[0]["email"] == "pending@example.com"
    assert body[0]["portal_status"] == "pending_login"
    assert body[0]["has_logged_in"] is False
    assert body[1]["email"] == "logged@example.com"
    assert body[1]["portal_status"] == "access_record"
    assert body[1]["has_logged_in"] is True
    assert body[1]["user_name"] == "Logged User"


def test_legacy_manage_users_scope_normalizes_to_profile_and_status_access():
    scopes = admin_access_core.normalize_admin_scopes([AdminAccessScope.MANAGE_USERS])

    assert scopes == [
        AdminAccessScope.VIEW_USERS,
        AdminAccessScope.EDIT_USERS,
        AdminAccessScope.MANAGE_USER_STATUS,
    ]


def test_build_user_responses_batches_delegated_access_lookups(monkeypatch):
    admin_user = make_user(role=UserRole.ADMIN)
    admin_user.id = "admin-1"

    delegated_user = make_user(role=UserRole.VOLUNTEER)
    delegated_user.id = "delegate-1"
    delegated_user.email = "delegate@example.com"
    delegated_user.name = "Delegated Volunteer"

    fake_grant = SimpleNamespace(
        id="grant-1",
        user_id=delegated_user.id,
        scopes=[AdminAccessScope.VIEW_USERS],
        granted_by_email="admin@example.com",
        expires_at=None,
    )

    chain = MagicMock()
    chain.to_list = AsyncMock(return_value=[fake_grant])
    find_mock = MagicMock(return_value=chain)
    monkeypatch.setattr(admin_access_core, "AdminAccessGrant", SimpleNamespace(find=find_mock))

    responses = asyncio.run(admin_access_core.build_user_responses([admin_user, delegated_user]))

    assert len(responses) == 2
    assert responses[0].admin_access.can_access_portal is True
    assert responses[0].admin_access.is_delegated is False
    assert responses[1].admin_access.can_access_portal is True
    assert responses[1].admin_access.is_delegated is True
    assert responses[1].admin_access.scopes == [AdminAccessScope.VIEW_USERS]
    find_mock.assert_called_once_with({
        "user_id": {"$in": [delegated_user.id]},
        "is_active": True,
    })


def test_delegated_role_manager_cannot_promote_someone_to_admin(monkeypatch):
    target_user_id = "507f1f77bcf86cd799439011"
    current_user = make_user(role=UserRole.VOLUNTEER)
    current_user.id = "delegate-1"
    target_user = make_user(role=UserRole.VOLUNTEER)
    target_user.id = target_user_id

    monkeypatch.setattr(users_api.User, "get", AsyncMock(return_value=target_user))
    monkeypatch.setattr(
        users_api,
        "get_admin_access_context",
        AsyncMock(return_value=SimpleNamespace(
            is_admin=False,
            has_any_scope=lambda *scopes: AdminAccessScope.MANAGE_USER_ROLES in scopes,
        )),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            users_api.admin_update_user(
                target_user_id,
                users_api.UserAdminUpdate(role=UserRole.ADMIN),
                current_user=current_user,
            )
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Only full admins can assign or modify the administrator role"


def test_edit_only_delegate_cannot_toggle_user_status(monkeypatch):
    target_user_id = "507f1f77bcf86cd799439012"
    current_user = make_user(role=UserRole.VOLUNTEER)
    current_user.id = "delegate-2"
    target_user = make_user(role=UserRole.VOLUNTEER)
    target_user.id = target_user_id

    monkeypatch.setattr(users_api.User, "get", AsyncMock(return_value=target_user))
    monkeypatch.setattr(
        users_api,
        "get_admin_access_context",
        AsyncMock(return_value=SimpleNamespace(
            is_admin=False,
            has_any_scope=lambda *scopes: AdminAccessScope.EDIT_USERS in scopes,
        )),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            users_api.admin_update_user(
                target_user_id,
                users_api.UserAdminUpdate(is_active=False),
                current_user=current_user,
            )
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Manage user status access required"


def test_non_admin_access_manager_cannot_delegate_sensitive_scopes(monkeypatch):
    target_user_id = "507f1f77bcf86cd799439013"
    current_user = make_user(role=UserRole.VOLUNTEER)
    current_user.id = "delegate-3"
    current_user.email = "delegate@example.com"
    current_user.name = "Delegate Manager"
    target_user = make_user(role=UserRole.VOLUNTEER)
    target_user.id = target_user_id

    monkeypatch.setattr(admin_access_api.User, "get", AsyncMock(return_value=target_user))
    monkeypatch.setattr(admin_access_api.AdminAccessGrant, "find_one", AsyncMock(return_value=None), raising=False)
    monkeypatch.setattr(admin_access_api, "write_audit_log", AsyncMock())
    monkeypatch.setattr(
        admin_access_api,
        "get_admin_access_context",
        AsyncMock(return_value=SimpleNamespace(
            is_admin=False,
            scopes=[
                AdminAccessScope.MANAGE_ADMIN_ACCESS,
                AdminAccessScope.VIEW_USERS,
                AdminAccessScope.EDIT_USERS,
                AdminAccessScope.VIEW_ADMIN_ACCESS,
            ],
        )),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            admin_access_api.create_admin_access_grant(
                AdminAccessGrantCreate(
                    user_id=target_user_id,
                    scopes=[AdminAccessScope.MANAGE_USER_ROLES],
                ),
                request=SimpleNamespace(),
                current_admin=current_user,
            )
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "You can only delegate the non-sensitive admin scopes you currently hold"


def test_frontend_error_reports_are_logged(api_client, monkeypatch):
    error_logger = SimpleNamespace(error=MagicMock(), warning=MagicMock())
    monkeypatch.setattr(monitoring_api, "logger", error_logger)

    response = api_client.post(
        "/api/v1/monitoring/frontend-errors",
        json={
            "message": "Unhandled dashboard crash",
            "severity": "error",
            "route": "/dashboard",
            "url": "http://localhost:5173/dashboard",
            "release": "test-build",
            "environment": "test",
            "session_id": "session-123",
            "context": {"source": "vitest"},
        },
    )

    assert response.status_code == 202
    assert response.json()["accepted"] is True
    error_logger.error.assert_called_once()
    assert response.headers["X-RateLimit-Limit"] == str(rate_limit_core.RATE_LIMIT_RULES["frontend_errors"].max_requests)


def test_frontend_error_reports_are_rate_limited(api_client, monkeypatch):
    error_logger = SimpleNamespace(error=MagicMock(), warning=MagicMock())
    monkeypatch.setattr(monitoring_api, "logger", error_logger)
    monkeypatch.setitem(
        rate_limit_core.RATE_LIMIT_RULES,
        "frontend_errors",
        rate_limit_core.RateLimitRule(max_requests=2, window_seconds=60),
    )

    payload = {
        "message": "Dashboard crash",
        "severity": "error",
        "route": "/dashboard",
    }

    first = api_client.post("/api/v1/monitoring/frontend-errors", json=payload)
    second = api_client.post("/api/v1/monitoring/frontend-errors", json=payload)
    third = api_client.post("/api/v1/monitoring/frontend-errors", json=payload)

    assert first.status_code == 202
    assert second.status_code == 202
    assert third.status_code == 429
    assert third.json()["detail"] == "Too many requests. Please try again later."
    assert third.headers["Retry-After"] == "60"


def test_admin_submissions_accept_limit_200(api_client, monkeypatch):
    admin = make_user(role=UserRole.ADMIN)
    app.dependency_overrides[get_current_user] = lambda: admin

    chain = MagicMock()
    chain.sort.return_value = chain
    chain.skip.return_value = chain
    chain.limit.return_value = chain
    chain.to_list = AsyncMock(return_value=[])

    find_mock = MagicMock(return_value=chain)
    monkeypatch.setattr(submissions_api, "Submission", SimpleNamespace(find=find_mock, created_at=1))

    response = api_client.get("/api/v1/submissions?limit=200")

    assert response.status_code == 200
    assert response.json() == []
    find_mock.assert_called_once_with({})
    chain.limit.assert_called_once_with(200)


def test_team_lead_cannot_access_admin_submission_queue_without_delegation(api_client, monkeypatch):
    team_lead = make_user(role=UserRole.TEAM_LEAD)
    app.dependency_overrides[get_current_user] = lambda: team_lead

    response = api_client.get("/api/v1/submissions?limit=50")

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin scope required"


def test_get_projects_serializes_linked_users(api_client, monkeypatch):
    user = make_user()
    app.dependency_overrides[get_current_user] = lambda: user

    lead = make_user(role=UserRole.TEAM_LEAD)
    lead.id = "lead-123"
    lead.email = "lead@example.com"
    lead.name = "Lead User"
    lead.team = "Programs"

    member = make_user(role=UserRole.VOLUNTEER)
    member.id = "member-456"
    member.email = "member@example.com"
    member.name = "Member User"
    member.team = "Outreach"

    fake_project = SimpleNamespace(
        id="project-1",
        name="Community Outreach",
        description="Weekend outreach effort",
        status="active",
        tags=["volunteer", "admin"],
        banner_image=None,
        lead=lead,
        members=[member],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 21),
    )

    chain = MagicMock()
    chain.to_list = AsyncMock(return_value=[fake_project])
    chain.find.return_value = chain

    find_mock = MagicMock(return_value=chain)
    monkeypatch.setattr(projects_api, "Project", SimpleNamespace(find=find_mock))

    response = api_client.get("/api/v1/projects")

    assert response.status_code == 200
    body = response.json()
    assert body == [
        {
            "id": "project-1",
            "name": "Community Outreach",
            "description": "Weekend outreach effort",
            "status": "active",
            "tags": ["volunteer", "admin"],
            "banner_image": None,
            "lead": {
                "id": "lead-123",
                "email": "lead@example.com",
                "name": "Lead User",
                "picture": None,
                "role": "team_lead",
                "team": "Programs",
                "invited_only": False,
            },
            "members": [
                {
                    "id": "member-456",
                    "email": "member@example.com",
                    "name": "Member User",
                    "picture": None,
                    "role": "volunteer",
                    "team": "Outreach",
                    "invited_only": False,
                }
            ],
            "created_at": "2026-03-20T00:00:00",
            "updated_at": "2026-03-21T00:00:00",
        }
    ]
    find_mock.assert_called_once_with(fetch_links=True)


def test_get_projects_keep_view_only_access_for_non_members(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    app.dependency_overrides[get_current_user] = lambda: user

    visible_project = SimpleNamespace(
        id="project-visible",
        name="Volunteer Outreach",
        description="Open to volunteer contributors",
        status="active",
        tags=["volunteer"],
        banner_image=None,
        lead=None,
        members=[],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 21),
    )
    restricted_project = SimpleNamespace(
        id="project-hidden",
        name="Admin Systems",
        description="Internal only",
        status="planned",
        tags=["admin"],
        banner_image=None,
        lead=None,
        members=[],
        created_at=datetime(2026, 3, 22),
        updated_at=datetime(2026, 3, 22),
    )

    chain = MagicMock()
    chain.to_list = AsyncMock(return_value=[visible_project, restricted_project])
    chain.find.return_value = chain

    monkeypatch.setattr(projects_api, "Project", SimpleNamespace(find=MagicMock(return_value=chain)))

    response = api_client.get("/api/v1/projects")

    assert response.status_code == 200
    body = response.json()
    assert [project["id"] for project in body] == ["project-visible", "project-hidden"]


def test_volunteer_can_create_project_and_becomes_lead(api_client, monkeypatch):
    creator = make_user(role=UserRole.VOLUNTEER)
    creator.id = "65f0c10e8eced6afed0a8b51"
    creator.email = "creator@example.com"
    creator.name = "Volunteer Creator"
    app.dependency_overrides[get_current_user] = lambda: creator

    created_docs: list[object] = []

    class FakeProjectDoc:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
            self.id = "project-creator-1"
            self.created_at = datetime(2026, 3, 20)
            self.updated_at = datetime(2026, 3, 20)

        async def create(self):
            created_docs.append(self)

        @staticmethod
        async def get(*_args, **_kwargs):
            return created_docs[0]

    monkeypatch.setattr(projects_api, "Project", FakeProjectDoc)

    response = api_client.post(
        "/api/v1/projects",
        json={
            "name": "Volunteer-Led Outreach",
            "description": "A new community support initiative.",
            "tags": ["volunteer", "outreach"],
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["lead"]["id"] == creator.id
    assert body["members"] == [
        {
            "id": creator.id,
            "email": creator.email,
            "name": creator.name,
            "picture": None,
            "role": "volunteer",
            "team": creator.team,
            "invited_only": False,
        }
    ]
    assert created_docs[0].lead == creator
    assert created_docs[0].members == [creator]


def test_volunteer_cannot_assign_other_people_while_creating_project(api_client, monkeypatch):
    creator = make_user(role=UserRole.VOLUNTEER)
    creator.id = "65f0c10e8eced6afed0a8b52"
    app.dependency_overrides[get_current_user] = lambda: creator

    class FakeProjectDoc:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

        async def create(self):
            raise AssertionError("Project should not be created")

    monkeypatch.setattr(projects_api, "Project", FakeProjectDoc)

    response = api_client.post(
        "/api/v1/projects",
        json={
            "name": "Volunteer-Led Outreach",
            "description": "A new community support initiative.",
            "lead_id": "65f0c10e8eced6afed0a8b99",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Volunteers can only assign themselves as project lead when creating a project"


def test_project_member_can_create_work_item_for_self(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a22"
    user.name = "Volunteer Builder"
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-123",
        name="Website Refresh",
        description="Refresh the portal experience",
        status="active",
        tags=["volunteer"],
        banner_image=None,
        lead=None,
        members=[SimpleNamespace(id=user.id)],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )

    created_docs: list[object] = []

    class FakeWorkItemDoc:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
            self.id = "work-item-1"

        async def create(self):
            created_docs.append(self)

    monkeypatch.setattr(project_work_items_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_work_items_api, "ProjectWorkItem", FakeWorkItemDoc)
    monkeypatch.setattr(project_work_items_api.User, "get", AsyncMock(return_value=user))

    response = api_client.post(
        "/api/v1/projects/project-123/work-items",
        json={
            "title": "Fix card spacing",
            "description": "Tighten the project card spacing on desktop.",
            "item_type": "issue",
            "status": "active",
            "priority": "high",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Fix card spacing"
    assert body["item_type"] == "issue"
    assert body["created_by_name"] == "Volunteer Builder"
    assert created_docs[0].project_id == "project-123"
    assert created_docs[0].assignee_id == user.id


def test_project_member_can_assign_new_work_item_to_project_teammate(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a29"
    user.name = "Volunteer Builder"
    teammate = SimpleNamespace(
        id="65f0c10e8eced6afed0a8a30",
        name="Teammate User",
        email="teammate@example.com",
        is_active=True,
    )
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-124",
        name="Website Refresh",
        description="Refresh the portal experience",
        status="active",
        tags=["volunteer"],
        banner_image=None,
        lead=None,
        members=[SimpleNamespace(id=user.id), SimpleNamespace(id=teammate.id)],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )

    created_docs: list[object] = []

    class FakeWorkItemDoc:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
            self.id = "work-item-assign"

        async def create(self):
            created_docs.append(self)

    monkeypatch.setattr(project_work_items_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_work_items_api, "ProjectWorkItem", FakeWorkItemDoc)
    monkeypatch.setattr(project_work_items_api.User, "get", AsyncMock(return_value=teammate))

    response = api_client.post(
        "/api/v1/projects/project-124/work-items",
        json={
            "title": "Draft volunteer email",
            "item_type": "task",
            "assignee_id": teammate.id,
        },
    )

    assert response.status_code == 201
    assert response.json()["assignee_id"] == teammate.id
    assert created_docs[0].assignee_id == teammate.id
    assert created_docs[0].assignee_name == teammate.name


def test_project_member_can_assign_new_work_item_to_multiple_project_teammates(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8b01"
    user.name = "Volunteer Builder"
    teammate_one = SimpleNamespace(
        id="65f0c10e8eced6afed0a8b02",
        name="Teammate One",
        email="teammate-one@example.com",
        is_active=True,
    )
    teammate_two = SimpleNamespace(
        id="65f0c10e8eced6afed0a8b03",
        name="Teammate Two",
        email="teammate-two@example.com",
        is_active=True,
    )
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-124b",
        name="Website Refresh",
        description="Refresh the portal experience",
        status="active",
        tags=["volunteer"],
        banner_image=None,
        lead=None,
        members=[
            SimpleNamespace(id=user.id),
            SimpleNamespace(id=teammate_one.id),
            SimpleNamespace(id=teammate_two.id),
        ],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )

    created_docs: list[object] = []

    class FakeWorkItemDoc:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
            self.id = "work-item-multi-assign"

        async def create(self):
            created_docs.append(self)

    async def fake_get_user(user_id):
        user_id = str(user_id)
        if user_id == teammate_one.id:
            return teammate_one
        if user_id == teammate_two.id:
            return teammate_two
        return None

    monkeypatch.setattr(project_work_items_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_work_items_api, "ProjectWorkItem", FakeWorkItemDoc)
    monkeypatch.setattr(project_work_items_api.User, "get", AsyncMock(side_effect=fake_get_user))

    response = api_client.post(
        "/api/v1/projects/project-124b/work-items",
        json={
            "title": "Coordinate launch checklist",
            "item_type": "task",
            "assignee_ids": [teammate_one.id, teammate_two.id],
        },
    )

    assert response.status_code == 201
    assert response.json()["assignee_ids"] == [teammate_one.id, teammate_two.id]
    assert response.json()["assignee_names"] == [teammate_one.name, teammate_two.name]
    assert created_docs[0].assignee_ids == [teammate_one.id, teammate_two.id]
    assert created_docs[0].assignee_names == [teammate_one.name, teammate_two.name]
    assert created_docs[0].assignee_id == teammate_one.id
    assert created_docs[0].assignee_name == teammate_one.name


def test_project_work_item_creation_is_rate_limited_per_user(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a40"
    user.name = "Volunteer Builder"
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-125",
        name="Website Refresh",
        description="Refresh the portal experience",
        status="active",
        tags=["volunteer"],
        banner_image=None,
        lead=None,
        members=[SimpleNamespace(id=user.id)],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )

    class FakeWorkItemDoc:
        created_count = 0

        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
            FakeWorkItemDoc.created_count += 1
            self.id = f"work-item-{FakeWorkItemDoc.created_count}"

        async def create(self):
            return None

    monkeypatch.setitem(
        rate_limit_core.RATE_LIMIT_RULES,
        "project_work_writes",
        rate_limit_core.RateLimitRule(max_requests=2, window_seconds=60),
    )
    monkeypatch.setattr(project_work_items_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_work_items_api, "ProjectWorkItem", FakeWorkItemDoc)
    monkeypatch.setattr(project_work_items_api.User, "get", AsyncMock(return_value=user))

    payload = {
        "title": "Fix card spacing",
        "description": "Tighten the project card spacing on desktop.",
        "item_type": "issue",
        "status": "active",
        "priority": "high",
    }

    first = api_client.post("/api/v1/projects/project-125/work-items", json=payload)
    second = api_client.post("/api/v1/projects/project-125/work-items", json=payload)
    third = api_client.post("/api/v1/projects/project-125/work-items", json=payload)

    assert first.status_code == 201
    assert second.status_code == 201
    assert third.status_code == 429
    assert third.json()["detail"] == "Too many requests. Please try again later."
    assert third.headers["X-RateLimit-Remaining"] == "0"


def test_non_member_blocks_project_work_creation(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a23"
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-untagged",
        name="Quiet Planning",
        description="Internal scoping work",
        status="planned",
        tags=[],
        banner_image=None,
        lead=None,
        members=[],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )

    monkeypatch.setattr(project_work_items_api, "_get_project_or_404", AsyncMock(return_value=fake_project))

    response = api_client.post(
        "/api/v1/projects/project-untagged/work-items",
        json={
            "title": "Draft next step",
            "item_type": "task",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Project contribution access required"


def test_assigned_project_member_can_update_work_item(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a24"
    user.name = "Assigned Volunteer"
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-456",
        name="Community Support",
        description="Support project",
        status="active",
        tags=[],
        banner_image=None,
        lead=None,
        members=[SimpleNamespace(id=user.id)],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )
    fake_work_item = SimpleNamespace(
        id="work-item-2",
        project_id="project-456",
        title="Call donors",
        description="Reach out to donors",
        item_type="task",
        status=project_work_items_api.WorkItemStatus.PENDING,
        priority="medium",
        assignee_id=user.id,
        assignee_name=user.name,
        created_by_id="65f0c10e8eced6afed0a8a99",
        created_by_name="Lead User",
        updated_by_id="65f0c10e8eced6afed0a8a99",
        updated_by_name="Lead User",
        due_date=None,
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
        save=AsyncMock(),
    )

    monkeypatch.setattr(project_work_items_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_work_items_api, "_get_work_item_or_404", AsyncMock(return_value=fake_work_item))

    response = api_client.patch(
        "/api/v1/projects/project-456/work-items/work-item-2",
        json={"status": "active"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert fake_work_item.status == project_work_items_api.WorkItemStatus.ACTIVE
    fake_work_item.save.assert_awaited_once()


def test_unassigned_project_member_cannot_update_someone_elses_work_item(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a25"
    user.name = "Project Member"
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-457",
        name="Community Support",
        description="Support project",
        status="active",
        tags=[],
        banner_image=None,
        lead=None,
        members=[SimpleNamespace(id=user.id), SimpleNamespace(id="65f0c10e8eced6afed0a8a26")],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )
    fake_work_item = SimpleNamespace(
        id="work-item-3",
        project_id="project-457",
        title="Coordinate meals",
        description="Coordinate meal delivery",
        item_type="task",
        status=project_work_items_api.WorkItemStatus.PENDING,
        priority="medium",
        assignee_id="65f0c10e8eced6afed0a8a26",
        assignee_name="Another Member",
        created_by_id="65f0c10e8eced6afed0a8a99",
        created_by_name="Lead User",
        updated_by_id="65f0c10e8eced6afed0a8a99",
        updated_by_name="Lead User",
        due_date=None,
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
        save=AsyncMock(),
    )

    monkeypatch.setattr(project_work_items_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_work_items_api, "_get_work_item_or_404", AsyncMock(return_value=fake_work_item))

    response = api_client.patch(
        "/api/v1/projects/project-457/work-items/work-item-3",
        json={"status": "active"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Work item edit access required"
    fake_work_item.save.assert_not_awaited()


def test_project_member_can_reassign_work_item_to_project_teammate(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a27"
    user.name = "Assigned Member"
    app.dependency_overrides[get_current_user] = lambda: user
    teammate = SimpleNamespace(
        id="65f0c10e8eced6afed0a8a28",
        name="Teammate User",
        email="teammate@example.com",
        is_active=True,
    )

    fake_project = SimpleNamespace(
        id="project-458",
        name="Community Support",
        description="Support project",
        status="active",
        tags=[],
        banner_image=None,
        lead=None,
        members=[SimpleNamespace(id=user.id), SimpleNamespace(id=teammate.id)],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )
    fake_work_item = SimpleNamespace(
        id="work-item-4",
        project_id="project-458",
        title="Check inventory",
        description="Review storage inventory",
        item_type="task",
        status=project_work_items_api.WorkItemStatus.PENDING,
        priority="medium",
        assignee_id=user.id,
        assignee_name=user.name,
        created_by_id="65f0c10e8eced6afed0a8a99",
        created_by_name="Lead User",
        updated_by_id="65f0c10e8eced6afed0a8a99",
        updated_by_name="Lead User",
        due_date=None,
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
        save=AsyncMock(),
    )

    monkeypatch.setattr(project_work_items_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_work_items_api, "_get_work_item_or_404", AsyncMock(return_value=fake_work_item))
    monkeypatch.setattr(project_work_items_api.User, "get", AsyncMock(return_value=teammate))

    response = api_client.patch(
        "/api/v1/projects/project-458/work-items/work-item-4",
        json={"assignee_id": teammate.id},
    )

    assert response.status_code == 200
    assert response.json()["assignee_id"] == teammate.id
    assert fake_work_item.assignee_id == teammate.id
    assert fake_work_item.assignee_name == teammate.name
    fake_work_item.save.assert_awaited_once()


def test_project_member_can_claim_work_item_for_themselves(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a81"
    user.name = "Volunteer Builder"
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-498",
        name="Community Support",
        description="Support project",
        status="active",
        tags=[],
        banner_image=None,
        lead=None,
        members=[SimpleNamespace(id=user.id), SimpleNamespace(id="65f0c10e8eced6afed0a8a82")],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )
    fake_work_item = SimpleNamespace(
        id="work-item-8",
        project_id="project-498",
        title="Draft follow-up email",
        description="Prepare the follow-up draft",
        item_type="task",
        status=project_work_items_api.WorkItemStatus.PENDING,
        priority="medium",
        assignee_id="65f0c10e8eced6afed0a8a82",
        assignee_name="Existing Assignee",
        assignee_ids=["65f0c10e8eced6afed0a8a82"],
        assignee_names=["Existing Assignee"],
        created_by_id="65f0c10e8eced6afed0a8a99",
        created_by_name="Lead User",
        updated_by_id="65f0c10e8eced6afed0a8a99",
        updated_by_name="Lead User",
        due_date=None,
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
        save=AsyncMock(),
    )

    existing_assignee = SimpleNamespace(
        id="65f0c10e8eced6afed0a8a82",
        name="Existing Assignee",
        email="existing@example.com",
        is_active=True,
    )

    async def fake_get_user(user_id):
        user_id = str(user_id)
        if user_id == existing_assignee.id:
            return existing_assignee
        if user_id == user.id:
            return user
        return None

    monkeypatch.setattr(project_work_items_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_work_items_api, "_get_work_item_or_404", AsyncMock(return_value=fake_work_item))
    monkeypatch.setattr(project_work_items_api.User, "get", AsyncMock(side_effect=fake_get_user))

    response = api_client.patch(
        "/api/v1/projects/project-498/work-items/work-item-8",
        json={"assignee_ids": ["65f0c10e8eced6afed0a8a82", user.id]},
    )

    assert response.status_code == 200
    assert response.json()["assignee_ids"] == ["65f0c10e8eced6afed0a8a82", user.id]
    assert fake_work_item.assignee_ids == ["65f0c10e8eced6afed0a8a82", user.id]
    assert fake_work_item.assignee_names == ["Existing Assignee", user.name]
    fake_work_item.save.assert_awaited_once()


def test_assigned_project_member_can_update_status_without_triggering_reassignment(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a80"
    user.name = "Assigned Member"
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-499",
        name="Community Support",
        description="Support project",
        status="active",
        tags=[],
        banner_image=None,
        lead=None,
        members=[SimpleNamespace(id=user.id)],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )
    fake_work_item = SimpleNamespace(
        id="work-item-9",
        project_id="project-499",
        title="Check inventory",
        description="Review storage inventory",
        item_type="task",
        status=project_work_items_api.WorkItemStatus.PENDING,
        priority="medium",
        assignee_id=user.id,
        assignee_name=user.name,
        created_by_id="65f0c10e8eced6afed0a8a99",
        created_by_name="Lead User",
        updated_by_id="65f0c10e8eced6afed0a8a99",
        updated_by_name="Lead User",
        due_date=None,
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
        save=AsyncMock(),
    )

    monkeypatch.setattr(project_work_items_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_work_items_api, "_get_work_item_or_404", AsyncMock(return_value=fake_work_item))
    resolve_assignees_mock = AsyncMock()
    monkeypatch.setattr(project_work_items_api, "_resolve_assignees", resolve_assignees_mock)

    response = api_client.patch(
        "/api/v1/projects/project-499/work-items/work-item-9",
        json={"status": "active", "assignee_id": user.id},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert fake_work_item.status == project_work_items_api.WorkItemStatus.ACTIVE
    resolve_assignees_mock.assert_not_awaited()
    fake_work_item.save.assert_awaited_once()


def test_project_lead_can_update_project_tags(api_client, monkeypatch):
    lead_user = make_user(role=UserRole.VOLUNTEER)
    lead_user.id = "65f0c10e8eced6afed0a8a31"
    lead_user.email = "lead@example.com"
    lead_user.name = "Lead Volunteer"
    app.dependency_overrides[get_current_user] = lambda: lead_user

    fake_project = SimpleNamespace(
        id="project-459",
        name="Community Support",
        description="Support project",
        status="active",
        tags=["volunteer"],
        banner_image=None,
        lead=SimpleNamespace(
            id=lead_user.id,
            email=lead_user.email,
            name=lead_user.name,
            picture=None,
            role=lead_user.role,
            team=lead_user.team,
        ),
        members=[],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
        update=AsyncMock(),
    )

    async def fake_project_get(*_args, **_kwargs):
        fake_project.tags = ["volunteer", "content"]
        return fake_project

    monkeypatch.setattr(projects_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(projects_api.Project, "get", AsyncMock(side_effect=fake_project_get), raising=False)

    response = api_client.patch(
        "/api/v1/projects/project-459",
        json={"tags": ["volunteer", "content"]},
    )

    assert response.status_code == 200
    assert response.json()["tags"] == ["volunteer", "content"]
    fake_project.update.assert_awaited_once_with({"$set": {"tags": ["volunteer", "content"]}})


def test_project_lead_cannot_update_non_tag_project_fields(api_client, monkeypatch):
    lead_user = make_user(role=UserRole.VOLUNTEER)
    lead_user.id = "65f0c10e8eced6afed0a8a32"
    app.dependency_overrides[get_current_user] = lambda: lead_user

    fake_project = SimpleNamespace(
        id="project-460",
        name="Community Support",
        description="Support project",
        status="active",
        tags=["volunteer"],
        banner_image=None,
        lead=SimpleNamespace(id=lead_user.id),
        members=[],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
        update=AsyncMock(),
    )

    monkeypatch.setattr(projects_api, "_get_project_or_404", AsyncMock(return_value=fake_project))

    response = api_client.patch(
        "/api/v1/projects/project-460",
        json={"description": "Updated copy"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Project leads can only update project tags"
    fake_project.update.assert_not_awaited()


def test_non_member_can_request_project_access(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a67"
    user.name = "Outside Volunteer"
    user.email = "outside@example.com"
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-790",
        name="Food Program",
        description="Food support",
        status="active",
        tags=[],
        banner_image=None,
        lead=None,
        members=[],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )
    created_requests: list[object] = []

    class FakeJoinRequestDoc:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
            self.id = "join-2"
            self.reviewed_at = None
            self.reviewed_by_id = None
            self.reviewed_by_name = None

        async def create(self):
            created_requests.append(self)

    FakeJoinRequestDoc.project_id = FakeField("project_id")
    FakeJoinRequestDoc.user_id = FakeField("user_id")
    FakeJoinRequestDoc.request_type = FakeField("request_type")
    FakeJoinRequestDoc.status = FakeField("status")

    monkeypatch.setattr(project_join_requests_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_join_requests_api, "ProjectJoinRequest", FakeJoinRequestDoc)
    monkeypatch.setattr(FakeJoinRequestDoc, "find_one", AsyncMock(return_value=None), raising=False)

    response = api_client.post(
        "/api/v1/projects/project-790/join-requests",
        json={"message": "I can help on weekends."},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user_name"] == "Outside Volunteer"
    assert body["request_type"] == "access"
    assert body["message"] == "I can help on weekends."
    assert created_requests[0].status == project_join_requests_api.ProjectJoinRequestStatus.PENDING


def test_volunteer_can_request_project_leadership(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a70"
    user.name = "Future Lead"
    user.email = "future-lead@example.com"
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-790b",
        name="Food Program",
        description="Food support",
        status="active",
        tags=[],
        banner_image=None,
        lead=SimpleNamespace(id="lead-123"),
        members=[],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )
    created_requests: list[object] = []

    class FakeJoinRequestDoc:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
            self.id = "lead-request-1"
            self.reviewed_at = None
            self.reviewed_by_id = None
            self.reviewed_by_name = None

        async def create(self):
            created_requests.append(self)

    FakeJoinRequestDoc.project_id = FakeField("project_id")
    FakeJoinRequestDoc.user_id = FakeField("user_id")
    FakeJoinRequestDoc.request_type = FakeField("request_type")
    FakeJoinRequestDoc.status = FakeField("status")

    monkeypatch.setattr(project_join_requests_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_join_requests_api, "ProjectJoinRequest", FakeJoinRequestDoc)
    monkeypatch.setattr(FakeJoinRequestDoc, "find_one", AsyncMock(return_value=None), raising=False)

    response = api_client.post(
        "/api/v1/projects/project-790b/join-requests",
        json={"request_type": "lead", "message": "I can coordinate this project."},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["request_type"] == "lead"
    assert created_requests[0].request_type == project_join_requests_api.ProjectJoinRequestType.LEAD
    assert created_requests[0].message == "I can coordinate this project."


def test_volunteer_can_request_project_deletion(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a74"
    user.name = "Concerned Volunteer"
    user.email = "concerned@example.com"
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-790c",
        name="Food Program",
        description="Food support",
        status="active",
        tags=[],
        banner_image=None,
        lead=None,
        members=[],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )
    created_requests: list[object] = []

    class FakeJoinRequestDoc:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
            self.id = "delete-request-1"
            self.reviewed_at = None
            self.reviewed_by_id = None
            self.reviewed_by_name = None

        async def create(self):
            created_requests.append(self)

    FakeJoinRequestDoc.project_id = FakeField("project_id")
    FakeJoinRequestDoc.user_id = FakeField("user_id")
    FakeJoinRequestDoc.request_type = FakeField("request_type")
    FakeJoinRequestDoc.status = FakeField("status")

    monkeypatch.setattr(project_join_requests_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_join_requests_api, "ProjectJoinRequest", FakeJoinRequestDoc)
    monkeypatch.setattr(FakeJoinRequestDoc, "find_one", AsyncMock(return_value=None), raising=False)

    response = api_client.post(
        "/api/v1/projects/project-790c/join-requests",
        json={"request_type": "delete", "message": "This project is finished and can be removed."},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["request_type"] == "delete"
    assert created_requests[0].request_type == project_join_requests_api.ProjectJoinRequestType.DELETE
    assert created_requests[0].message == "This project is finished and can be removed."


def test_duplicate_pending_join_request_is_rejected(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a68"
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-791",
        name="Food Program",
        description="Food support",
        status="active",
        tags=[],
        banner_image=None,
        lead=None,
        members=[],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )

    monkeypatch.setattr(project_join_requests_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_join_requests_api.ProjectJoinRequest, "project_id", FakeField("project_id"), raising=False)
    monkeypatch.setattr(project_join_requests_api.ProjectJoinRequest, "user_id", FakeField("user_id"), raising=False)
    monkeypatch.setattr(project_join_requests_api.ProjectJoinRequest, "request_type", FakeField("request_type"), raising=False)
    monkeypatch.setattr(project_join_requests_api.ProjectJoinRequest, "status", FakeField("status"), raising=False)
    monkeypatch.setattr(
        project_join_requests_api.ProjectJoinRequest,
        "find_one",
        AsyncMock(return_value=SimpleNamespace(id="join-existing")),
    )

    response = api_client.post(
        "/api/v1/projects/project-791/join-requests",
        json={"message": "Still interested."},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "You already have a pending join request"


def test_non_manager_only_sees_their_own_join_requests(api_client, monkeypatch):
    user = make_user(role=UserRole.VOLUNTEER)
    user.id = "65f0c10e8eced6afed0a8a69"
    user.name = "Outside Volunteer"
    user.email = "outside@example.com"
    app.dependency_overrides[get_current_user] = lambda: user

    fake_project = SimpleNamespace(
        id="project-792",
        name="Food Program",
        description="Food support",
        status="active",
        tags=[],
        banner_image=None,
        lead=None,
        members=[],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )
    visible_request = SimpleNamespace(
        id="join-visible",
        project_id=fake_project.id,
        user_id=user.id,
        user_email=user.email,
        user_name=user.name,
        request_type=project_join_requests_api.ProjectJoinRequestType.ACCESS,
        message="I can help with distribution.",
        status=project_join_requests_api.ProjectJoinRequestStatus.PENDING,
        requested_at=datetime(2026, 3, 21),
        reviewed_at=None,
        reviewed_by_id=None,
        reviewed_by_name=None,
    )

    chain = MagicMock()
    chain.to_list = AsyncMock(return_value=[visible_request])
    find_mock = MagicMock(return_value=chain)

    monkeypatch.setattr(project_join_requests_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_join_requests_api.ProjectJoinRequest, "project_id", FakeField("project_id"), raising=False)
    monkeypatch.setattr(project_join_requests_api.ProjectJoinRequest, "user_id", FakeField("user_id"), raising=False)
    monkeypatch.setattr(project_join_requests_api.ProjectJoinRequest, "request_type", FakeField("request_type"), raising=False)
    monkeypatch.setattr(project_join_requests_api.ProjectJoinRequest, "find", find_mock, raising=False)

    response = api_client.get("/api/v1/projects/project-792/join-requests")

    assert response.status_code == 200
    assert response.json()[0]["id"] == "join-visible"
    find_mock.assert_called_once_with(
        ("project_id", "==", fake_project.id),
        ("user_id", "==", user.id),
    )


def test_join_request_approval_adds_member(api_client, monkeypatch):
    reviewer = make_user(role=UserRole.TEAM_LEAD)
    reviewer.id = "65f0c10e8eced6afed0a8a55"
    reviewer.name = "Team Lead Reviewer"
    app.dependency_overrides[get_current_user] = lambda: reviewer

    requester = make_user(role=UserRole.VOLUNTEER)
    requester.id = "65f0c10e8eced6afed0a8a66"
    requester.name = "Helpful Volunteer"
    requester.email = "helper@example.com"

    fake_project = SimpleNamespace(
        id="project-789",
        name="Food Program",
        description="Food support",
        status="active",
        tags=[],
        banner_image=None,
        lead=None,
        members=[],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
        save=AsyncMock(),
    )
    fake_join_request = SimpleNamespace(
        id="join-1",
        project_id="project-789",
        user_id=requester.id,
        user_email=requester.email,
        user_name=requester.name,
        request_type=project_join_requests_api.ProjectJoinRequestType.ACCESS,
        message="I can help with weekends.",
        status=project_join_requests_api.ProjectJoinRequestStatus.PENDING,
        requested_at=datetime(2026, 3, 20),
        reviewed_at=None,
        reviewed_by_id=None,
        reviewed_by_name=None,
        save=AsyncMock(),
    )

    monkeypatch.setattr(project_join_requests_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_join_requests_api, "_get_join_request_or_404", AsyncMock(return_value=fake_join_request))
    monkeypatch.setattr(project_join_requests_api.User, "get", AsyncMock(return_value=requester))

    response = api_client.patch(
        "/api/v1/projects/project-789/join-requests/join-1",
        json={"status": "approved"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    assert fake_join_request.status == project_join_requests_api.ProjectJoinRequestStatus.APPROVED
    assert fake_project.members == [requester]
    fake_project.save.assert_awaited_once()
    fake_join_request.save.assert_awaited_once()


def test_lead_request_approval_assigns_new_project_lead(api_client, monkeypatch):
    reviewer = make_user(role=UserRole.TEAM_LEAD)
    reviewer.id = "65f0c10e8eced6afed0a8a71"
    reviewer.name = "Team Lead Reviewer"
    app.dependency_overrides[get_current_user] = lambda: reviewer

    previous_lead = make_user(role=UserRole.VOLUNTEER)
    previous_lead.id = "65f0c10e8eced6afed0a8a72"
    previous_lead.name = "Current Lead"
    previous_lead.email = "current-lead@example.com"

    requester = make_user(role=UserRole.VOLUNTEER)
    requester.id = "65f0c10e8eced6afed0a8a73"
    requester.name = "Helpful Volunteer"
    requester.email = "helper@example.com"

    fake_project = SimpleNamespace(
        id="project-789b",
        name="Food Program",
        description="Food support",
        status="active",
        tags=[],
        banner_image=None,
        lead=previous_lead,
        members=[],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
        save=AsyncMock(),
    )
    fake_join_request = SimpleNamespace(
        id="lead-request-2",
        project_id="project-789b",
        user_id=requester.id,
        user_email=requester.email,
        user_name=requester.name,
        request_type=project_join_requests_api.ProjectJoinRequestType.LEAD,
        message="I would like to coordinate this project.",
        status=project_join_requests_api.ProjectJoinRequestStatus.PENDING,
        requested_at=datetime(2026, 3, 20),
        reviewed_at=None,
        reviewed_by_id=None,
        reviewed_by_name=None,
        save=AsyncMock(),
    )

    monkeypatch.setattr(project_join_requests_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_join_requests_api, "_get_join_request_or_404", AsyncMock(return_value=fake_join_request))
    monkeypatch.setattr(project_join_requests_api.User, "get", AsyncMock(return_value=requester))

    response = api_client.patch(
        "/api/v1/projects/project-789b/join-requests/lead-request-2",
        json={"status": "approved"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    assert response.json()["request_type"] == "lead"
    assert fake_project.lead == requester
    assert fake_project.members == [previous_lead, requester]
    fake_project.save.assert_awaited_once()
    fake_join_request.save.assert_awaited_once()


def test_delete_request_approval_deletes_project(api_client, monkeypatch):
    reviewer = make_user(role=UserRole.TEAM_LEAD)
    reviewer.id = "65f0c10e8eced6afed0a8a75"
    reviewer.name = "Team Lead Reviewer"
    app.dependency_overrides[get_current_user] = lambda: reviewer

    requester = make_user(role=UserRole.VOLUNTEER)
    requester.id = "65f0c10e8eced6afed0a8a76"
    requester.name = "Concerned Volunteer"
    requester.email = "concerned@example.com"

    fake_project = SimpleNamespace(
        id="project-789c",
        name="Food Program",
        description="Food support",
        status="completed",
        tags=[],
        banner_image=None,
        lead=None,
        members=[],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )
    fake_join_request = SimpleNamespace(
        id="delete-request-2",
        project_id="project-789c",
        user_id=requester.id,
        user_email=requester.email,
        user_name=requester.name,
        request_type=project_join_requests_api.ProjectJoinRequestType.DELETE,
        message="This project is complete and can be removed.",
        status=project_join_requests_api.ProjectJoinRequestStatus.PENDING,
        requested_at=datetime(2026, 3, 20),
        reviewed_at=None,
        reviewed_by_id=None,
        reviewed_by_name=None,
        save=AsyncMock(),
    )
    delete_mock = AsyncMock()

    monkeypatch.setattr(project_join_requests_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_join_requests_api, "_get_join_request_or_404", AsyncMock(return_value=fake_join_request))
    monkeypatch.setattr(project_join_requests_api, "_delete_project_with_related_records", delete_mock)

    response = api_client.patch(
        "/api/v1/projects/project-789c/join-requests/delete-request-2",
        json={"status": "approved"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    assert response.json()["request_type"] == "delete"
    fake_join_request.save.assert_awaited_once()
    delete_mock.assert_awaited_once_with(fake_project)


def test_project_lead_without_direct_delete_access_cannot_approve_delete_request(api_client, monkeypatch):
    reviewer = make_user(role=UserRole.VOLUNTEER)
    reviewer.id = "65f0c10e8eced6afed0a8a77"
    reviewer.name = "Volunteer Lead"
    app.dependency_overrides[get_current_user] = lambda: reviewer

    requester = make_user(role=UserRole.VOLUNTEER)
    requester.id = "65f0c10e8eced6afed0a8a78"
    requester.name = "Concerned Volunteer"
    requester.email = "concerned@example.com"

    fake_project = SimpleNamespace(
        id="project-789d",
        name="Food Program",
        description="Food support",
        status="completed",
        tags=[],
        banner_image=None,
        lead=SimpleNamespace(id=reviewer.id),
        members=[],
        created_at=datetime(2026, 3, 20),
        updated_at=datetime(2026, 3, 20),
    )
    fake_join_request = SimpleNamespace(
        id="delete-request-3",
        project_id="project-789d",
        user_id=requester.id,
        user_email=requester.email,
        user_name=requester.name,
        request_type=project_join_requests_api.ProjectJoinRequestType.DELETE,
        message="Please remove this project.",
        status=project_join_requests_api.ProjectJoinRequestStatus.PENDING,
        requested_at=datetime(2026, 3, 20),
        reviewed_at=None,
        reviewed_by_id=None,
        reviewed_by_name=None,
        save=AsyncMock(),
    )

    monkeypatch.setattr(project_join_requests_api, "_get_project_or_404", AsyncMock(return_value=fake_project))
    monkeypatch.setattr(project_join_requests_api, "_get_join_request_or_404", AsyncMock(return_value=fake_join_request))

    response = api_client.patch(
        "/api/v1/projects/project-789d/join-requests/delete-request-3",
        json={"status": "approved"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Direct project deletion access required"
    fake_join_request.save.assert_not_awaited()


def test_get_comments_for_submission_rejects_non_owner_without_moderation(api_client, monkeypatch):
    viewer = make_user(role=UserRole.VOLUNTEER)
    viewer.id = "viewer-1"
    app.dependency_overrides[get_current_user] = lambda: viewer

    monkeypatch.setattr(
        comments_api.Submission,
        "get",
        AsyncMock(return_value=SimpleNamespace(user_id="owner-1")),
        raising=False,
    )

    response = api_client.get("/api/v1/comments/submission/507f1f77bcf86cd799439011")

    assert response.status_code == 403
    assert response.json()["detail"] == "Not authorized to view these comments"


def test_create_comment_returns_created_comment_for_submission_owner(api_client, monkeypatch):
    owner = make_user(role=UserRole.VOLUNTEER)
    app.dependency_overrides[get_current_user] = lambda: owner

    monkeypatch.setattr(
        comments_api.Submission,
        "get",
        AsyncMock(return_value=SimpleNamespace(user_id=str(owner.id))),
        raising=False,
    )

    class FakeCommentDoc:
        def __init__(self, **kwargs):
            self.id = "comment-1"
            self.is_deleted = False
            self.is_edited = False
            for key, value in kwargs.items():
                setattr(self, key, value)

        async def insert(self):
            return None

    monkeypatch.setattr(comments_api, "Comment", FakeCommentDoc)

    response = api_client.post(
        "/api/v1/comments/submission/507f1f77bcf86cd799439011",
        json={"content": "Thanks for the update."},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "comment-1"
    assert body["submission_id"] == "507f1f77bcf86cd799439011"
    assert body["user_name"] == owner.name
    assert body["content"] == "Thanks for the update."
    assert body["is_admin"] is False
    assert body["replies"] == []


def test_create_comment_rejects_reply_from_different_submission(api_client, monkeypatch):
    owner = make_user(role=UserRole.VOLUNTEER)
    app.dependency_overrides[get_current_user] = lambda: owner

    monkeypatch.setattr(
        comments_api.Submission,
        "get",
        AsyncMock(return_value=SimpleNamespace(user_id=str(owner.id))),
        raising=False,
    )
    monkeypatch.setattr(
        comments_api,
        "Comment",
        SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(submission_id="other-submission-id"))),
    )

    response = api_client.post(
        "/api/v1/comments/submission/507f1f77bcf86cd799439011",
        json={
            "content": "Following up here.",
            "parent_id": "507f1f77bcf86cd799439012",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Parent comment not found"


def test_team_lead_still_fails_admin_only_dependency():
    team_lead = make_user(role=UserRole.TEAM_LEAD)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(get_current_admin_user(user=team_lead))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Admin access required"


def test_file_upload_rejects_executable_extensions():
    upload = SimpleNamespace(
        filename="unsafe.exe",
        read=AsyncMock(return_value=b"binary"),
        content_type="application/octet-stream",
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(files_api._read_and_validate(upload))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Executable and script files are not allowed. Upload documents, images, spreadsheets, or PDFs instead."


def test_drive_status_reports_local_storage_when_cloud_backends_are_disabled(api_client, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: make_user()
    monkeypatch.setattr(files_api, "get_settings", lambda: SimpleNamespace(private_file_storage_backend="auto"))
    monkeypatch.setattr(files_api, "is_s3_storage_enabled", lambda: False)
    monkeypatch.setattr(files_api, "get_drive_service", lambda: None)

    response = api_client.get("/api/v1/files/drive-status")

    assert response.status_code == 200
    assert response.json() == {
        "configured": False,
        "message": "Cloud storage is not configured for volunteer files. Files are stored on the local server.",
        "storage_type": "local",
        "drive_name": None,
    }


def test_drive_status_prefers_shared_drive_for_private_files_when_configured(api_client, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: make_user()
    monkeypatch.setattr(files_api, "get_settings", lambda: SimpleNamespace(private_file_storage_backend="drive"))
    monkeypatch.setattr(files_api, "is_s3_storage_enabled", lambda: True)
    monkeypatch.setattr(files_api, "get_drive_service", lambda: SimpleNamespace(_shared_drive_id="drive-123"))

    response = api_client.get("/api/v1/files/drive-status")

    assert response.status_code == 200
    assert response.json() == {
        "configured": True,
        "message": "Organization Shared Drive is active for volunteer file uploads.",
        "storage_type": "shared_drive",
        "drive_name": "Volunteer Submissions",
    }


def test_create_upload_url_rejects_when_s3_is_disabled(api_client, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: make_user()
    monkeypatch.setattr(files_api, "get_settings", lambda: SimpleNamespace(private_file_storage_backend="auto"))
    monkeypatch.setattr(files_api, "is_s3_storage_enabled", lambda: False)
    monkeypatch.setattr(files_api, "get_drive_service", lambda: None)

    response = api_client.post(
        "/api/v1/files/upload-url",
        json={
            "filename": "weekly-notes.pdf",
            "content_type": "application/pdf",
            "size": 512,
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Direct uploads are only available when volunteer files use S3 storage."


def test_create_upload_url_allows_storage_when_file_access_is_expired(api_client, monkeypatch):
    user = make_user()
    user.file_access_expires = utc_now() - timedelta(days=1)
    app.dependency_overrides[get_current_user] = lambda: user

    fake_context = SimpleNamespace(
        week_id="2026-W14",
        project_id=None,
        project_name=None,
        submission_id=None,
        work_item_id=None,
        work_item_title=None,
        source_type=None,
    )
    fake_storage = SimpleNamespace(
        create_private_upload=lambda **_kwargs: SimpleNamespace(
            file=SimpleNamespace(
                file_id="file-123",
                filename="weekly-notes.pdf",
                mime_type="application/pdf",
                uploaded_at="2026-04-20T15:00:00+00:00",
                storage_type="s3",
            ),
            upload_url="https://example.com/upload",
            method="PUT",
            headers={"Content-Type": "application/pdf"},
        )
    )

    monkeypatch.setattr(files_api, "get_settings", lambda: SimpleNamespace(private_file_storage_backend="auto"))
    monkeypatch.setattr(files_api, "is_s3_storage_enabled", lambda: True)
    monkeypatch.setattr(files_api, "get_drive_service", lambda: None)
    monkeypatch.setattr(files_api, "_resolve_upload_context", AsyncMock(return_value=fake_context))
    monkeypatch.setattr(files_api, "get_storage_service", lambda: fake_storage)

    response = api_client.post(
        "/api/v1/files/upload-url",
        json={
            "filename": "weekly-notes.pdf",
            "content_type": "application/pdf",
            "size": 512,
            "week_id": "2026-W14",
        },
    )

    assert response.status_code == 200
    assert response.json()["file_id"] == "file-123"
    assert response.json()["upload_url"] == "https://example.com/upload"


def test_finalize_upload_allows_storage_when_file_access_is_expired(api_client, monkeypatch):
    user = make_user()
    user.file_access_expires = utc_now() - timedelta(days=1)
    app.dependency_overrides[get_current_user] = lambda: user

    fake_context = SimpleNamespace(
        week_id="2026-W14",
        project_id=None,
        project_name=None,
        submission_id=None,
        work_item_id=None,
        work_item_title=None,
        source_type=None,
    )

    monkeypatch.setattr(files_api, "_resolve_upload_context", AsyncMock(return_value=fake_context))

    response = api_client.post(
        "/api/v1/files/upload-complete",
        json={
            "file_id": "file-123",
            "filename": "weekly-notes.pdf",
            "mime_type": "application/pdf",
            "uploaded_at": "2026-04-20T15:00:00+00:00",
            "storage_type": "s3",
            "size": 512,
            "week_id": "2026-W14",
        },
    )

    assert response.status_code == 200
    assert response.json()["file_id"] == "file-123"
    assert response.json()["filename"] == "weekly-notes.pdf"


def test_upload_file_rejects_backend_multipart_when_s3_is_enabled(api_client, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: make_user()
    monkeypatch.setattr(files_api, "get_settings", lambda: SimpleNamespace(private_file_storage_backend="auto"))
    monkeypatch.setattr(files_api, "is_s3_storage_enabled", lambda: True)
    monkeypatch.setattr(files_api, "get_drive_service", lambda: None)

    response = api_client.post(
        "/api/v1/files/upload",
        data={"week_id": "2026-W14"},
        files={"file": ("notes.txt", b"hello world", "text/plain")},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "This deployment uses direct-to-S3 uploads. Request an upload URL first."


def test_upload_file_allows_storage_when_file_access_is_expired(api_client, monkeypatch):
    user = make_user()
    user.file_access_expires = utc_now() - timedelta(days=1)
    app.dependency_overrides[get_current_user] = lambda: user

    fake_context = SimpleNamespace(
        week_id="2026-W14",
        project_id=None,
        project_name=None,
        submission_id=None,
        work_item_id=None,
        work_item_title=None,
        source_type=None,
    )
    upload_response = files_api.UploadedFileResponse(
        file_id="file-456",
        filename="notes.txt",
        mime_type="text/plain",
        drive_link="http://testserver/api/v1/files/download/file-456",
        uploaded_at="2026-04-20T15:05:00+00:00",
        storage_type="local",
    )

    monkeypatch.setattr(files_api, "get_settings", lambda: SimpleNamespace(private_file_storage_backend="auto"))
    monkeypatch.setattr(files_api, "is_s3_storage_enabled", lambda: False)
    monkeypatch.setattr(files_api, "get_drive_service", lambda: None)
    monkeypatch.setattr(files_api, "_resolve_upload_context", AsyncMock(return_value=fake_context))
    monkeypatch.setattr(files_api, "_upload_local", AsyncMock(return_value=upload_response))

    response = api_client.post(
        "/api/v1/files/upload",
        data={"week_id": "2026-W14"},
        files={"file": ("notes.txt", b"hello world", "text/plain")},
    )

    assert response.status_code == 200
    assert response.json()["file_id"] == "file-456"
    assert response.json()["storage_type"] == "local"


def test_folder_link_reports_local_storage_when_cloud_backends_are_disabled(api_client, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: make_user()
    monkeypatch.setattr(files_api, "get_settings", lambda: SimpleNamespace(private_file_storage_backend="auto"))
    monkeypatch.setattr(files_api, "is_s3_storage_enabled", lambda: False)
    monkeypatch.setattr(files_api, "get_drive_service", lambda: None)
    monkeypatch.setattr(files_api, "get_week_id", lambda: "2026-W14")

    response = api_client.get("/api/v1/files/folder-link")

    assert response.status_code == 200
    assert response.json() == {
        "storage_type": "local",
        "week_id": "2026-W14",
        "folder_link": None,
        "message": "Volunteer files are stored on the local server.",
    }


def test_folder_link_reports_shared_drive_when_private_backend_forces_drive(api_client, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: make_user()
    monkeypatch.setattr(files_api, "get_settings", lambda: SimpleNamespace(private_file_storage_backend="drive"))
    monkeypatch.setattr(files_api, "is_s3_storage_enabled", lambda: True)
    monkeypatch.setattr(files_api, "get_drive_service", lambda: SimpleNamespace(_shared_drive_id="drive-456"))
    monkeypatch.setattr(files_api, "get_week_id", lambda: "2026-W14")

    response = api_client.get("/api/v1/files/folder-link")

    assert response.status_code == 200
    assert response.json() == {
        "storage_type": "shared_drive",
        "week_id": "2026-W14",
        "folder_name": "Volunteer Submissions",
        "folder_link": "https://drive.google.com/drive/folders/drive-456",
        "message": "Volunteer files are uploaded to the organization's Shared Drive.",
    }


def test_public_image_upload_rejects_non_image_files(api_client):
    app.dependency_overrides[get_current_user] = lambda: make_user(role=UserRole.ADMIN)

    response = api_client.post(
        "/api/v1/files/public/upload",
        files={"file": ("notes.txt", b"hello world", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "File must be an image."


def test_get_email_status_reports_when_smtp_is_missing(monkeypatch):
    monkeypatch.setattr(notifications_api, "is_email_configured", lambda: False)

    response = asyncio.run(
        notifications_api.get_email_status(current_user=make_user(role=UserRole.ADMIN))
    )

    assert response == {
        "configured": False,
        "message": "SMTP not configured. Set SMTP_USERNAME and SMTP_PASSWORD in .env",
    }


def test_send_weekly_reminders_requires_email_configuration(monkeypatch):
    monkeypatch.setattr(notifications_api, "is_email_configured", lambda: False)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            notifications_api.send_weekly_reminders(current_user=make_user(role=UserRole.ADMIN))
        )

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Email is not configured. Set SMTP_USERNAME and SMTP_PASSWORD in .env"
