from fastapi import APIRouter, Depends

from backend.app.auth.dependencies import AuthenticatedUser, require_etlab
from backend.app.schemas.matches import AcceptedMatchResponse, MatchVerificationResponse
from backend.app.schemas.song_interactions import SongInteractionResponse, SongReactionRequest, SendSongRequest
from backend.app.services.accepted_match_service import AcceptedMatchService
from backend.app.services.song_interaction_service import SongInteractionService

router = APIRouter()
accepted_match_service = AcceptedMatchService()
song_interaction_service = SongInteractionService()


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


@router.post("/{match_id}/songs", response_model=SongInteractionResponse)
def send_song_to_accepted_match(
    match_id: str,
    payload: SendSongRequest,
    current_user: AuthenticatedUser = Depends(require_etlab),
) -> SongInteractionResponse:
    return song_interaction_service.send_song_to_match(
        sender_id=current_user.profile["id"],
        match_id=match_id,
        song_payload=payload.song.model_dump(by_alias=False, exclude_none=True),
    )


@router.get("/{match_id}/songs/received", response_model=list[SongInteractionResponse])
def list_received_songs(
    match_id: str,
    current_user: AuthenticatedUser = Depends(require_etlab),
) -> list[SongInteractionResponse]:
    return song_interaction_service.list_received_songs(current_user.profile["id"], match_id)


@router.post("/songs/{interaction_id}/reaction", response_model=SongInteractionResponse)
def react_to_song(
    interaction_id: str,
    payload: SongReactionRequest,
    current_user: AuthenticatedUser = Depends(require_etlab),
) -> SongInteractionResponse:
    return song_interaction_service.react_to_song(
        user_id=current_user.profile["id"],
        interaction_id=interaction_id,
        reaction=payload.reaction,
    )
