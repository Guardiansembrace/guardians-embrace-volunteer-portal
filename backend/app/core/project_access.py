"""
Shared project access helpers.
"""

from __future__ import annotations

from typing import Iterable, Optional

from app.core.security import has_operations_access
from app.models.project import Project
from app.models.project_work_item import ProjectWorkItem
from app.models.user import User


def normalize_project_tags(tags: Optional[Iterable[str]]) -> list[str]:
    """Normalize project tags for consistent storage and display."""
    seen: set[str] = set()
    normalized: list[str] = []

    for raw_tag in tags or []:
        tag = str(raw_tag).strip()
        if not tag:
            continue

        lower_tag = tag.lower()
        normalized_tag = lower_tag if lower_tag in {"volunteer", "team_lead", "admin"} else tag
        dedupe_key = normalized_tag.lower()

        if dedupe_key in seen:
            continue

        seen.add(dedupe_key)
        normalized.append(normalized_tag)

    return normalized


def _linked_user_id(linked_user: object) -> Optional[str]:
    """Best-effort extraction of an ID from a linked Beanie document."""
    if linked_user is None:
        return None

    linked_id = getattr(linked_user, "id", None)
    if linked_id is not None:
        return str(linked_id)

    linked_ref = getattr(linked_user, "ref", None)
    if linked_ref is not None:
        ref_id = getattr(linked_ref, "id", None)
        if ref_id is not None:
            return str(ref_id)

    return None


def is_project_lead(project: Project, user: User | str | object) -> bool:
    """Return True when the user is the designated project lead."""
    user_id = str(getattr(user, "id", user))
    return _linked_user_id(project.lead) == user_id


def is_project_member(project: Project, user: User | str | object) -> bool:
    """Return True when the user is a listed project member."""
    user_id = str(getattr(user, "id", user))
    return any(_linked_user_id(member) == user_id for member in project.members or [])


def is_project_team_member(project: Project, user: User | str | object) -> bool:
    """Return True when the user is the lead or a listed member of the project."""
    return is_project_lead(project, user) or is_project_member(project, user)


def can_view_project(_project: Project, _user: User) -> bool:
    """All authenticated users can view project boards."""
    return True


def can_manage_project_work(project: Project, user: User, *, operations_override: bool = False) -> bool:
    """Project leads and operations users can manage work across the board."""
    return operations_override or has_operations_access(user) or is_project_lead(project, user)


def can_contribute_to_project(project: Project, user: User, *, operations_override: bool = False) -> bool:
    """Project members, leads, and operations users can create work items."""
    return can_manage_project_work(project, user, operations_override=operations_override) or is_project_member(project, user)


def can_assign_project_work(project: Project, user: User, *, operations_override: bool = False) -> bool:
    """Project contributors can assign work within the project roster."""
    return can_contribute_to_project(project, user, operations_override=operations_override)


def can_claim_project_work_item(project: Project, user: User, *, operations_override: bool = False) -> bool:
    """Project contributors can claim a work item for themselves."""
    return can_contribute_to_project(project, user, operations_override=operations_override)


def can_request_project_access(project: Project, user: User, *, operations_override: bool = False) -> bool:
    """Users can request access when they can view but do not yet belong to the project."""
    return not can_contribute_to_project(project, user, operations_override=operations_override)


def can_edit_project_work_item(
    project: Project,
    work_item: ProjectWorkItem,
    user: User,
    *,
    operations_override: bool = False,
) -> bool:
    """Assigned project members can edit their own work items; managers can edit any."""
    if can_manage_project_work(project, user, operations_override=operations_override):
        return True

    return is_project_team_member(project, user) and str(work_item.assignee_id or "") == str(user.id)


def can_delete_project_work_item(
    project: Project,
    _work_item: ProjectWorkItem,
    user: User,
    *,
    operations_override: bool = False,
) -> bool:
    """Only board managers can delete work items."""
    return can_manage_project_work(project, user, operations_override=operations_override)
