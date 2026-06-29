"""
Tests for the notification system.

Covers:
- Notification API endpoints (list, mark read, mark all read, preferences)
- Core helper functions (create_notification, all notify_* helpers)
- API trigger wiring (review submission, admin comment, join request, member
  add/remove, work item assign, role change, account status)

Email is always mocked — no real SMTP calls.
"""

import asyncio
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.main import app, db
from app.core import rate_limit as rate_limit_core
from app.core.security import get_current_user, get_current_admin_user, get_current_operations_user
from app.models.notification import NotificationType
from app.models.submission import SubmissionStatus
from app.models.user import UserRole

from fastapi.testclient import TestClient

from app.api import notifications as notifications_api
from app.api import submissions as submissions_api
from app.api import comments as comments_api
from app.api import project_join_requests as project_join_requests_api
from app.api import projects as projects_api
from app.api import project_work_items as project_work_items_api
from app.api import users as users_api
from app.core import notifications as notifications_core

# Valid 24-char hex ObjectId strings required wherever code calls ObjectId(id)
VALID_NOTIF_OID = "507f1f77bcf86cd799439011"
VALID_SUB_OID   = "507f191e810c19729de860ea"
VALID_USER_OID  = "6073f12323c6e66e74932a79"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(
    *,
    uid="user-001",
    email="volunteer@example.com",
    name="Test Volunteer",
    role=UserRole.VOLUNTEER,
    is_active=True,
):
    user = SimpleNamespace(
        id=uid,
        email=email,
        name=name,
        role=role,
        team="Outreach",
        picture=None,
        is_active=is_active,
        invited_only=False,
        total_hours=0.0,
        total_submissions=0,
        submission_streak=0,
        profile_complete=True,
        file_access_expires=None,
        created_at=datetime(2026, 1, 1),
        last_login=datetime(2026, 4, 1),
        updated_at=datetime(2026, 4, 1),
        google_access_token=None,
        notif_submission_reviewed=True,
        notif_admin_comment=True,
        notif_join_request_reviewed=True,
        notif_join_request_received=True,
        notif_project_activity=True,
    )
    user.save = AsyncMock()
    return user


def make_admin(**kwargs):
    return make_user(uid="admin-001", email="admin@example.com", name="Admin User", role=UserRole.ADMIN, **kwargs)


def make_notification(
    *,
    nid="notif-001",
    user_id="user-001",
    notif_type=NotificationType.SUBMISSION_REVIEWED,
    title="Test",
    body="Body text",
    link="/submissions/sub-001",
    read=False,
):
    notif = SimpleNamespace(
        id=nid,
        user_id=user_id,
        type=notif_type,
        title=title,
        body=body,
        link=link,
        read=read,
        created_at=datetime(2026, 4, 28, 12, 0, 0),
    )
    notif.save = AsyncMock()
    return notif


class FakeField:
    def __init__(self, name):
        self.name = name

    def __eq__(self, other):
        return (self.name, "==", other)

    def __neg__(self):
        return ("-", self.name)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client(monkeypatch):
    monkeypatch.setattr(db, "connect", AsyncMock())
    monkeypatch.setattr(db, "disconnect", AsyncMock())
    monkeypatch.setattr(submissions_api, "sync_user_submission_stats", AsyncMock(return_value=False), raising=False)
    monkeypatch.setattr(submissions_api, "sync_user_submission_stats_by_user_id", AsyncMock(return_value=False), raising=False)
    monkeypatch.setattr(users_api, "sync_user_submission_stats", AsyncMock(return_value=False), raising=False)
    rate_limit_core.reset_rate_limit_state()

    with TestClient(app) as client:
        yield client

    rate_limit_core.reset_rate_limit_state()
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Notification API — list
# ---------------------------------------------------------------------------

