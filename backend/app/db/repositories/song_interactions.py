from typing import Any

from backend.app.db.base import BaseRepository


class SongInteractionsRepository(BaseRepository):
    table_name = "song_interactions"

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.table.insert(payload).execute()
        return response.data[0]

    def get_by_id(self, interaction_id: str) -> dict[str, Any] | None:
        response = self.table.select("*").eq("id", interaction_id).limit(1).execute()
        return self.first_or_none(response.data)

    def list_received_for_user(self, match_id: str, user_id: str) -> list[dict[str, Any]]:
        response = (
            self.table.select("*")
            .eq("accepted_match_id", match_id)
            .eq("receiver_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return response.data or []

    def update_reaction(self, interaction_id: str, reaction: str, reacted_at: str) -> dict[str, Any]:
        response = (
            self.table.update({"reaction": reaction, "reacted_at": reacted_at})
            .eq("id", interaction_id)
            .execute()
        )
        return response.data[0]
