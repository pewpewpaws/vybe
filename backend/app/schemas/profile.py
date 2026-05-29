from datetime import datetime
from typing import Any

from pydantic import Field

from backend.app.schemas.base import CamelModel


class ProfileResponse(CamelModel):
    id: str
    etlab_id: str | None = None
    email: str
    name: str
    academic_year: str | None = None
    etlab_verified: bool
    avatar_url: str | None = None
    spotify_connected: bool
    onboarding_completed: bool = False
    created_at: datetime


class ProfilePreview(CamelModel):
    id: str
    name: str
    avatar_url: str | None = None


class ProfileUpdateRequest(CamelModel):
    name: str | None = None
    avatar_url: str | None = None