class TestListNotifications:
    def test_returns_notifications_and_unread_count(self, api_client, monkeypatch):
        user = make_user()
        app.dependency_overrides[get_current_user] = lambda: user

        notif = make_notification()
        query_chain = MagicMock()
        query_chain.sort.return_value = query_chain
        query_chain.limit.return_value = query_chain
        query_chain.to_list = AsyncMock(return_value=[notif])
        count_chain = MagicMock()
        count_chain.count = AsyncMock(return_value=1)

        monkeypatch.setattr(notifications_api.Notification, "user_id", FakeField("user_id"), raising=False)
        monkeypatch.setattr(notifications_api.Notification, "read", FakeField("read"), raising=False)
        monkeypatch.setattr(notifications_api.Notification, "created_at", FakeField("created_at"), raising=False)
        monkeypatch.setattr(
            notifications_api.Notification,
            "find",
            MagicMock(side_effect=[query_chain, count_chain]),
            raising=False,
        )

        response = api_client.get("/api/v1/notifications")

        assert response.status_code == 200
        body = response.json()
        assert body["unread_count"] == 1
        assert len(body["notifications"]) == 1
        assert body["notifications"][0]["id"] == "notif-001"
        assert body["notifications"][0]["read"] is False

    def test_requires_authentication(self, api_client):
        response = api_client.get("/api/v1/notifications")
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Notification API — mark one read
# ---------------------------------------------------------------------------

class TestMarkNotificationRead:
    def test_marks_notification_as_read(self, api_client, monkeypatch):
        user = make_user()
        app.dependency_overrides[get_current_user] = lambda: user

        notif = make_notification(nid=VALID_NOTIF_OID, read=False)
        monkeypatch.setattr(
            notifications_api.Notification,
            "get",
            AsyncMock(return_value=notif),
            raising=False,
        )

        response = api_client.patch(f"/api/v1/notifications/{VALID_NOTIF_OID}/read")

        assert response.status_code == 200
        assert response.json()["read"] is True
        notif.save.assert_awaited_once()

    def test_returns_404_for_other_users_notification(self, api_client, monkeypatch):
        user = make_user(uid="user-999")
        app.dependency_overrides[get_current_user] = lambda: user

        notif = make_notification(user_id="user-001")  # different owner
        monkeypatch.setattr(
            notifications_api.Notification,
            "get",
            AsyncMock(return_value=notif),
            raising=False,
        )

        response = api_client.patch("/api/v1/notifications/notif-001/read")
        assert response.status_code == 404

    def test_returns_404_when_not_found(self, api_client, monkeypatch):
        user = make_user()
        app.dependency_overrides[get_current_user] = lambda: user

        monkeypatch.setattr(
            notifications_api.Notification,
            "get",
            AsyncMock(return_value=None),
            raising=False,
        )

        response = api_client.patch("/api/v1/notifications/notif-bad/read")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Notification API — mark all read
# ---------------------------------------------------------------------------

class TestMarkAllNotificationsRead:
    def test_marks_all_unread_as_read(self, api_client, monkeypatch):
        user = make_user()
        app.dependency_overrides[get_current_user] = lambda: user

        n1 = make_notification(nid="n1", read=False)
        n2 = make_notification(nid="n2", read=False)
        chain = MagicMock()
        chain.to_list = AsyncMock(return_value=[n1, n2])

        monkeypatch.setattr(notifications_api.Notification, "user_id", FakeField("user_id"), raising=False)
        monkeypatch.setattr(notifications_api.Notification, "read", FakeField("read"), raising=False)
        monkeypatch.setattr(notifications_api.Notification, "find", MagicMock(return_value=chain), raising=False)

        response = api_client.post("/api/v1/notifications/read-all")

        assert response.status_code == 204
        assert n1.read is True
        assert n2.read is True
        assert n1.save.await_count == 1
        assert n2.save.await_count == 1


# ---------------------------------------------------------------------------
# Notification API — preferences
# ---------------------------------------------------------------------------

