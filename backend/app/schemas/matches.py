from datetime import datetime

from backend.app.schemas.base import CamelModel
from backend.app.schemas.profile import ProfilePreview, ProfileResponse
from backend.app.schemas.songs import SongRecord


class ArtistSummary(CamelModel):
    spotify_artist_id: str
    name: str


class MatchCandidateResponse(CamelModel):
    user_id: str
    name: str
    avatar_url: str | None = None
    match_score: float
    shared_artists: list[ArtistSummary]
    vibe_summary: str
    request_status: str | None = None
    top_shared_song: SongRecord | None = None


class MatchCandidatePreviewResponse(MatchCandidateResponse):
    can_request: bool


class CreateMatchRequestPayload(CamelModel):
    candidate_user_id: str


class MatchRequestResponse(CamelModel):
    id: str
    requester: ProfilePreview
    recipient: ProfilePreview
    match_score: float
    shared_artists: list[ArtistSummary]
    vibe_summary: str
    status: str
    created_at: datetime
    responded_at: datetime | None = None


class RequestActionResponse(CamelModel):
    id: str
    status: str
    accepted_match_id: str | None = None


class AcceptedMatchResponse(CamelModel):
    id: str
    matched_user: ProfileResponse
    match_score: float
    shared_artists: list[ArtistSummary]
    vibe_summary: str
    top_shared_songs: list[SongRecord]
    accepted_at: datetime


class MatchVerificationResponse(CamelModel):
    other_user_id: str
    is_accepted_match: bool
    accepted_match_id: str | None = None
