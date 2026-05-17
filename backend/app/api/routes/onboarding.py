from fastapi import APIRouter, Depends, status

from backend.app.auth.dependencies import AuthenticatedUser, get_current_user
from backend.app.schemas.onboarding import (
    AddTasteSongRequest,
    OnboardingCompleteResponse,
    OnboardingStateResponse,
    PlaylistLinkImportRequest,
    PlaylistLinkImportResponse,
)
from backend.app.schemas.songs import TasteSongResponse
from backend.app.services.onboarding_service import OnboardingService
from backend.app.services.playlist_ingestion_service import PlaylistIngestionService

router = APIRouter()
onboarding_service = OnboardingService()
playlist_ingestion_service = PlaylistIngestionService()


@router.get("/state", response_model=OnboardingStateResponse)
def get_onboarding_state(current_user: AuthenticatedUser = Depends(get_current_user)) -> OnboardingStateResponse:
    return OnboardingStateResponse(**onboarding_service.get_onboarding_state(current_user.profile))


@router.post("/songs", response_model=TasteSongResponse, status_code=status.HTTP_201_CREATED)
def add_taste_song(
    payload: AddTasteSongRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> TasteSongResponse:
    return onboarding_service.add_song_to_user_taste_profile(
        user_id=current_user.profile["id"],
        song_payload=payload.song.model_dump(by_alias=False, exclude_none=True),
        source=payload.source,
    )


@router.post("/playlist-links/import", response_model=PlaylistLinkImportResponse)
def import_playlist_link(
    payload: PlaylistLinkImportRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> PlaylistLinkImportResponse:
    return PlaylistLinkImportResponse(
        **playlist_ingestion_service.import_playlist_link_to_taste_profile(
            user_id=current_user.profile["id"],
            input_text=payload.input_text,
        )
    )


@router.delete("/songs/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_taste_song(
    song_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    onboarding_service.remove_song_from_user_taste_profile(
        user_id=current_user.profile["id"],
        song_id=song_id,
    )


@router.post("/complete", response_model=OnboardingCompleteResponse)
def complete_onboarding(current_user: AuthenticatedUser = Depends(get_current_user)) -> OnboardingCompleteResponse:
    return OnboardingCompleteResponse(**onboarding_service.mark_onboarding_complete(current_user.profile))