class TestUpdateNotificationPreferences:
    def test_updates_selected_preferences(self, api_client):
        user = make_user()
        app.dependency_overrides[get_current_user] = lambda: user

        response = api_client.patch(
            "/api/v1/notifications/preferences",
            json={"notif_submission_reviewed": False, "notif_project_activity": True},
        )

        assert response.status_code == 200
        assert user.notif_submission_reviewed is False
        assert user.notif_project_activity is True
        # Unchanged fields stay as-is
        assert user.notif_admin_comment is True
        user.save.assert_awaited_once()

    def test_partial_update_does_not_reset_other_prefs(self, api_client):
        user = make_user()
        user.notif_admin_comment = False
        app.dependency_overrides[get_current_user] = lambda: user

        api_client.patch(
            "/api/v1/notifications/preferences",
            json={"notif_submission_reviewed": True},
        )

        assert user.notif_admin_comment is False  # untouched


# ---------------------------------------------------------------------------
# Core helper — create_notification
# ---------------------------------------------------------------------------

class TestCreateNotification:
    @pytest.mark.asyncio
    async def test_inserts_notification_document(self, monkeypatch):
        inserted = {}

        class FakeNotification:
            def __init__(self, **kwargs):
                self.id = None
                self.read = False  # default; create_notification doesn't pass it
                for k, v in kwargs.items():
                    setattr(self, k, v)

            async def insert(self):
                inserted["notif"] = self

        monkeypatch.setattr(notifications_core, "Notification", FakeNotification)

        await notifications_core.create_notification(
            user_id="user-001",
            notif_type=NotificationType.SUBMISSION_REVIEWED,
            title="Reviewed",
            body="Your submission was reviewed.",
            link="/submissions/sub-001",
        )

        assert inserted["notif"].user_id == "user-001"
        assert inserted["notif"].type == NotificationType.SUBMISSION_REVIEWED
        assert inserted["notif"].read is False


# ---------------------------------------------------------------------------
# Core helper — notify_submission_reviewed
# ---------------------------------------------------------------------------

class TestNotifySubmissionReviewed:
    @pytest.mark.asyncio
    async def test_creates_notification_and_sends_email(self, monkeypatch):
        monkeypatch.setattr(notifications_core, "is_email_configured", lambda: True)
        email_calls = []
        async def fake_email(*a):
            email_calls.append(a)
        monkeypatch.setattr(notifications_core, "_send_email_inline", fake_email)

        created = {}
        async def fake_create(**kwargs):
            n = SimpleNamespace(**kwargs, id="n1", read=False, created_at=datetime.now())
            n.save = AsyncMock()
            created["notif"] = n
            return n

        monkeypatch.setattr(notifications_core, "create_notification", fake_create)

        await notifications_core.notify_submission_reviewed(
            submission_user_id="user-001",
            submission_user_name="Volunteer",
            submission_user_email="v@example.com",
            week_id="2026-W17",
            submission_id="sub-001",
            admin_notes="Great work!",
            notif_pref=True,
        )

        assert created["notif"].notif_type == NotificationType.SUBMISSION_REVIEWED
        assert len(email_calls) == 1
        assert email_calls[0][0] == "v@example.com"

    @pytest.mark.asyncio
    async def test_skips_email_when_pref_off(self, monkeypatch):
        monkeypatch.setattr(notifications_core, "is_email_configured", lambda: True)
        email_calls = []
        async def fake_email(*a):
            email_calls.append(a)
        monkeypatch.setattr(notifications_core, "_send_email_inline", fake_email)
        monkeypatch.setattr(notifications_core, "create_notification", AsyncMock(return_value=SimpleNamespace()))

        await notifications_core.notify_submission_reviewed(
            submission_user_id="user-001",
            submission_user_name="Volunteer",
            submission_user_email="v@example.com",
            week_id="2026-W17",
            submission_id="sub-001",
            admin_notes=None,
            notif_pref=False,
        )

        assert len(email_calls) == 0

    @pytest.mark.asyncio
    async def test_skips_email_when_smtp_not_configured(self, monkeypatch):
        monkeypatch.setattr(notifications_core, "is_email_configured", lambda: False)
        email_calls = []
        async def fake_email(*a):
            email_calls.append(a)
        monkeypatch.setattr(notifications_core, "_send_email_inline", fake_email)
        monkeypatch.setattr(notifications_core, "create_notification", AsyncMock(return_value=SimpleNamespace()))

        await notifications_core.notify_submission_reviewed(
            submission_user_id="user-001",
            submission_user_name="Volunteer",
            submission_user_email="v@example.com",
            week_id="2026-W17",
            submission_id="sub-001",
            admin_notes=None,
            notif_pref=True,
        )

        assert len(email_calls) == 0


