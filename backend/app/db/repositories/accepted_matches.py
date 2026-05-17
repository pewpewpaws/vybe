from typing import Any

from backend.app.db.base import BaseRepository


class AcceptedMatchesRepository(BaseRepository):
    table_name = "accepted_matches"

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.table.insert(payload).execute()
        return response.data[0]

    def get_by_id(self, match_id: str) -> dict[str, Any] | None:
        response = self.table.select("*").eq("id", match_id).limit(1).execute()
        return self.first_or_none(response.data)

    def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        # Single query with OR filter — avoids two round-trips and Python-side sorting.
        response = (
            self.table.select("*")
            .or_(f"user_a_id.eq.{user_id},user_b_id.eq.{user_id}")
            .order("accepted_at", desc=True)
            .execute()
        )
        return response.data or []


    def get_between_users(self, first_user_id: str, second_user_id: str) -> dict[str, Any] | None:
        left = (
            self.table.select("*")
            .eq("user_a_id", first_user_id)
            .eq("user_b_id", second_user_id)
            .limit(1)
            .execute()
        )
        existing = self.first_or_none(left.data)
        if existing:
            return existing
        right = (
            self.table.select("*")
            .eq("user_a_id", second_user_id)
            .eq("user_b_id", first_user_id)
            .limit(1)
            .execute()
        )
        return self.first_or_none(right.data)
