from typing import Any

from backend.app.db.base import BaseRepository


class SpotifyAccountsRepository(BaseRepository):
    table_name = "music_provider_accounts"

    def upsert_account(self, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._to_storage_payload(payload)
        response = self.table.upsert(normalized, on_conflict="user_id,provider").execute()
        return self._from_storage_payload(response.data[0])

    def get_by_user_id(self, user_id: str) -> dict[str, Any] | None:
        response = (
            self.table.select("*")
            .eq("user_id", user_id)
            .eq("provider", "spotify")
            .limit(1)
            .execute()
        )
        return self._from_storage_payload(self.first_or_none(response.data))

    @staticmethod
    def _to_storage_payload(payload: dict[str, Any]) -> dict[str, Any]:
        normalized = {
            "id": payload.get("id"),
            "user_id": payload["user_id"],
            "provider": "spotify",
            "provider_user_id": payload.get("spotify_user_id") or payload.get("provider_user_id"),
            "display_name": payload.get("display_name"),
            "access_token_ciphertext": payload.get("access_token") or payload.get("access_token_ciphertext"),
            "refresh_token_ciphertext": payload.get("refresh_token") or payload.get("refresh_token_ciphertext"),
            "scope": payload.get("scope"),
            "token_type": payload.get("token_type"),
            "expires_at": payload.get("expires_at"),
        }
        return {key: value for key, value in normalized.items() if value is not None}

    @staticmethod
    def _from_storage_payload(payload: dict[str, Any] | None) -> dict[str, Any] | None:
        if not payload:
            return None
        return {
            **payload,
            "spotify_user_id": payload.get("provider_user_id"),
            "access_token": payload.get("access_token_ciphertext"),
            "refresh_token": payload.get("refresh_token_ciphertext"),
        }