# ---------------------------------------------------------------------------
# Core helper — notify_admin_comment
# ---------------------------------------------------------------------------

class TestNotifyAdminComment:
    @pytest.mark.asyncio
    async def test_truncates_long_comment_body(self, monkeypatch):
        monkeypatch.setattr(notifications_core, "is_email_configured", lambda: False)
        monkeypatch.setattr(notifications_core, "_send_email_inline", AsyncMock())
        created = {}

        async def fake_create(**kwargs):
            created.update(kwargs)
            return SimpleNamespace()

        monkeypatch.setattr(notifications_core, "create_notification", fake_create)

        long_comment = "x" * 200
        await notifications_core.notify_admin_comment(
            submission_user_id="user-001",
            submission_user_name="Volunteer",
            submission_user_email="v@example.com",
            commenter_name="Admin",
            week_id="2026-W17",
            submission_id="sub-001",
            comment_preview=long_comment,
            notif_pref=False,
        )

        assert len(created["body"]) <= 124  # 120 chars + ellipsis


# ---------------------------------------------------------------------------
# Core helper — notify_member_added / removed
# ---------------------------------------------------------------------------

class TestNotifyMemberAddedRemoved:
    @pytest.mark.asyncio
    async def test_member_added_fires_email(self, monkeypatch):
        monkeypatch.setattr(notifications_core, "is_email_configured", lambda: True)
        email_calls = []
        async def fake_email(*a):
            email_calls.append(a)
        monkeypatch.setattr(notifications_core, "_send_email_inline", fake_email)
        monkeypatch.setattr(notifications_core, "create_notification", AsyncMock(return_value=SimpleNamespace()))

        await notifications_core.notify_member_added(
            user_id="user-001",
            user_name="Volunteer",
            user_email="v@example.com",
            project_name="Project X",
            project_id="proj-001",
            added_by_name="Admin",
            notif_pref=True,
        )

        assert len(email_calls) == 1
        assert "added" in email_calls[0][1].lower()

    @pytest.mark.asyncio
    async def test_member_removed_creates_notification(self, monkeypatch):
        monkeypatch.setattr(notifications_core, "is_email_configured", lambda: False)
        monkeypatch.setattr(notifications_core, "_send_email_inline", AsyncMock())
        created = {}

        async def fake_create(**kwargs):
            created.update(kwargs)
            return SimpleNamespace()

        monkeypatch.setattr(notifications_core, "create_notification", fake_create)

        await notifications_core.notify_member_removed(
            user_id="user-001",
            user_name="Volunteer",
            user_email="v@example.com",
            project_name="Project X",
            removed_by_name="Admin",
            notif_pref=False,
        )

        assert created["notif_type"] == NotificationType.MEMBER_REMOVED


# ---------------------------------------------------------------------------
# Core helper — notify_work_item_assigned
# ---------------------------------------------------------------------------

class TestNotifyWorkItemAssigned:
    @pytest.mark.asyncio
    async def test_fires_email_with_work_item_title(self, monkeypatch):
        monkeypatch.setattr(notifications_core, "is_email_configured", lambda: True)
        email_calls = []
        async def fake_email(*a):
            email_calls.append(a)
        monkeypatch.setattr(notifications_core, "_send_email_inline", fake_email)
        monkeypatch.setattr(notifications_core, "create_notification", AsyncMock(return_value=SimpleNamespace()))
        monkeypatch.setattr(
            notifications_core,
            "get_settings",
            lambda: SimpleNamespace(frontend_url="http://localhost:5173"),
        )

        await notifications_core.notify_work_item_assigned(
            user_id="user-001",
            user_name="Volunteer",
            user_email="v@example.com",
            work_item_title="Design landing page",
            project_name="Project X",
            project_id="proj-001",
            assigned_by_name="Lead",
            notif_pref=True,
        )

        assert len(email_calls) == 1
        assert "Design landing page" in email_calls[0][1]


