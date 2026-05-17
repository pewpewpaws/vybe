from fastapi import APIRouter, Depends, Query, Request, Response, status

from backend.app.auth.dependencies import AuthenticatedUser, get_current_user, get_optional_user
from backend.app.schemas.auth import (
    AuthSessionResponse,
    ETLabCredentialLoginRequest,
    LogoutResponse,
    OAuthStartResponse,
)
from backend.app.services.auth_service import AuthService

router = APIRouter()
auth_service = AuthService()


@router.get("/session", response_model=AuthSessionResponse)
def get_current_session(current_user: AuthenticatedUser | None = Depends(get_optional_user)) -> AuthSessionResponse:
    if not current_user:
        return AuthSessionResponse(authenticated=False, profile=None)
    return auth_service.get_session_response(current_user.session, current_user.profile)


@router.get("/etlab/start", response_model=OAuthStartResponse)
def start_etlab_login(response: Response, next_path: str | None = Query(default=None)) -> OAuthStartResponse:
    return auth_service.start_etlab_login(response=response, next_path=next_path)


@router.get("/google/start", response_model=OAuthStartResponse)
def start_google_login(response: Response, next_path: str | None = Query(default=None)) -> OAuthStartResponse:
    return auth_service.start_google_login(response=response, next_path=next_path)


@router.post("/etlab/login", response_model=AuthSessionResponse)
def etlab_login(
    payload: ETLabCredentialLoginRequest,
    request: Request,
    response: Response,
) -> AuthSessionResponse:
    return auth_service.login_with_credentials(
        username=payload.username,
        password=payload.password,
        request=request,
        response=response,
    )


@router.get("/etlab/callback", response_model=AuthSessionResponse)
def etlab_callback(
    code: str,
    state: str,
    request: Request,
    response: Response,
) -> AuthSessionResponse:
    return auth_service.handle_etlab_callback(code=code, state=state, request=request, response=response)


@router.get("/google/callback", status_code=status.HTTP_302_FOUND)
def google_callback(code: str, state: str, request: Request) -> Response:
    return auth_service.handle_google_callback(code=code, state=state, request=request)


@router.post("/logout", response_model=LogoutResponse, status_code=status.HTTP_200_OK)
def logout(response: Response, current_user: AuthenticatedUser = Depends(get_current_user)) -> LogoutResponse:
    auth_service.logout(current_user.session_token, response)
    return LogoutResponse(message="Logged out successfully.")
