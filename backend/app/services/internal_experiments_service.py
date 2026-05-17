from backend.app.db.repositories.experimental_connections import ExperimentalConnectionsRepository
from backend.app.db.supabase import get_supabase_client


class InternalExperimentsService:
    def __init__(self) -> None:
        self.repository = ExperimentalConnectionsRepository(get_supabase_client())

    def list_connections(self) -> list[dict]:
        return self.repository.list_all()

    def create_connection(self, owner_user_id: str, payload: dict) -> dict:
        return self.repository.create({"owner_user_id": owner_user_id, **payload})