# ---------------------------------------------------------------------------
# Core helper — notify_role_changed
# ---------------------------------------------------------------------------

class TestNotifyRoleChanged:
    @pytest.mark.asyncio
    async def test_includes_role_labels_in_notification(self, monkeypatch):
        monkeypatch.setattr(notifications_core, "is_email_configured", lambda: False)
        monkeypatch.setattr(notifications_core, "_send_email_inline", AsyncMock())
        created = {}

        async def fake_create(**kwargs):
            created.update(kwargs)
            return SimpleNamespace()

        monkeypatch.setattr(notifications_core, "create_notification", fake_create)

        await notifications_core.notify_role_changed(
            user_id="user-001",
            user_name="Volunteer",
            user_email="v@example.com",
            old_role="volunteer",
            new_role="team_lead",
            notif_pref=False,
        )

        assert created["notif_type"] == NotificationType.ROLE_CHANGED
        assert "Team Lead" in created["title"]


# ---------------------------------------------------------------------------
# Core helper — notify_account_status_changed
# ---------------------------------------------------------------------------

class TestNotifyAccountStatusChanged:
    @pytest.mark.asyncio
    async def test_deactivated_notification_has_no_link(self, monkeypatch):
        monkeypatch.setattr(notifications_core, "is_email_configured", lambda: False)
        monkeypatch.setattr(notifications_core, "_send_email_inline", AsyncMock())
        created = {}

        async def fake_create(**kwargs):
            created.update(kwargs)
            return SimpleNamespace()

        monkeypatch.setattr(notifications_core, "create_notification", fake_create)

        await notifications_core.notify_account_status_changed(
            user_id="user-001",
            user_name="Volunteer",
            user_email="v@example.com",
            activated=False,
            notif_pref=False,
        )

        assert created["notif_type"] == NotificationType.ACCOUNT_STATUS_CHANGED
        assert created["link"] is None

    @pytest.mark.asyncio
    async def test_reactivated_notification_links_to_dashboard(self, monkeypatch):
        monkeypatch.setattr(notifications_core, "is_email_configured", lambda: False)
        monkeypatch.setattr(notifications_core, "_send_email_inline", AsyncMock())
        created = {}

        async def fake_create(**kwargs):
            created.update(kwargs)
            return SimpleNamespace()

        monkeypatch.setattr(notifications_core, "create_notification", fake_create)

        await notifications_core.notify_account_status_changed(
            user_id="user-001",
            user_name="Volunteer",
            user_email="v@example.com",
            activated=True,
            notif_pref=False,
        )

        assert created["link"] == "/dashboard"


# ---------------------------------------------------------------------------
# API trigger — review submission fires notification
# ---------------------------------------------------------------------------

class TestReviewSubmissionTrigger:
    def test_review_queues_notification_for_volunteer(self, api_client, monkeypatch):
        admin = make_admin()
        volunteer = make_user()
        app.dependency_overrides[get_current_user] = lambda: admin

        submission = SimpleNamespace(
            id=VALID_SUB_OID,
            user_id=VALID_USER_OID,
            user_email="volunteer@example.com",
            user_name="Test Volunteer",
            week_id="2026-W17",
            week_start=datetime(2026, 4, 20),
            week_end=datetime(2026, 4, 26),
            status=SubmissionStatus.SUBMITTED,
            past_work=[],
            present_work=[],
            future_work=[],
            blockers=None,
            notes=None,
            mood_rating=None,
            custom_responses={},
            is_late=False,
            total_hours=0.0,
            reported_hours=0.0,
            credited_hours=0.0,
            reviewed_by=None,
            reviewed_at=None,
            admin_notes=None,
            created_at=datetime(2026, 4, 21),
            submitted_at=None,
            updated_at=datetime(2026, 4, 28),
        )
        submission.save = AsyncMock()

        monkeypatch.setattr(submissions_api, "Submission", SimpleNamespace(get=AsyncMock(return_value=submission)), raising=False)
        monkeypatch.setattr(submissions_api, "sync_submission_total_hours", MagicMock(), raising=False)
        monkeypatch.setattr(submissions_api, "utc_now", lambda: datetime(2026, 4, 28), raising=False)
        monkeypatch.setattr(submissions_api, "User", SimpleNamespace(get=AsyncMock(return_value=volunteer)), raising=False)

        notify_mock = AsyncMock()
        with patch("app.core.notifications.notify_submission_reviewed", notify_mock):
            response = api_client.post(
                f"/api/v1/submissions/{VALID_SUB_OID}/review",
                json={"admin_notes": "Looks good"},
            )

        assert response.status_code == 200
        notify_mock.assert_awaited_once()


