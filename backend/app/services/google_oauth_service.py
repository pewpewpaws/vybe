from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status

from backend.app.core.settings import get_settings


@dataclass
class GoogleIdentity:
    sub: str
    email: str
    name: str
    picture: str | None
    email_verified: bool
    raw_payload: dict[str, Any]


class GoogleOAuthService:
    AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    TOKEN_URL = "https://oauth2.googleapis.com/token"
    USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

    def __init__(self) -> None:
        self.settings = get_settings()

    def build_authorization_url(self, state: str) -> str:
        self._ensure_configured()
        query = {
            "client_id": self.settings.google_client_id,
            "redirect_uri": self.settings.google_redirect_uri,
            "response_type": "code",
            "scope": " ".join(self.settings.google_scope_list),
            "state": state,
            "access_type": "offline",
            "include_granted_scopes": "true",
            "prompt": "select_account",
        }
        return f"{self.AUTHORIZATION_URL}?{urlencode(query)}"

    def authenticate_with_callback(self, code: str) -> GoogleIdentity:
        self._ensure_configured()
        token_payload = self._exchange_code_for_tokens(code)
        access_token = token_payload.get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Google token exchange did not return an access token.",
            )
        return self._fetch_userinfo(access_token)

    def _exchange_code_for_tokens(self, code: str) -> dict[str, Any]:
        payload = {
            "code": code,
            "client_id": self.settings.google_client_id,
            "client_secret": self.settings.google_client_secret,
            "redirect_uri": self.settings.google_redirect_uri,
            "grant_type": "authorization_code",
        }
        try:
            with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
                response = client.post(self.TOKEN_URL, data=payload)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to communicate with Google: {type(exc).__name__}",
            )

        if response.status_code >= 400:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=self._extract_error_message(response),
            )
        return response.json()

    def _fetch_userinfo(self, access_token: str) -> GoogleIdentity:
        try:
            with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
                response = client.get(
                    self.USERINFO_URL,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to communicate with Google: {type(exc).__name__}",
            )

        if response.status_code >= 400:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Google user profile retrieval failed.",
            )

        payload = response.json()
        email = payload.get("email")
        sub = payload.get("sub")
        name = payload.get("name")
        email_verified = bool(payload.get("email_verified"))

        if not email or not sub or not name:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Google profile payload is missing required identity fields.",
            )

        if not email_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="A verified Google email address is required.",
            )

        return GoogleIdentity(
            sub=str(sub),
            email=str(email).lower(),
            name=str(name),
            picture=str(payload["picture"]) if payload.get("picture") else None,
            email_verified=email_verified,
            raw_payload=payload,
        )

    def _ensure_configured(self) -> None:
        if self.settings.google_client_id and self.settings.google_client_secret:
            return
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured.",
        )

    @staticmethod
    def _extract_error_message(response: httpx.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            return "Google authentication failed."

        error = payload.get("error")
        description = payload.get("error_description")
        if error and description:
            return f"{error}: {description}"
        return str(description or error or "Google authentication failed.")
