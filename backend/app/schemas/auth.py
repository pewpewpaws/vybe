from datetime import datetime

from pydantic import BaseModel
from pydantic import field_validator

from backend.app.schemas.base import CamelModel
from backend.app.schemas.profile import ProfileResponse


class HealthResponse(CamelModel):
    status: str


class ETLabCredentialLoginRequest(BaseModel):
    username: str
    password: str


class OAuthStartResponse(CamelModel):
    authorization_url: str
    state: str


class SessionPayload(CamelModel):
    id: str
    expires_at: datetime
    created_at: datetime


class AuthSessionResponse(CamelModel):
    authenticated: bool
    session: SessionPayload | None = None
    profile: ProfileResponse | None = None


class LogoutResponse(CamelModel):
    message: str


class ETLabVerificationRequest(BaseModel):
    username: str
    password: str
