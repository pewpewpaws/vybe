from fastapi import HTTPException, status

from backend.app.db.repositories.match_candidates import MatchCandidatesRepository
from backend.app.db.repositories.match_requests import MatchRequestsRepository
from backend.app.db.repositories.profiles import ProfilesRepository
from backend.app.db.repositories.songs import SongsRepository
from backend.app.db.repositories.user_taste_songs import UserTasteSongsRepository
from backend.app.db.supabase import get_supabase_client
from backend.app.schemas.matches import MatchCandidatePreviewResponse, MatchCandidateResponse


class MatchingService:
    def __init__(self) -> None:
        client = get_supabase_client()
        self.candidate_repository = MatchCandidatesRepository(client)
        self.request_repository = MatchRequestsRepository(client)
        self.profile_repository = ProfilesRepository(client)
        self.song_repository = SongsRepository(client)
        self.taste_repository = UserTasteSongsRepository(client)

    def get_current_user_match_candidates(self, user_id: str) -> list[MatchCandidateResponse]:
        candidates = self.candidate_repository.list_for_user(user_id)
        outgoing = {
            request["recipient_id"]: request["status"]
            for request in self.request_repository.list_outgoing(user_id)
            if request["status"] == "pending"
        }
        profiles = self.profile_repository.list_by_ids([item["candidate_user_id"] for item in candidates])
        profiles_by_id = {profile["id"]: profile for profile in profiles}

        # Pre-fetch current user's taste IDs once to avoid N extra DB queries in the loop.
        my_song_ids: set[str] = {row["song_id"] for row in self.taste_repository.list_for_user(user_id)}

        responses: list[MatchCandidateResponse] = []
        for candidate in candidates:
            profile = profiles_by_id.get(candidate["candidate_user_id"])
            if not profile:
                continue
            responses.append(
                MatchCandidateResponse(
                    user_id=profile["id"],
                    name=profile["name"],
                    avatar_url=profile.get("avatar_url"),
                    match_score=float(candidate["match_score"]),
                    shared_artists=candidate.get("shared_artists") or [],
                    vibe_summary=candidate.get("vibe_summary") or "",
                    request_status=outgoing.get(profile["id"]),
                    top_shared_song=self._get_top_shared_song(my_song_ids, profile["id"]),
                )
            )
        return responses

    def get_candidate_preview_data(self, user_id: str, candidate_user_id: str) -> MatchCandidatePreviewResponse:
        candidate = self.candidate_repository.get_candidate(user_id, candidate_user_id)
        if not candidate:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match candidate not found.")

        profile = self.profile_repository.get_by_id(candidate_user_id)
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate profile not found.")

        existing_request = self.request_repository.find_pending_between(user_id, candidate_user_id)
        my_song_ids: set[str] = {row["song_id"] for row in self.taste_repository.list_for_user(user_id)}
        return MatchCandidatePreviewResponse(
            user_id=profile["id"],
            name=profile["name"],
            avatar_url=profile.get("avatar_url"),
            match_score=float(candidate["match_score"]),
            shared_artists=candidate.get("shared_artists") or [],
            vibe_summary=candidate.get("vibe_summary") or "",
            request_status=existing_request["status"] if existing_request else None,
            top_shared_song=self._get_top_shared_song(my_song_ids, profile["id"]),
            can_request=existing_request is None,
        )

    def _get_top_shared_song(self, first_user_song_ids: set[str], second_user_id: str) -> dict | None:
        """Return the first shared song between the current user (represented by a pre-built
        song-ID set) and the given candidate.  Accepts a set to avoid re-querying the DB
        when called inside a loop over many candidates."""
        second_song_ids = [row["song_id"] for row in self.taste_repository.list_for_user(second_user_id)]
        shared_ids = [sid for sid in second_song_ids if sid in first_user_song_ids]
        if not shared_ids:
            return None

        songs = self.song_repository.get_by_ids(shared_ids[:1])
        songs_by_id = {song["id"]: song for song in songs}
        for song_id in shared_ids[:1]:
            if song_id in songs_by_id:
                return songs_by_id[song_id]
        return None
