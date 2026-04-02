import asyncio
from datetime import datetime
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
from app.api import monitoring as monitoring_api
from app.api import files as files_api
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
            "past_work": [],
            "present_work": [],
            "future_work": [],
            "blockers": "",
            "notes": "",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "The submission window for this week is currently closed."


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
    assert response.json()["detail"] == "The submission window for this week is currently closed."


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
        json={"email": "test@example.com", "role": "volunteer"},
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

    revoke_response = api_client.delete("/api/v1/invites/test@example.com")

    assert revoke_response.status_code == 204
    delete_mock.assert_awaited_once()
    assert inserted_users[0].is_active is False
    inserted_users[0].save.assert_awaited_once()


def test_legacy_manage_users_scope_normalizes_to_profile_and_status_access():
    scopes = admin_access_core.normalize_admin_scopes([AdminAccessScope.MANAGE_USERS])

    assert scopes == [
        AdminAccessScope.VIEW_USERS,
        AdminAccessScope.EDIT_USERS,
        AdminAccessScope.MANAGE_USER_STATUS,
    ]


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
    monkeypatch.setattr(project_work_items_api.User, "get", AsyncMock(return_value=user))

    response = api_client.patch(
        "/api/v1/projects/project-498/work-items/work-item-8",
        json={"assignee_id": user.id},
    )

    assert response.status_code == 200
    assert response.json()["assignee_id"] == user.id
    assert fake_work_item.assignee_id == user.id
    assert fake_work_item.assignee_name == user.name
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
    resolve_assignee_mock = AsyncMock()
    monkeypatch.setattr(project_work_items_api, "_resolve_assignee", resolve_assignee_mock)

    response = api_client.patch(
        "/api/v1/projects/project-499/work-items/work-item-9",
        json={"status": "active", "assignee_id": user.id},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert fake_work_item.status == project_work_items_api.WorkItemStatus.ACTIVE
    resolve_assignee_mock.assert_not_awaited()
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
    assert body["message"] == "I can help on weekends."
    assert created_requests[0].status == project_join_requests_api.ProjectJoinRequestStatus.PENDING


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
