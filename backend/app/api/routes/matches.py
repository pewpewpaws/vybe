from fastapi import APIRouter, Depends

from backend.app.auth.dependencies import AuthenticatedUser, require_etlab
from backend.app.schemas.matches import AcceptedMatchResponse, MatchVerificationResponse
from backend.app.services.accepted_match_service import AcceptedMatchService

router = APIRouter()
accepted_match_service = AcceptedMatchService()


@router.get("", response_model=list[AcceptedMatchResponse])
def list_accepted_matches(current_user: AuthenticatedUser = Depends(require_etlab)) -> list[AcceptedMatchResponse]:
    return accepted_match_service.list_accepted_matches(current_user.profile["id"])


@router.get("/verify/{other_user_id}", response_model=MatchVerificationResponse)
def verify_accepted_match(
    other_user_id: str,
    current_user: AuthenticatedUser = Depends(require_etlab),
) -> MatchVerificationResponse:
    return accepted_match_service.verify_users_are_accepted_matches(current_user.profile["id"], other_user_id)


@router.get("/{match_id}", response_model=AcceptedMatchResponse)
def get_accepted_match_profile(
    match_id: str,
    current_user: AuthenticatedUser = Depends(require_etlab),
) -> AcceptedMatchResponse:
    return accepted_match_service.get_accepted_match_profile(current_user.profile["id"], match_id)
