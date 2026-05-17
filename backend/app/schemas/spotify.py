from datetime import datetime

from backend.app.schemas.base import CamelModel


class SpotifyConnectStartResponse(CamelModel):
    authorization_url: str
    state: str


class SpotifyAccountResponse(CamelModel):
    spotify_user_id: str
    display_name: str | None = None
    scope: str | None = None
    token_type: str | None = None
    expires_at: datetime | None = None


class SpotifyConnectResponse(CamelModel):
    connected: bool
    profile: SpotifyAccountResponse
