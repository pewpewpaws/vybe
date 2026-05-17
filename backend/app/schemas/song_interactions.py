from datetime import datetime
from typing import Literal

from backend.app.schemas.base import CamelModel
from backend.app.schemas.songs import SongRecord


class SendSongRequest(CamelModel):
    song: SongRecord


class SongInteractionResponse(CamelModel):
    id: str
    accepted_match_id: str
    sender_id: str
    receiver_id: str
    song: SongRecord
    reaction: Literal["like", "dislike"] | None = None
    sent_at: datetime
    reacted_at: datetime | None = None


class SongReactionRequest(CamelModel):
    reaction: Literal["like", "dislike"]
