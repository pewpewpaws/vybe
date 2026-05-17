import secrets
import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import Request, Response

from backend.app.core.settings import get_settings
from backend.app.db.repositories.sessions import SessionsRepository
from backend.app.db.supabase import get_supabase_client


class SessionService:
    SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 365 * 10

    def __init__(self) -> None:
        self.settings = get_settings()
        self.repository = SessionsRepository(get_supabase_client())

    def create_session(self, user_id: str, user_agent: str | None, ip_address: str | None) -> dict:
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=self.SESSION_LIFETIME_SECONDS)
        session_token = secrets.token_urlsafe(48)
        payload = {
            "session_token_hash": self._hash_session_token(session_token),
            "user_id": user_id,
            "user_agent": user_agent,
            "ip_address": ip_address,
            "expires_at": expires_at.isoformat(),
        }
        session = self.repository.create(payload)
        return {**session, "session_token": session_token}

    def get_active_session(self, session_token: str) -> dict | None:
        session = self.repository.get_active_by_token_hash(self._hash_session_token(session_token))
        if not session:
            return None

        expires_at = datetime.fromisoformat(session["expires_at"].replace("Z", "+00:00"))
        if expires_at <= datetime.now(timezone.utc):
            self.repository.revoke_by_token_hash(self._hash_session_token(session_token), datetime.now(timezone.utc).isoformat())
            return None
        return session

    def revoke_session(self, session_token: str) -> None:
        self.repository.revoke_by_token_hash(self._hash_session_token(session_token), datetime.now(timezone.utc).isoformat())

    def write_session_cookie(self, response: Response, session_token: str) -> None:
        response.set_cookie(
            key=self.settings.SESSION_COOKIE_NAME,
            value=session_token,
            max_age=self.SESSION_LIFETIME_SECONDS,
            httponly=True,
            secure=self.settings.session_cookie_secure,
            samesite=self.settings.SESSION_COOKIE_SAMESITE,
            path="/",
        )

    def clear_session_cookie(self, response: Response) -> None:
        response.delete_cookie(
            key=self.settings.SESSION_COOKIE_NAME,
            path="/",
            samesite=self.settings.SESSION_COOKIE_SAMESITE,
        )

    def extract_session_token(self, request: Request) -> str | None:
        cookie_token = request.cookies.get(self.settings.SESSION_COOKIE_NAME)
        if cookie_token:
            return cookie_token

        authorization = request.headers.get("Authorization")
        if not authorization:
            return None

        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            return None
        return token.strip()

    @staticmethod
    def _hash_session_token(session_token: str) -> str:
        return hashlib.sha256(session_token.encode("utf-8")).hexdigest()