# ---------------------------------------------------------------------------
# API trigger — admin comment fires notification
# ---------------------------------------------------------------------------

class TestAdminCommentTrigger:
    def test_admin_comment_on_others_submission_queues_notification(self, api_client, monkeypatch):
        admin = make_admin()
        volunteer = make_user(uid="user-001")
        app.dependency_overrides[get_current_user] = lambda: admin

        submission = SimpleNamespace(
            id=VALID_SUB_OID,
            user_id=VALID_USER_OID,
            week_id="2026-W17",
        )

        comment = SimpleNamespace(
            id="comment-001",
            submission_id=VALID_SUB_OID,
            user_id="admin-001",
            user_name="Admin User",
            user_email="admin@example.com",
            is_admin=True,
            is_deleted=False,
            content="Please clarify hours.",
            parent_id=None,
            is_edited=False,
            created_at=datetime(2026, 4, 28),
            updated_at=datetime(2026, 4, 28),
        )
        comment.insert = AsyncMock()

        monkeypatch.setattr(comments_api, "Submission", SimpleNamespace(get=AsyncMock(return_value=submission)), raising=False)
        monkeypatch.setattr(comments_api, "utc_now", lambda: datetime(2026, 4, 28), raising=False)
        monkeypatch.setattr(comments_api, "User", SimpleNamespace(get=AsyncMock(return_value=volunteer)), raising=False)

        # Replace Comment constructor so no Beanie init is required
        monkeypatch.setattr(comments_api, "Comment", lambda **kwargs: comment, raising=False)

        notify_mock = AsyncMock()
        with patch("app.core.notifications.notify_admin_comment", notify_mock):
            response = api_client.post(
                f"/api/v1/comments/submission/{VALID_SUB_OID}",
                json={"content": "Please clarify hours."},
            )

        assert response.status_code == 200
        notify_mock.assert_awaited_once()


# ---------------------------------------------------------------------------
# API trigger — join request reviewed fires notification
# ---------------------------------------------------------------------------

class TestJoinRequestReviewedTrigger:
    def test_approve_queues_notification_for_requester(self, api_client, monkeypatch):
        from app.models.project_join_request import ProjectJoinRequestStatus, ProjectJoinRequestType
        from beanie import PydanticObjectId

        admin = make_admin()
        requester = make_user()
        app.dependency_overrides[get_current_user] = lambda: admin

        project = SimpleNamespace(
            id="proj-001",
            name="Test Project",
            members=[],
            lead=None,
            save=AsyncMock(),
        )

        join_request = SimpleNamespace(
            id="jr-001",
            project_id="proj-001",
            user_id="user-001",
            user_email="volunteer@example.com",
            user_name="Test Volunteer",
            request_type=ProjectJoinRequestType.ACCESS,
            message="I want to join",
            status=ProjectJoinRequestStatus.PENDING,
            requested_at=datetime(2026, 4, 1),
            reviewed_at=None,
            reviewed_by_id=None,
            reviewed_by_name=None,
            save=AsyncMock(),
        )

        monkeypatch.setattr(project_join_requests_api, "_get_project_or_404", AsyncMock(return_value=project))
        monkeypatch.setattr(project_join_requests_api, "_get_join_request_or_404", AsyncMock(return_value=join_request))
        monkeypatch.setattr(project_join_requests_api, "_has_project_management_access", AsyncMock(return_value=True))
        monkeypatch.setattr(project_join_requests_api, "can_manage_project_work", MagicMock(return_value=True))
        monkeypatch.setattr(project_join_requests_api, "is_project_member", MagicMock(return_value=False))
        monkeypatch.setattr(project_join_requests_api, "is_project_lead", MagicMock(return_value=False))
        monkeypatch.setattr(project_join_requests_api, "is_project_team_member", MagicMock(return_value=False))
        monkeypatch.setattr(project_join_requests_api, "User", SimpleNamespace(get=AsyncMock(return_value=requester)), raising=False)
        monkeypatch.setattr(project_join_requests_api, "utc_now", lambda: datetime(2026, 4, 28), raising=False)

        notify_mock = AsyncMock()
        with patch("app.core.notifications.notify_join_request_reviewed", notify_mock):
            response = api_client.patch(
                "/api/v1/projects/proj-001/join-requests/jr-001",
                json={"status": "approved"},
            )

        assert response.status_code == 200
        notify_mock.assert_awaited()


