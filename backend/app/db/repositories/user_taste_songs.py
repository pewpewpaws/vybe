from typing import Any

from backend.app.db.base import BaseRepository


class UserTasteSongsRepository(BaseRepository):
    table_name = "user_taste_songs"

    def add_song(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.table.upsert(payload, on_conflict="user_id,song_id").execute()
        return response.data[0]

    def remove_song(self, user_id: str, song_id: str) -> None:
        self.table.delete().eq("user_id", user_id).eq("song_id", song_id).execute()

    def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        response = (
            self.table.select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )
        return response.data or []
