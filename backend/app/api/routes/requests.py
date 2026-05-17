from fastapi import APIRouter, Depends

from backend.app.auth.dependencies import AuthenticatedUser, require_etlab
from backend.app.schemas.matches import MatchRequestResponse, RequestActionResponse
from backend.app.services.match_request_service import MatchRequestService

router = APIRouter()
match_request_service = MatchRequestService()


@router.get("/incoming", response_model=list[MatchRequestResponse])
def list_incoming_requests(current_user: AuthenticatedUser = Depends(require_etlab)) -> list[MatchRequestResponse]:
    return match_request_service.list_incoming_requests(current_user.profile["id"])


@router.get("/outgoing", response_model=list[MatchRequestResponse])
def list_outgoing_requests(current_user: AuthenticatedUser = Depends(require_etlab)) -> list[MatchRequestResponse]:
    return match_request_service.list_outgoing_requests(current_user.profile["id"])


@router.post("/{request_id}/accept", response_model=RequestActionResponse)
def accept_request(
    request_id: str,
    current_user: AuthenticatedUser = Depends(require_etlab),
) -> RequestActionResponse:
    return RequestActionResponse(**match_request_service.accept_request(current_user.profile["id"], request_id))


@router.post("/{request_id}/decline", response_model=RequestActionResponse)
def decline_request(
    request_id: str,
    current_user: AuthenticatedUser = Depends(require_etlab),
) -> RequestActionResponse:
    return RequestActionResponse(**match_request_service.decline_request(current_user.profile["id"], request_id))
