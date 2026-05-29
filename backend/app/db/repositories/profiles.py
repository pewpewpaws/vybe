from typing import Any

from backend.app.db.base import BaseRepository


class ProfilesRepository(BaseRepository):
    table_name = "profiles"

    def _build_profile(self, profile: dict[str, Any] | None) -> dict[str, Any] | None:
        if not profile:
            return None

        spotify_account = self.first_or_none(
            self.client.table("music_provider_accounts")
            .select("id")
            .eq("user_id", profile["id"])
            .eq("provider", "spotify")
            .limit(1)
            .execute()
            .data
        )
        return {
            **profile,
            "name": profile.get("display_name"),
            "etlab_verified": bool(profile.get("etlab_verified")),
            "spotify_connected": bool(spotify_account),
        }

    def _build_profiles(self, profiles: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [p for row in profiles if (p := self._build_profile(row))]

    def get_by_id(self, profile_id: str) -> dict[str, Any] | None:
        response = self.table.select("*").eq("id", profile_id).limit(1).execute()
        return self._build_profile(self.first_or_none(response.data))

    def get_by_google_id(self, google_id: str) -> dict[str, Any] | None:
        response = self.table.select("*").eq("google_id", google_id).limit(1).execute()
        return self._build_profile(self.first_or_none(response.data))

    def get_by_etlab_id(self, etlab_id: str) -> dict[str, Any] | None:
        response = self.table.select("*").eq("etlab_id", etlab_id).limit(1).execute()
        return self._build_profile(self.first_or_none(response.data))

    def get_by_email(self, email: str) -> dict[str, Any] | None:
        response = self.table.select("*").eq("email", email).limit(1).execute()
        return self._build_profile(self.first_or_none(response.data))

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.table.insert(self._normalize_profile_payload(payload)).execute()
        return self.get_by_id(response.data[0]["id"])

    def update(self, profile_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_profile_payload(payload)
        if not normalized:
            return self.get_by_id(profile_id)
        response = self.table.update(normalized).eq("id", profile_id).execute()
        return self.get_by_id(response.data[0]["id"])

    def list_by_ids(self, profile_ids: list[str]) -> list[dict[str, Any]]:
        if not profile_ids:
            return []
        response = self.table.select("*").in_("id", profile_ids).execute()
        return self._build_profiles(response.data or [])

    @staticmethod
    def _normalize_profile_payload(payload: dict[str, Any]) -> dict[str, Any]:
        allowed = {
            "email",
            "display_name",
            "avatar_url",
            "google_id",
            "google_payload",
            "etlab_id",
            "etlab_payload",
            "academic_year",
            "etlab_verified",
        }
        normalized = dict(payload)
        if "name" in normalized and "display_name" not in normalized:
            normalized["display_name"] = normalized.pop("name")
        return {key: value for key, value in normalized.items() if key in allowed}
