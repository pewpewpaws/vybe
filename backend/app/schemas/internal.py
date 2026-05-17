from datetime import datetime
from typing import Any

from pydantic import Field

from backend.app.schemas.base import CamelModel


class ExperimentalConnectionCreateRequest(CamelModel):
    other_user_id: str
    type: str = "direct"
    status: str = "active"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ExperimentalConnectionResponse(CamelModel):
    id: str
    owner_user_id: str
    other_user_id: str
    type: str
    status: str
    metadata: dict[str, Any]
    created_at: datetime
