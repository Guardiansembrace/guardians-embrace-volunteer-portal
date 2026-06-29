"""
Shared base class for all Beanie Document models.

Adds a model_validator that coerces null → [] for any bare list[X] field
so that existing MongoDB documents with null list fields (from before a
field was added to the schema) continue to work correctly on save.
"""

import typing

from beanie import Document
from pydantic import model_validator


class BaseDocument(Document):
    @model_validator(mode="before")
    @classmethod
    def _coerce_null_lists(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        for field_name, field_info in cls.model_fields.items():
            annotation = field_info.annotation
            # Only coerce bare list[X] — not Optional[list[X]] where None is valid
            if (
                annotation is not None
                and typing.get_origin(annotation) is list
                and field_name in data
                and data[field_name] is None
            ):
                data[field_name] = []
        return data

    class Settings:
        # Concrete subclasses must override Settings with their collection name.
        # BaseDocument itself is never passed to init_beanie so no collection
        # is created for it.
        pass
