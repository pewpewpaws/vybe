from datetime import datetime
from typing import Any

from pydantic import Field

from backend.app.schemas.base import CamelModel


class ProfileResponse(CamelModel):
    id: str
    etlab_id: str | None = None
    email: str
    name: str
    register_number: str | None = None
    etlab_verified: bool
    avatar_url: str | None = None
    vibe_profile: dict[str, Any] = Field(default_factory=dict)
    onboarding_completed: bool
    spotify_connected: bool
    created_at: datetime
    updated_at: datetime


class ProfilePreview(CamelModel):
    id: str
    name: str
    avatar_url: str | None = None


class ProfileUpdateRequest(CamelModel):
    name: str | None = None
    avatar_url: str | None = None
