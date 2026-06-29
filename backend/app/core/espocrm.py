"""EspoCRM REST API client.

The portal uses EspoCRM as the CRM system of record. Browser code should call
our backend routes, and this client keeps EspoCRM credentials server-side.
"""

from typing import Any, Mapping

import httpx

from app.core.config import get_settings


class EspoCRMConfigurationError(RuntimeError):
    """Raised when EspoCRM settings are missing."""


class EspoCRMClientError(RuntimeError):
    """Raised when EspoCRM rejects or fails a request."""


class EspoCRMClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.site_url = settings.espocrm_site_url.strip().rstrip("/")
        self.api_key = settings.espocrm_api_key.strip()
        self.timeout = settings.espocrm_timeout_seconds

    @property
    def is_configured(self) -> bool:
        return bool(self.site_url and self.api_key)

    def _url(self, path: str) -> str:
        normalized_path = path.strip().lstrip("/")
        return f"{self.site_url}/api/v1/{normalized_path}"

    def _headers(self) -> dict[str, str]:
        if not self.is_configured:
            raise EspoCRMConfigurationError("EspoCRM is not configured")
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Api-Key": self.api_key,
        }

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: Mapping[str, Any] | None = None,
        json: Mapping[str, Any] | None = None,
    ) -> Any:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.request(
                    method,
                    self._url(path),
                    params=params,
                    json=json,
                    headers=self._headers(),
                )
            except httpx.HTTPError as exc:
                raise EspoCRMClientError(f"Could not reach EspoCRM: {exc}") from exc

        if response.status_code >= 400:
            detail = response.text
            try:
                parsed = response.json()
                detail = parsed.get("message") or parsed.get("error") or detail
            except ValueError:
                pass
            raise EspoCRMClientError(f"EspoCRM request failed ({response.status_code}): {detail}")

        if response.status_code == 204 or not response.content:
            return {}

        return response.json()

    async def list_records(
        self,
        entity_type: str,
        *,
        select: list[str],
        max_size: int = 50,
        order_by: str = "modifiedAt",
        order: str = "desc",
        offset: int = 0,
    ) -> dict[str, Any]:
        data = await self.request(
            "GET",
            entity_type,
            params={
                "select": ",".join(select),
                "maxSize": max_size,
                "offset": offset,
                "orderBy": order_by,
                "order": order,
            },
        )
        if isinstance(data, dict):
            return data
        return {"list": [], "total": 0}

    async def create_record(self, entity_type: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        data = await self.request("POST", entity_type, json=payload)
        return data if isinstance(data, dict) else {}

    async def get_record(self, entity_type: str, record_id: str) -> dict[str, Any]:
        data = await self.request("GET", f"{entity_type}/{record_id}")
        return data if isinstance(data, dict) else {}

    async def update_record(
        self, entity_type: str, record_id: str, payload: Mapping[str, Any]
    ) -> dict[str, Any]:
        # EspoCRM accepts partial updates via PUT on the record endpoint.
        data = await self.request("PUT", f"{entity_type}/{record_id}", json=payload)
        return data if isinstance(data, dict) else {}

    async def delete_record(self, entity_type: str, record_id: str) -> None:
        await self.request("DELETE", f"{entity_type}/{record_id}")

    async def list_stream(
        self, entity_type: str, record_id: str, *, max_size: int = 30, offset: int = 0
    ) -> dict[str, Any]:
        """Return a record's activity stream (notes, posts, status changes)."""
        data = await self.request(
            "GET",
            f"{entity_type}/{record_id}/stream",
            params={"maxSize": max_size, "offset": offset},
        )
        if isinstance(data, dict):
            return data
        return {"list": [], "total": 0}
