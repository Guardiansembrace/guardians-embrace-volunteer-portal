"""
Email normalization and lookup helpers.

The portal historically stored some invite/user emails with mixed casing.
Google login returns lowercase addresses for many accounts, so exact-case
queries can miss those legacy records. These helpers normalize new input and
use a case-insensitive fallback when reading older documents.
"""

from __future__ import annotations

import re
from typing import Any


def normalize_email(email: str | None) -> str:
    """Return a canonical email string for storage and comparison."""
    return (email or "").strip().lower()


def build_case_insensitive_email_query(email: str) -> dict[str, Any]:
    normalized = normalize_email(email)
    return {
        "email": {
            "$regex": f"^{re.escape(normalized)}$",
            "$options": "i",
        }
    }


async def find_document_by_email(model: Any, email: str | None) -> Any:
    """
    Find a document by email using normalized exact lookup first, then a
    case-insensitive fallback for legacy mixed-case records.
    """
    normalized = normalize_email(email)
    if not normalized:
        return None

    exact_match = await model.find_one(model.email == normalized)
    if exact_match is not None:
        return exact_match

    legacy_match = await model.find_one(build_case_insensitive_email_query(normalized))
    if legacy_match is None:
        return None

    # Opportunistically normalize the stored value so future exact lookups
    # succeed without the fallback path.
    if getattr(legacy_match, "email", None) != normalized and hasattr(legacy_match, "save"):
        legacy_match.email = normalized
        try:
            await legacy_match.save()
        except Exception:
            # Keep login/invite flows resilient even if a legacy cleanup save fails.
            pass

    return legacy_match
