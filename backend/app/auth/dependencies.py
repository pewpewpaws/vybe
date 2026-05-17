from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status

from backend.app.core.settings import get_settings
from backend.app.services.profile_service import ProfileService
from backend.app.services.session_service import SessionService


@dataclass
class AuthenticatedUser:
    session_token: str
    session: dict
    profile: dict


session_service = SessionService()
profile_service = ProfileService()


def get_optional_user(request: Request) -> AuthenticatedUser | None:
    token = session_service.extract_session_token(request)
    if not token:
        return None

    session = session_service.get_active_session(token)
    if not session:
        return None

    profile = profile_service.find_profile_by_id(session["user_id"])
    if not profile:
        return None

    return AuthenticatedUser(session_token=token, session=session, profile=profile)

def get_current_user(request: Request) -> AuthenticatedUser:
    token = session_service.extract_session_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    session = session_service.get_active_session(token)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session is invalid or has expired.",
        )

    profile = profile_service.find_profile_by_id(session["user_id"])
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The user for this session no longer exists.",
        )

    return AuthenticatedUser(session_token=token, session=session, profile=profile)


def require_etlab(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    if not current_user.profile.get("etlab_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ETLab verification is required for this action.",
        )
    return current_user


def get_admin_user(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    settings = get_settings()
    profile = current_user.profile
    is_admin = bool(profile.get("is_admin"))
    allowed_email = profile.get("email") in settings.admin_emails
    allowed_etlab = profile.get("etlab_id") in settings.admin_etlab_ids

    if not any([is_admin, allowed_email, allowed_etlab]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This route is restricted to internal administrators.",
        )

    return current_user
