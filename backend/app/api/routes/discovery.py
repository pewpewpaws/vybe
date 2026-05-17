from fastapi import APIRouter, Depends, status

from backend.app.auth.dependencies import AuthenticatedUser, require_etlab
from backend.app.schemas.matches import (
    CreateMatchRequestPayload,
    MatchCandidatePreviewResponse,
    MatchCandidateResponse,
    MatchRequestResponse,
)
from backend.app.services.match_request_service import MatchRequestService
from backend.app.services.matching_service import MatchingService

router = APIRouter()
matching_service = MatchingService()
match_request_service = MatchRequestService()


@router.get("/candidates", response_model=list[MatchCandidateResponse])
def list_match_candidates(current_user: AuthenticatedUser = Depends(require_etlab)) -> list[MatchCandidateResponse]:
    return matching_service.get_current_user_match_candidates(current_user.profile["id"])


@router.get("/candidates/{candidate_user_id}", response_model=MatchCandidatePreviewResponse)
def get_candidate_preview(
    candidate_user_id: str,
    current_user: AuthenticatedUser = Depends(require_etlab),
) -> MatchCandidatePreviewResponse:
    return matching_service.get_candidate_preview_data(current_user.profile["id"], candidate_user_id)


@router.post("/requests", response_model=MatchRequestResponse, status_code=status.HTTP_201_CREATED)
def create_match_request(
    payload: CreateMatchRequestPayload,
    current_user: AuthenticatedUser = Depends(require_etlab),
) -> MatchRequestResponse:
    created = match_request_service.create_match_request(current_user.profile["id"], payload.candidate_user_id)
    return match_request_service.serialize_request(created)
