from typing import Any

from backend.app.db.base import BaseRepository


class SessionsRepository(BaseRepository):
    table_name = "app_sessions"

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.table.insert(payload).execute()
        return response.data[0]

    def get_active_by_token_hash(self, session_token_hash: str) -> dict[str, Any] | None:
        response = (
            self.table.select("*")
            .eq("session_token_hash", session_token_hash)
            .is_("revoked_at", "null")
            .limit(1)
            .execute()
        )
        return self.first_or_none(response.data)

    def revoke_by_token_hash(self, session_token_hash: str, revoked_at: str) -> None:
        self.table.update({"revoked_at": revoked_at}).eq("session_token_hash", session_token_hash).execute()
