from typing import Any

from backend.app.db.base import BaseRepository


class MatchCandidatesRepository(BaseRepository):
    table_name = "match_candidates"

    def _hydrate_candidate(self, candidate: dict[str, Any] | None) -> dict[str, Any] | None:
        if not candidate:
            return None
        shared_artists = self.list_shared_artists(candidate["user_id"], candidate["candidate_user_id"])
        return {
            **candidate,
            "shared_artists": shared_artists,
        }

    def _hydrate_candidates(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [c for c_raw in candidates if (c := self._hydrate_candidate(c_raw))]

    def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        response = (
            self.table.select("*")
            .eq("user_id", user_id)
            .order("match_score", desc=True)
            .execute()
        )
        return self._hydrate_candidates(response.data or [])

    def get_candidate(self, user_id: str, candidate_user_id: str) -> dict[str, Any] | None:
        response = (
            self.table.select("*")
            .eq("user_id", user_id)
            .eq("candidate_user_id", candidate_user_id)
            .limit(1)
            .execute()
        )
        return self._hydrate_candidate(self.first_or_none(response.data))

    def get_by_id(self, candidate_id: str) -> dict[str, Any] | None:
        response = self.table.select("*").eq("id", candidate_id).limit(1).execute()
        return self._hydrate_candidate(self.first_or_none(response.data))

    def list_shared_artists(self, user_a_id: str, user_b_id: str) -> list[str]:
        tastes_a = self.client.table("user_taste_songs").select("songs(artist_name)").eq("user_id", user_a_id).execute().data or []
        tastes_b = self.client.table("user_taste_songs").select("songs(artist_name)").eq("user_id", user_b_id).execute().data or []
        
        artists_a = {t.get("songs", {}).get("artist_name") for t in tastes_a if t.get("songs") and t.get("songs").get("artist_name")}
        artists_b = {t.get("songs", {}).get("artist_name") for t in tastes_b if t.get("songs") and t.get("songs").get("artist_name")}
        
        shared = artists_a.intersection(artists_b)
        return sorted(list(shared))