# ---------------------------------------------------------------------------
# API trigger — admin_update_user fires role / status notifications
# ---------------------------------------------------------------------------

class TestUserUpdateTrigger:
    def _setup_admin_update(self, api_client, monkeypatch, target_user):
        from bson import ObjectId
        from app.core.security import get_current_user

        admin = make_admin()
        app.dependency_overrides[get_current_user] = lambda: admin

        access = SimpleNamespace(
            is_admin=True,
            has_any_scope=MagicMock(return_value=True),
        )

        monkeypatch.setattr(users_api, "User", SimpleNamespace(get=AsyncMock(return_value=target_user)), raising=False)
        monkeypatch.setattr(users_api, "get_admin_access_context", AsyncMock(return_value=access), raising=False)
        monkeypatch.setattr(users_api, "build_user_response", AsyncMock(return_value={
            "id": str(target_user.id),
            "email": target_user.email,
            "name": target_user.name,
            "role": target_user.role,
            "team": target_user.team,
            "is_active": target_user.is_active,
            "invited_only": False,
            "total_hours": 0.0,
            "total_submissions": 0,
            "submission_streak": 0,
            "profile_complete": True,
            "file_access_expires": None,
            "admin_access": {"can_access_portal": False, "is_delegated": False, "scopes": []},
            "created_at": target_user.created_at.isoformat(),
            "last_login": None,
            "notif_submission_reviewed": True,
            "notif_admin_comment": True,
            "notif_join_request_reviewed": True,
            "notif_join_request_received": True,
            "notif_project_activity": False,
        }), raising=False)
        monkeypatch.setattr(users_api, "require_admin_scopes", lambda *_: lambda: admin, raising=False)

    def test_role_change_queues_notification(self, api_client, monkeypatch):
        target = make_user(uid=VALID_USER_OID, role=UserRole.VOLUNTEER)
        self._setup_admin_update(api_client, monkeypatch, target)

        notify_mock = AsyncMock()
        with patch("app.core.notifications.notify_role_changed", notify_mock):
            response = api_client.patch(
                f"/api/v1/users/{VALID_USER_OID}",
                json={"role": "team_lead"},
            )

        assert response.status_code == 200
        notify_mock.assert_awaited()

    def test_deactivation_queues_notification(self, api_client, monkeypatch):
        target = make_user(uid=VALID_USER_OID, is_active=True)
        self._setup_admin_update(api_client, monkeypatch, target)

        notify_mock = AsyncMock()
        with patch("app.core.notifications.notify_account_status_changed", notify_mock):
            response = api_client.patch(
                f"/api/v1/users/{VALID_USER_OID}",
                json={"is_active": False},
            )

        assert response.status_code == 200
        notify_mock.assert_awaited()

    def test_name_change_does_not_queue_notification(self, api_client, monkeypatch):
        target = make_user(uid=VALID_USER_OID)
        self._setup_admin_update(api_client, monkeypatch, target)

        with patch("asyncio.create_task", return_value=MagicMock()) as task_mock:
            response = api_client.patch(
                f"/api/v1/users/{VALID_USER_OID}",
                json={"name": "New Name"},
            )

        assert response.status_code == 200
        task_mock.assert_not_called()
