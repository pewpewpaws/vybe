from collections import defaultdict
from typing import Any

from backend.app.db.base import BaseRepository


class MatchCandidatesRepository(BaseRepository):
    table_name = "match_candidates"

    def _hydrate_candidate(self, candidate: dict[str, Any] | None) -> dict[str, Any] | None:
        if not candidate:
            return None
        shared_artists = self.list_shared_artists(candidate["id"])
        return {
            **candidate,
            "shared_artists": shared_artists,
            "vibe_summary": self._build_vibe_summary(shared_artists),
        }

    def _hydrate_candidates(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Batch-hydrate all candidates in 3 total DB queries regardless of list length,
        instead of the previous N×3 query pattern."""
        if not candidates:
            return []

        candidate_ids = [c["id"] for c in candidates]

        # Query 1: all shared-artist rows for all candidates at once.
        shared_rows = (
            self.client.table("match_candidate_shared_artists")
            .select("*")
            .in_("match_candidate_id", candidate_ids)
            .order("weight", desc=True)
            .execute()
            .data or []
        )
        artist_ids = list(dict.fromkeys(row["artist_id"] for row in shared_rows))

        # Query 2: artist metadata.
        artists_by_id: dict[str, Any] = {}
        if artist_ids:
            artists = (
                self.client.table("artists")
                .select("*")
                .in_("id", artist_ids)
                .execute()
                .data or []
            )
            artists_by_id = {a["id"]: a for a in artists}

        # Query 3: Spotify external IDs for those artists.
        spotify_by_artist: dict[str, Any] = {}
        if artist_ids:
            ext_ids = (
                self.client.table("artist_external_ids")
                .select("*")
                .eq("provider", "spotify")
                .in_("artist_id", artist_ids)
                .execute()
                .data or []
            )
            spotify_by_artist = {row["artist_id"]: row for row in ext_ids}

        # Group shared rows by candidate.
        rows_by_candidate: dict[str, list[dict]] = defaultdict(list)
        for row in shared_rows:
            rows_by_candidate[row["match_candidate_id"]].append(row)

        result = []
        for candidate in candidates:
            cid = candidate["id"]
            shared_artists = []
            for row in rows_by_candidate.get(cid, []):
                artist = artists_by_id.get(row["artist_id"])
                if not artist:
                    continue
                spotify = spotify_by_artist.get(artist["id"], {})
                shared_artists.append(
                    {
                        "spotify_artist_id": spotify.get("provider_artist_id") or artist["id"],
                        "name": artist["name"],
                    }
                )
            result.append(
                {
                    **candidate,
                    "shared_artists": shared_artists,
                    "vibe_summary": self._build_vibe_summary(shared_artists),
                }
            )
        return result


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

    def list_shared_artists(self, candidate_id: str) -> list[dict[str, Any]]:
        rows = (
            self.client.table("match_candidate_shared_artists")
            .select("*")
            .eq("match_candidate_id", candidate_id)
            .order("weight", desc=True)
            .execute()
            .data
            or []
        )
        artist_ids = [row["artist_id"] for row in rows]
        if not artist_ids:
            return []

        artists = self.client.table("artists").select("*").in_("id", artist_ids).execute().data or []
        artists_by_id = {artist["id"]: artist for artist in artists}
        external_ids = (
            self.client.table("artist_external_ids")
            .select("*")
            .eq("provider", "spotify")
            .in_("artist_id", artist_ids)
            .execute()
            .data
            or []
        )
        spotify_by_artist = {row["artist_id"]: row for row in external_ids}

        result = []
        for row in rows:
            artist = artists_by_id.get(row["artist_id"])
            if not artist:
                continue
            spotify = spotify_by_artist.get(artist["id"], {})
            result.append(
                {
                    "spotify_artist_id": spotify.get("provider_artist_id") or artist["id"],
                    "name": artist["name"],
                }
            )
        return result

    @staticmethod
    def _build_vibe_summary(shared_artists: list[dict[str, Any]]) -> str:
        names = [artist["name"] for artist in shared_artists[:3] if artist.get("name")]
        return "Shared artists: " + ", ".join(names) if names else ""
