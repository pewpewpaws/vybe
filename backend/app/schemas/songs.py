from datetime import datetime

from backend.app.schemas.base import CamelModel


class SongRecord(CamelModel):
    id: str | None = None
    spotify_track_id: str | None = None
    canonical_source: str = "spotify"
    isrc: str | None = None
    title: str
    artist: str
    album: str | None = None
    album_art: str | None = None
    explicit: bool = False
    duration_ms: int | None = None


class TasteSongResponse(SongRecord):
    source: str = "manual"
    added_at: datetime
