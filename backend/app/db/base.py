from typing import Any


class BaseRepository:
    table_name: str

    def __init__(self, client: Any):
        self.client = client

    @property
    def table(self) -> Any:
        return self.client.table(self.table_name)

    @staticmethod
    def first_or_none(data: list[dict[str, Any]] | None) -> dict[str, Any] | None:
        if not data:
            return None
        return data[0]
