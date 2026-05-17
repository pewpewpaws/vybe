from backend.app.schemas.base import CamelModel
from backend.app.schemas.songs import SongRecord, TasteSongResponse


class AddTasteSongRequest(CamelModel):
    song: SongRecord
    source: str = "manual"


class PlaylistLinkImportRequest(CamelModel):
    input_text: str


class PlaylistLinkImportResponse(CamelModel):
    detected_platform: str
    imported: int
    spotify_normalized: int
    source_fallbacks: int


class OnboardingStateResponse(CamelModel):
    onboarding_completed: bool
    spotify_connected: bool
    taste_song_count: int
    vibe_profile: dict[str, float]
    taste_songs: list[TasteSongResponse]


class OnboardingCompleteResponse(CamelModel):
    onboarding_completed: bool
    minimum_seed_met: bool
