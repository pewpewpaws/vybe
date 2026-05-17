from datetime import datetime, timezone

from fastapi import HTTPException, status

from backend.app.db.repositories.song_interactions import SongInteractionsRepository
from backend.app.db.repositories.songs import SongsRepository
from backend.app.db.supabase import get_supabase_client
from backend.app.schemas.song_interactions import SongInteractionResponse
from backend.app.services.accepted_match_service import AcceptedMatchService


class SongInteractionService:
    def __init__(self) -> None:
        client = get_supabase_client()
        self.interaction_repository = SongInteractionsRepository(client)
        self.song_repository = SongsRepository(client)
        self.accepted_match_service = AcceptedMatchService()

    def send_song_to_match(self, sender_id: str, match_id: str, song_payload: dict) -> SongInteractionResponse:
        match = self.accepted_match_service.require_accepted_match(sender_id, match_id)
        receiver_id = self.accepted_match_service.get_other_user_id(sender_id, match)
        song = self.song_repository.upsert_song(song_payload)
        interaction = self.interaction_repository.create(
            {
                "accepted_match_id": match_id,
                "sender_id": sender_id,
                "receiver_id": receiver_id,
                "song_id": song["id"],
            }
        )
        return self._build_response(interaction, song)

    def list_received_songs(self, user_id: str, match_id: str) -> list[SongInteractionResponse]:
        self.accepted_match_service.require_accepted_match(user_id, match_id)
        interactions = self.interaction_repository.list_received_for_user(match_id, user_id)
        songs = self.song_repository.get_by_ids([item["song_id"] for item in interactions])
        songs_by_id = {song["id"]: song for song in songs}
        return [
            self._build_response(interaction, songs_by_id[interaction["song_id"]])
            for interaction in interactions
            if interaction["song_id"] in songs_by_id
        ]

    def react_to_song(self, user_id: str, interaction_id: str, reaction: str) -> SongInteractionResponse:
        interaction = self.interaction_repository.get_by_id(interaction_id)
        if not interaction:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song interaction not found.")
        if interaction["receiver_id"] != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the receiving accepted match can react to this song.",
            )
        if interaction.get("reaction") is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You have already reacted to this song.",
            )

        updated = self.interaction_repository.update_reaction(
            interaction_id,
            reaction,
            datetime.now(timezone.utc).isoformat(),
        )
        song = self.song_repository.get_by_ids([updated["song_id"]])[0]
        return self._build_response(updated, song)

    @staticmethod
    def _build_response(interaction: dict, song: dict) -> SongInteractionResponse:
        return SongInteractionResponse(
            id=interaction["id"],
            accepted_match_id=interaction["accepted_match_id"],
            sender_id=interaction["sender_id"],
            receiver_id=interaction["receiver_id"],
            song=song,
            reaction=interaction.get("reaction"),
            sent_at=interaction["created_at"],
            reacted_at=interaction.get("reacted_at"),
        )
