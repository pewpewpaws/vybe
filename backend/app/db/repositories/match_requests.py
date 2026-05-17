from typing import Any

from backend.app.db.base import BaseRepository


class MatchRequestsRepository(BaseRepository):
    table_name = "match_requests"

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.table.insert(payload).execute()
        return response.data[0]

    def get_by_id(self, request_id: str) -> dict[str, Any] | None:
        response = self.table.select("*").eq("id", request_id).limit(1).execute()
        return self.first_or_none(response.data)

    def list_incoming(self, user_id: str) -> list[dict[str, Any]]:
        response = (
            self.table.select("*")
            .eq("recipient_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return response.data or []

    def list_outgoing(self, user_id: str) -> list[dict[str, Any]]:
        response = (
            self.table.select("*")
            .eq("requester_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return response.data or []

    def find_pending_between(self, requester_id: str, recipient_id: str) -> dict[str, Any] | None:
        response = (
            self.table.select("*")
            .eq("requester_id", requester_id)
            .eq("recipient_id", recipient_id)
            .eq("status", "pending")
            .limit(1)
            .execute()
        )
        return self.first_or_none(response.data)

    def update_status(self, request_id: str, status: str, responded_at: str) -> dict[str, Any]:
        response = (
            self.table.update({"status": status, "responded_at": responded_at})
            .eq("id", request_id)
            .execute()
        )
        return response.data[0]
