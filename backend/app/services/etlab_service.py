from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status

from backend.app.core.settings import get_settings


@dataclass
class ETLabIdentity:
    etlab_id: str
    email: str
    name: str
    register_number: str
    raw_payload: dict[str, Any]


class ETLabService:
    WEB_PORTAL_ONLY_MESSAGE = "Kindly Use Web Portal"
    BASE_URL = "https://sctce.etlab.in/androidapp"
    AUTHORIZE_PATH = "/oauth/authorize"
    LOGIN_PATH = "/app/login"
    PROFILE_PATH = "/app/getstudentdetails"
    CALLBACK_EXCHANGE_PATH = "/oauth/token"

    def __init__(self) -> None:
        self.settings = get_settings()

    def build_authorization_url(self, state: str, next_path: str | None = None) -> str:
        query = {
            "response_type": "code",
            "state": state,
            "redirect_uri": self.settings.etlab_redirect_uri,
        }
        if next_path:
            query["next"] = next_path

        return f"{self.BASE_URL}{self.AUTHORIZE_PATH}?{urlencode(query)}"

    def authenticate_with_credentials(self, username: str, password: str) -> ETLabIdentity:
        # ── Hardcoded test account ────────────────────────────────────────────
        if username == "TestUser1" and password == "123123":
            return ETLabIdentity(
                etlab_id="test_TestUser1",
                email="testuser1@campusbeats.test",
                name="Test User 1",
                register_number="TestUser1",
                raw_payload={"test": True},
            )

        if self.settings.etlab_mock_mode:
            return ETLabIdentity(
                etlab_id=f"mock_{username}",
                email=f"{username}@mock.vyne.app",
                name=f"Mock User ({username})",
                register_number=username,
                raw_payload={"mock": True},
            )

        login_url = f"{self.BASE_URL}{self.LOGIN_PATH}"
        profile_url = f"{self.BASE_URL}{self.PROFILE_PATH}"

        try:
            with httpx.Client(
                timeout=self.settings.http_timeout_seconds,
                verify=not self.settings.etlab_skip_ssl_verify,
            ) as client:
                login_response = client.post(
                    login_url,
                    json={"username": username, "password": password},
                    headers={"Content-Type": "application/json"},
                )
                if login_response.status_code >= 400:
                    detail = self._extract_error_message(login_response)
                    print(f"ETLab login response: {detail}")
                    if self._is_web_portal_only_error(login_response.status_code, detail):
                        raise HTTPException(
                            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="ETLab is under maintenance. Please try again later.",
                        )
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

                access_token = self._extract_access_token(login_response.json())
                profile_response = client.get(
                    profile_url,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if profile_response.status_code >= 400:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="ETLab authenticated successfully, but profile retrieval failed.",
                    )

            return self.map_identity(profile_response.json())
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to communicate with ETLab: {type(exc).__name__}",
            )

    def authenticate_with_callback(self, code: str) -> ETLabIdentity:
        callback_url = f"{self.BASE_URL}{self.CALLBACK_EXCHANGE_PATH}"
        payload = {
            "code": code,
            "redirect_uri": self.settings.etlab_redirect_uri,
        }

        try:
            with httpx.Client(
                timeout=self.settings.http_timeout_seconds,
                verify=not self.settings.etlab_skip_ssl_verify,
            ) as client:
                response = client.post(callback_url, json=payload)
                if response.status_code >= 400:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=self._extract_error_message(response),
                    )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to communicate with ETLab: {type(exc).__name__}",
            )

        payload_data = response.json()
        access_token = self._try_extract_access_token(payload_data)
        if access_token:
            return self._fetch_identity_from_token(access_token)
        return self.map_identity(payload_data)

    def map_identity(self, payload: dict[str, Any]) -> ETLabIdentity:
        body = self._unwrap_payload(payload)
        name = body.get("name")
        email = body.get("email")
        register_number = body.get("admission_no") or body.get("register_number") or body.get("registerNumber")
        etlab_id = (
            body.get("etlab_id")
            or body.get("student_id")
            or body.get("user_id")
            or register_number
        )

        if not all([name, email, register_number, etlab_id]):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="ETLab profile payload is missing required identity fields.",
            )

        return ETLabIdentity(
            etlab_id=str(etlab_id),
            email=str(email).lower(),
            name=str(name),
            register_number=str(register_number),
            raw_payload=body,
        )

    def _fetch_identity_from_token(self, access_token: str) -> ETLabIdentity:
        profile_url = f"{self.BASE_URL}{self.PROFILE_PATH}"
        try:
            with httpx.Client(
                timeout=self.settings.http_timeout_seconds,
                verify=not self.settings.etlab_skip_ssl_verify,
            ) as client:
                response = client.get(
                    profile_url,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if response.status_code >= 400:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="ETLab callback token exchange succeeded, but profile retrieval failed.",
                    )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to communicate with ETLab: {type(exc).__name__}",
            )

        return self.map_identity(response.json())

    @staticmethod
    def _unwrap_payload(payload: dict[str, Any]) -> dict[str, Any]:
        for key in ("data", "student", "details", "user", "result", "auth"):
            nested = payload.get(key)
            if isinstance(nested, dict):
                return nested
        return payload

    def _extract_access_token(self, payload: dict[str, Any]) -> str:
        token = self._try_extract_access_token(payload)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="ETLab login response did not include an access token.",
            )
        return token

    def _try_extract_access_token(self, payload: dict[str, Any]) -> str | None:
        unwrapped = self._unwrap_payload(payload)
        return (
            unwrapped.get("access_token")
            or unwrapped.get("token")
            or payload.get("access_token")
            or payload.get("token")
        )

    def _extract_error_message(self, response: httpx.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            return "ETLab authentication failed."

        unwrapped = self._unwrap_payload(payload)
        return str(unwrapped.get("message") or payload.get("message") or "ETLab authentication failed.")

    def _is_web_portal_only_error(self, status_code: int, detail: str) -> bool:
        normalized = " ".join(detail.lower().split())
        return (
            normalized == self.WEB_PORTAL_ONLY_MESSAGE.lower()
            or "kindly use web portal" in normalized
            or ("web portal" in normalized and "kindly" in normalized)
        )
