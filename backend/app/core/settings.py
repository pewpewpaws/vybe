from functools import lru_cache
from typing import ClassVar, Literal
from urllib.parse import urlparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    SPOTIFY_SCOPES: ClassVar[tuple[str, ...]] = (
        "user-read-private",
        "playlist-read-private",
        "playlist-read-collaborative",
        "user-top-read",
        "user-library-read",
    )
    GOOGLE_SCOPES: ClassVar[tuple[str, ...]] = (
        "openid",
        "email",
        "profile",
    )
    SESSION_COOKIE_NAME: ClassVar[str] = "vyne_session"
    SESSION_COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"

    app_name: str = "Vyne API"
    app_version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"

    frontend_origin: str = "http://127.0.0.1:5173"

    supabase_url: str = Field(..., alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")

    spotify_client_id: str = Field(..., alias="SPOTIFY_CLIENT_ID")
    spotify_client_secret: str = Field(..., alias="SPOTIFY_CLIENT_SECRET")
    spotify_redirect_uri: str = Field(
        default="http://127.0.0.1:8000/api/v1/spotify/callback",
        alias="SPOTIFY_REDIRECT_URI",
    )
    lastfm_api_key: str | None = Field(default=None, alias="LASTFM_API_KEY")
    youtube_api_key: str | None = Field(default=None, alias="YOUTUBE_API_KEY")

    google_client_id: str | None = Field(default=None, alias="GOOGLE_CLIENT_ID")
    google_client_secret: str | None = Field(default=None, alias="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str = Field(
        default="http://127.0.0.1:8000/api/v1/auth/google/callback",
        alias="GOOGLE_REDIRECT_URI",
    )

    etlab_redirect_uri: str = Field(
        default="http://127.0.0.1:8000/api/v1/auth/etlab/callback",
        alias="ETLAB_REDIRECT_URI",
    )
    etlab_skip_ssl_verify: bool = Field(default=False, alias="ETLAB_SKIP_SSL_VERIFY")
    etlab_mock_mode: bool = Field(default=False, alias="ETLAB_MOCK_MODE")

    session_cookie_secure: bool = Field(default=False, alias="SESSION_COOKIE_SECURE")

    admin_emails_raw: str = Field(default="", alias="ADMIN_EMAILS")
    admin_etlab_ids_raw: str = Field(default="", alias="ADMIN_ETLAB_IDS")

    http_timeout_seconds: float = Field(default=10.0, alias="HTTP_TIMEOUT_SECONDS")

    model_config = SettingsConfigDict(
        env_file=(".env", "../env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def frontend_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origin.split(",") if origin.strip()]

    @property
    def frontend_app_origin(self) -> str:
        origins = self.frontend_origins
        return origins[0] if origins else "http://127.0.0.1:5173"

    @property
    def admin_emails(self) -> set[str]:
        return {email.strip() for email in self.admin_emails_raw.split(",") if email.strip()}

    @property
    def admin_etlab_ids(self) -> set[str]:
        return {value.strip() for value in self.admin_etlab_ids_raw.split(",") if value.strip()}

    @property
    def spotify_scope_list(self) -> list[str]:
        return list(self.SPOTIFY_SCOPES)

    @property
    def google_scope_list(self) -> list[str]:
        return list(self.GOOGLE_SCOPES)

    @staticmethod
    def _validate_redirect_uri(value: str, *, field_name: str) -> str:
        parsed = urlparse(value)
        hostname = (parsed.hostname or "").lower()

        if hostname == "localhost":
            raise ValueError(f"{field_name} must not use http://localhost. Use https or http://127.0.0.1 for local development.")

        is_loopback = hostname in {"127.0.0.1", "::1"}
        if parsed.scheme == "http" and is_loopback:
            return value

        if parsed.scheme != "https":
            raise ValueError(f"{field_name} must use HTTPS unless it targets http://127.0.0.1 or http://[::1].")

        return value

    @property
    def validated_spotify_redirect_uri(self) -> str:
        return self._validate_redirect_uri(self.spotify_redirect_uri, field_name="SPOTIFY_REDIRECT_URI")


@lru_cache
def get_settings() -> Settings:
    return Settings()
