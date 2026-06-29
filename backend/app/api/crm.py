"""CRM bridge endpoints backed by EspoCRM."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field

from app.core.admin_access import AdminAccessScope, require_admin_scopes
from app.core.espocrm import EspoCRMClient, EspoCRMClientError, EspoCRMConfigurationError
from app.models.user import User

router = APIRouter(prefix="/crm", tags=["CRM"])


class CRMStatus(BaseModel):
    configured: bool
    provider: Literal["espocrm"] = "espocrm"
    message: str


class CRMContact(BaseModel):
    id: str
    name: str
    role: str = ""
    organization: str = ""
    email: str = ""
    phone: str = ""
    stage: str = "Active"
    owner: str = ""
    last_touch: str = ""
    next_step: str = ""
    tags: list[str] = Field(default_factory=list)
    score: int = 0


class CRMOrganization(BaseModel):
    id: str
    name: str
    type: str = ""
    email: str = ""
    phone: str = ""
    owner: str = ""
    last_touch: str = ""


class CRMTask(BaseModel):
    id: str
    title: str
    status: str = ""
    due: str = ""
    owner: str = ""
    related_name: str = ""
    done: bool = False


class CRMPipelineItem(BaseModel):
    label: str
    count: int
    color: str


class CRMDashboard(BaseModel):
    status: CRMStatus
    contacts: list[CRMContact] = Field(default_factory=list)
    organizations: list[CRMOrganization] = Field(default_factory=list)
    tasks: list[CRMTask] = Field(default_factory=list)
    pipeline: list[CRMPipelineItem] = Field(default_factory=list)
    totals: dict[str, int] = Field(default_factory=dict)


class CRMContactCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    role: str | None = Field(default=None, max_length=120)


class CRMContactUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    role: str | None = Field(default=None, max_length=120)


class CRMNote(BaseModel):
    id: str
    type: str = ""
    text: str = ""
    created_by: str = ""
    created_at: str = ""


class CRMNoteCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class CRMContactDetail(BaseModel):
    contact: CRMContact
    activity: list[CRMNote] = Field(default_factory=list)


class CRMTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due: str | None = Field(default=None, max_length=40)
    contact_id: str | None = None


class CRMTaskUpdate(BaseModel):
    status: str | None = Field(default=None, max_length=60)
    done: bool | None = None


class CRMOrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)


CONTACT_SELECT = [
    "id",
    "name",
    "firstName",
    "lastName",
    "title",
    "emailAddress",
    "phoneNumber",
    "accountId",
    "accountName",
    "assignedUserName",
    "createdAt",
    "modifiedAt",
]

ACCOUNT_SELECT = [
    "id",
    "name",
    "type",
    "emailAddress",
    "phoneNumber",
    "assignedUserName",
    "modifiedAt",
]

TASK_SELECT = [
    "id",
    "name",
    "status",
    "dateStart",
    "dateEnd",
    "assignedUserName",
    "parentName",
    "parentType",
    "modifiedAt",
]


def _as_list(payload: dict[str, Any]) -> list[dict[str, Any]]:
    records = payload.get("list", [])
    return records if isinstance(records, list) else []


def _as_total(payload: dict[str, Any], records: list[dict[str, Any]]) -> int:
    total = payload.get("total")
    return total if isinstance(total, int) else len(records)


def _display_name(record: dict[str, Any]) -> str:
    name = record.get("name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    parts = [record.get("firstName"), record.get("lastName")]
    return " ".join(part.strip() for part in parts if isinstance(part, str) and part.strip())


def _stage_for_contact(record: dict[str, Any]) -> str:
    if record.get("accountId"):
        return "Active"
    if record.get("assignedUserName"):
        return "Needs follow-up"
    return "New"


def _tag_for_contact(record: dict[str, Any]) -> str:
    role = str(record.get("title") or "").lower()
    if "donor" in role:
        return "Donor"
    if "partner" in role:
        return "Partner"
    if "volunteer" in role:
        return "Volunteer"
    if record.get("accountId"):
        return "Partner"
    return "Contact"


def _map_contact(record: dict[str, Any]) -> CRMContact:
    tag = _tag_for_contact(record)
    return CRMContact(
        id=str(record.get("id", "")),
        name=_display_name(record) or "Unnamed contact",
        role=str(record.get("title") or "Contact"),
        organization=str(record.get("accountName") or ""),
        email=str(record.get("emailAddress") or ""),
        phone=str(record.get("phoneNumber") or ""),
        stage=_stage_for_contact(record),
        owner=str(record.get("assignedUserName") or ""),
        last_touch=str(record.get("modifiedAt") or record.get("createdAt") or ""),
        next_step="Review latest EspoCRM activity",
        tags=[tag],
        score=0,
    )


def _map_organization(record: dict[str, Any]) -> CRMOrganization:
    return CRMOrganization(
        id=str(record.get("id", "")),
        name=str(record.get("name") or "Unnamed organization"),
        type=str(record.get("type") or ""),
        email=str(record.get("emailAddress") or ""),
        phone=str(record.get("phoneNumber") or ""),
        owner=str(record.get("assignedUserName") or ""),
        last_touch=str(record.get("modifiedAt") or ""),
    )


def _map_task(record: dict[str, Any]) -> CRMTask:
    status_value = str(record.get("status") or "")
    return CRMTask(
        id=str(record.get("id", "")),
        title=str(record.get("name") or "Untitled task"),
        status=status_value,
        due=str(record.get("dateEnd") or record.get("dateStart") or ""),
        owner=str(record.get("assignedUserName") or ""),
        related_name=str(record.get("parentName") or ""),
        done=status_value.lower() in {"completed", "done", "finished"},
    )


def _pipeline_from_contacts(contacts: list[CRMContact]) -> list[CRMPipelineItem]:
    colors = {
        "New": "#2563eb",
        "Needs follow-up": "#d97706",
        "Active": "#059669",
        "Nurture": "#7c3aed",
    }
    counts = {label: 0 for label in colors}
    for contact in contacts:
        counts[contact.stage] = counts.get(contact.stage, 0) + 1

    return [
        CRMPipelineItem(label=label, count=count, color=colors.get(label, "#667085"))
        for label, count in counts.items()
    ]


def _configured_status() -> CRMStatus:
    return CRMStatus(
        configured=True,
        message="Connected to EspoCRM.",
    )


def _not_configured_dashboard() -> CRMDashboard:
    return CRMDashboard(
        status=CRMStatus(
            configured=False,
            message="Set ESPOCRM_SITE_URL and ESPOCRM_API_KEY to connect the open-source CRM backend.",
        ),
        totals={"relationships": 0, "follow_ups": 0, "partners": 0},
    )


def _client_or_dashboard() -> EspoCRMClient | None:
    client = EspoCRMClient()
    return client if client.is_configured else None


@router.get("/status", response_model=CRMStatus)
async def get_crm_status(
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_CRM)),
):
    client = EspoCRMClient()
    if not client.is_configured:
        return _not_configured_dashboard().status
    return _configured_status()


@router.get("/dashboard", response_model=CRMDashboard)
async def get_crm_dashboard(
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_CRM)),
):
    client = _client_or_dashboard()
    if client is None:
        return _not_configured_dashboard()

    try:
        contacts_payload = await client.list_records("Contact", select=CONTACT_SELECT, max_size=limit)
        accounts_payload = await client.list_records("Account", select=ACCOUNT_SELECT, max_size=limit)
        tasks_payload = await client.list_records("Task", select=TASK_SELECT, max_size=limit)
    except (EspoCRMConfigurationError, EspoCRMClientError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    contact_records = _as_list(contacts_payload)
    organization_records = _as_list(accounts_payload)
    task_records = _as_list(tasks_payload)

    contacts = [_map_contact(record) for record in contact_records]
    organizations = [_map_organization(record) for record in organization_records]
    tasks = [_map_task(record) for record in task_records]

    return CRMDashboard(
        status=_configured_status(),
        contacts=contacts,
        organizations=organizations,
        tasks=tasks,
        pipeline=_pipeline_from_contacts(contacts),
        totals={
            "relationships": _as_total(contacts_payload, contact_records),
            "follow_ups": len([task for task in tasks if not task.done]),
            "partners": _as_total(accounts_payload, organization_records),
        },
    )


@router.post("/contacts", response_model=CRMContact, status_code=status.HTTP_201_CREATED)
async def create_crm_contact(
    body: CRMContactCreate,
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_CRM)),
):
    client = _client_or_dashboard()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="EspoCRM is not configured.",
        )

    payload = {
        "firstName": body.first_name,
        "lastName": body.last_name,
        "title": body.role or None,
        "emailAddress": str(body.email) if body.email else None,
        "phoneNumber": body.phone,
    }
    clean_payload = {key: value for key, value in payload.items() if value not in (None, "")}

    try:
        record = await client.create_record("Contact", clean_payload)
    except (EspoCRMConfigurationError, EspoCRMClientError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return _map_contact(record)


def _require_client() -> EspoCRMClient:
    client = _client_or_dashboard()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="EspoCRM is not configured.",
        )
    return client


async def _espo_call(awaitable: Any) -> Any:
    """Await an EspoCRM client call, translating client errors to HTTP 502."""
    try:
        return await awaitable
    except (EspoCRMConfigurationError, EspoCRMClientError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


_STREAM_LABELS = {
    "Create": "Record created",
    "Update": "Record updated",
    "Status": "Status changed",
    "CreateRelated": "Related record created",
    "Relate": "Linked to another record",
}


def _map_note(record: dict[str, Any]) -> CRMNote:
    note_type = str(record.get("type") or "")
    text = str(record.get("post") or "")
    if not text:
        text = _STREAM_LABELS.get(note_type, note_type or "Activity")
    return CRMNote(
        id=str(record.get("id", "")),
        type=note_type,
        text=text,
        created_by=str(record.get("createdByName") or ""),
        created_at=str(record.get("createdAt") or ""),
    )


@router.get("/contacts/{contact_id}", response_model=CRMContactDetail)
async def get_crm_contact(
    contact_id: str,
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_CRM)),
):
    client = _require_client()
    record = await _espo_call(client.get_record("Contact", contact_id))
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    stream = await _espo_call(client.list_stream("Contact", contact_id, max_size=30))
    return CRMContactDetail(
        contact=_map_contact(record),
        activity=[_map_note(item) for item in _as_list(stream)],
    )


@router.patch("/contacts/{contact_id}", response_model=CRMContact)
async def update_crm_contact(
    contact_id: str,
    body: CRMContactUpdate,
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_CRM)),
):
    client = _require_client()
    field_map = {
        "firstName": body.first_name,
        "lastName": body.last_name,
        "title": body.role,
        "emailAddress": str(body.email) if body.email else None,
        "phoneNumber": body.phone,
    }
    payload = {key: value for key, value in field_map.items() if value is not None}
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update.")
    record = await _espo_call(client.update_record("Contact", contact_id, payload))
    return _map_contact(record)


@router.post("/contacts/{contact_id}/notes", response_model=CRMNote, status_code=status.HTTP_201_CREATED)
async def add_crm_contact_note(
    contact_id: str,
    body: CRMNoteCreate,
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_CRM)),
):
    client = _require_client()
    payload = {"type": "Post", "post": body.text, "parentType": "Contact", "parentId": contact_id}
    record = await _espo_call(client.create_record("Note", payload))
    return _map_note(record)


@router.post("/tasks", response_model=CRMTask, status_code=status.HTTP_201_CREATED)
async def create_crm_task(
    body: CRMTaskCreate,
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_CRM)),
):
    client = _require_client()
    payload: dict[str, Any] = {"name": body.title, "status": "Not Started"}
    if body.due:
        payload["dateEnd"] = body.due
    if body.contact_id:
        payload["parentType"] = "Contact"
        payload["parentId"] = body.contact_id
    record = await _espo_call(client.create_record("Task", payload))
    return _map_task(record)


@router.patch("/tasks/{task_id}", response_model=CRMTask)
async def update_crm_task(
    task_id: str,
    body: CRMTaskUpdate,
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_CRM)),
):
    client = _require_client()
    if body.status is not None:
        new_status = body.status
    elif body.done is not None:
        new_status = "Completed" if body.done else "Not Started"
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update.")
    record = await _espo_call(client.update_record("Task", task_id, {"status": new_status}))
    return _map_task(record)


@router.post("/organizations", response_model=CRMOrganization, status_code=status.HTTP_201_CREATED)
async def create_crm_organization(
    body: CRMOrganizationCreate,
    current_user: User = Depends(require_admin_scopes(AdminAccessScope.MANAGE_CRM)),
):
    client = _require_client()
    field_map = {
        "name": body.name,
        "type": body.type,
        "emailAddress": str(body.email) if body.email else None,
        "phoneNumber": body.phone,
    }
    payload = {key: value for key, value in field_map.items() if value not in (None, "")}
    record = await _espo_call(client.create_record("Account", payload))
    return _map_organization(record)
