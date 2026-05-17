from typing import Any

from backend.app.db.base import BaseRepository


class ExperimentalConnectionsRepository(BaseRepository):
    table_name = "internal_experimental_connections"

    def list_all(self) -> list[dict[str, Any]]:
        response = self.table.select("*").order("created_at", desc=True).execute()
        return response.data or []

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.table.insert(payload).execute()
        return response.data[0]
