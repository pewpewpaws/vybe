import secrets

from fastapi import HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

from backend.app.schemas.auth import AuthSessionResponse, OAuthStartResponse
from backend.app.services.etlab_service import ETLabService
from backend.app.services.google_oauth_service import GoogleOAuthService
from backend.app.services.profile_service import ProfileService
from backend.app.services.session_service import SessionService


class AuthService:
    ETLAB_STATE_COOKIE = "vyne_etlab_state"
    GOOGLE_STATE_COOKIE = "vyne_google_state"
    GOOGLE_NEXT_PATH_COOKIE = "vyne_google_next_path"

    def __init__(self) -> None:
        self.etlab_service = ETLabService()
        self.google_oauth_service = GoogleOAuthService()
        self.profile_service = ProfileService()
        self.session_service = SessionService()

    def start_etlab_login(self, response: Response, next_path: str | None = None) -> OAuthStartResponse:
        state = secrets.token_urlsafe(24)
        response.set_cookie(
            key=self.ETLAB_STATE_COOKIE,
            value=state,
            max_age=600,
            httponly=True,
            secure=self.session_service.settings.session_cookie_secure,
            samesite=self.session_service.settings.SESSION_COOKIE_SAMESITE,
            path="/",
        )
        return OAuthStartResponse(
            authorization_url=self.etlab_service.build_authorization_url(state, next_path=next_path),
            state=state,
        )

    def start_google_login(self, response: Response, next_path: str | None = None) -> OAuthStartResponse:
        state = secrets.token_urlsafe(24)
        response.set_cookie(
            key=self.GOOGLE_STATE_COOKIE,
            value=state,
            max_age=600,
            httponly=True,
            secure=self.session_service.settings.session_cookie_secure,
            samesite=self.session_service.settings.SESSION_COOKIE_SAMESITE,
            path="/",
        )

        normalized_next_path = self._normalize_next_path(next_path)
        response.set_cookie(
            key=self.GOOGLE_NEXT_PATH_COOKIE,
            value=normalized_next_path,
            max_age=600,
            httponly=True,
            secure=self.session_service.settings.session_cookie_secure,
            samesite=self.session_service.settings.SESSION_COOKIE_SAMESITE,
            path="/",
        )

        return OAuthStartResponse(
            authorization_url=self.google_oauth_service.build_authorization_url(state),
            state=state,
        )

    def login_with_credentials(self, username: str, password: str, request: Request, response: Response) -> AuthSessionResponse:
        identity = self.etlab_service.authenticate_with_credentials(username=username, password=password)
        profile = self.profile_service.get_or_create_from_etlab_identity(identity)
        session = self.session_service.create_session(
            user_id=profile["id"],
            user_agent=request.headers.get("user-agent"),
            ip_address=self._extract_ip_address(request),
        )
        self.session_service.write_session_cookie(response, session["session_token"])
        return self._build_session_response(profile, session)

    def handle_etlab_callback(self, code: str, state: str, request: Request, response: Response) -> AuthSessionResponse:
        stored_state = request.cookies.get(self.ETLAB_STATE_COOKIE)
        if not stored_state or stored_state != state:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ETLab callback state.")

        identity = self.etlab_service.authenticate_with_callback(code)
        profile = self.profile_service.get_or_create_from_etlab_identity(identity)

        session = self.session_service.create_session(
            user_id=profile["id"],
            user_agent=request.headers.get("user-agent"),
            ip_address=self._extract_ip_address(request),
        )
        self.session_service.write_session_cookie(response, session["session_token"])
        response.delete_cookie(key=self.ETLAB_STATE_COOKIE, path="/")
        return self._build_session_response(profile, session)

    def handle_google_callback(self, code: str, state: str, request: Request) -> RedirectResponse:
        stored_state = request.cookies.get(self.GOOGLE_STATE_COOKIE)
        if not stored_state or stored_state != state:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Google callback state.")

        identity = self.google_oauth_service.authenticate_with_callback(code)
        profile = self.profile_service.get_or_create_from_google_identity(identity)
        session = self.session_service.create_session(
            user_id=profile["id"],
            user_agent=request.headers.get("user-agent"),
            ip_address=self._extract_ip_address(request),
        )

        next_path = request.cookies.get(self.GOOGLE_NEXT_PATH_COOKIE)
        redirect_response = RedirectResponse(
            url=self._build_frontend_redirect_url(next_path),
            status_code=status.HTTP_302_FOUND,
        )
        self.session_service.write_session_cookie(redirect_response, session["session_token"])
        redirect_response.delete_cookie(key=self.GOOGLE_STATE_COOKIE, path="/")
        redirect_response.delete_cookie(key=self.GOOGLE_NEXT_PATH_COOKIE, path="/")
        return redirect_response

    def get_session_response(self, session: dict, profile: dict) -> AuthSessionResponse:
        return self._build_session_response(profile, session)

    def logout(self, session_token: str, response: Response) -> None:
        self.session_service.revoke_session(session_token)
        self.session_service.clear_session_cookie(response)

    @staticmethod
    def _build_session_response(profile: dict, session: dict) -> AuthSessionResponse:
        return AuthSessionResponse(
            authenticated=True,
            profile=profile,
            session={
                "id": session["id"],
                "expires_at": session["expires_at"],
                "created_at": session["created_at"],
            },
        )

    @staticmethod
    def _extract_ip_address(request: Request) -> str | None:
        if not request.client or not request.client.host:
            return None

        import ipaddress

        try:
            ipaddress.ip_address(request.client.host)
            return request.client.host
        except ValueError:
            return None

    def _build_frontend_redirect_url(self, next_path: str | None) -> str:
        origin = self.session_service.settings.frontend_app_origin.rstrip("/")
        path = self._normalize_next_path(next_path)
        if path == "/":
            return f"{origin}/"
        return f"{origin}{path}"

    @staticmethod
    def _normalize_next_path(next_path: str | None) -> str:
        if not next_path:
            return "/"
        if not next_path.startswith("/") or next_path.startswith("//"):
            return "/"
        return next_path
