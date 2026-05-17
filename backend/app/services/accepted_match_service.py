from fastapi import HTTPException, status

from backend.app.db.repositories.accepted_matches import AcceptedMatchesRepository
from backend.app.db.repositories.match_candidates import MatchCandidatesRepository
from backend.app.db.repositories.match_requests import MatchRequestsRepository
from backend.app.db.repositories.profiles import ProfilesRepository
from backend.app.db.repositories.songs import SongsRepository
from backend.app.db.repositories.user_taste_songs import UserTasteSongsRepository
from backend.app.db.supabase import get_supabase_client
from backend.app.schemas.matches import AcceptedMatchResponse, MatchVerificationResponse


class AcceptedMatchService:
    def __init__(self) -> None:
        client = get_supabase_client()
        self.matches_repository = AcceptedMatchesRepository(client)
        self.request_repository = MatchRequestsRepository(client)
        self.candidate_repository = MatchCandidatesRepository(client)
        self.profile_repository = ProfilesRepository(client)
        self.song_repository = SongsRepository(client)
        self.taste_repository = UserTasteSongsRepository(client)

    def list_accepted_matches(self, user_id: str) -> list[AcceptedMatchResponse]:
        matches = self.matches_repository.list_for_user(user_id)
        return [self._build_match_response(user_id, match) for match in matches]

    def get_accepted_match_profile(self, user_id: str, match_id: str) -> AcceptedMatchResponse:
        match = self.matches_repository.get_by_id(match_id)
        if not match or user_id not in {match["user_a_id"], match["user_b_id"]}:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Accepted match not found.")
        return self._build_match_response(user_id, match)

    def verify_users_are_accepted_matches(self, user_id: str, other_user_id: str) -> MatchVerificationResponse:
        match = self.matches_repository.get_between_users(user_id, other_user_id)
        return MatchVerificationResponse(
            other_user_id=other_user_id,
            is_accepted_match=bool(match),
            accepted_match_id=match["id"] if match else None,
        )

    def require_accepted_match(self, user_id: str, match_id: str) -> dict:
        match = self.matches_repository.get_by_id(match_id)
        if not match or user_id not in {match["user_a_id"], match["user_b_id"]}:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Accepted match not found.")
        return match

    def get_other_user_id(self, user_id: str, match: dict) -> str:
        return match["user_b_id"] if match["user_a_id"] == user_id else match["user_a_id"]

    def _build_match_response(self, current_user_id: str, match: dict) -> AcceptedMatchResponse:
        other_user_id = self.get_other_user_id(current_user_id, match)
        matched_user = self.profile_repository.get_by_id(other_user_id)
        if not matched_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matched user profile not found.")

        top_shared_songs = self._get_top_shared_songs(current_user_id, other_user_id)
        candidate = self._get_match_candidate(match)
        return AcceptedMatchResponse(
            id=match["id"],
            matched_user=matched_user,
            match_score=float(candidate["match_score"]) if candidate else 0.0,
            shared_artists=candidate.get("shared_artists") if candidate else [],
            vibe_summary=candidate.get("vibe_summary") if candidate else "",
            top_shared_songs=top_shared_songs,
            accepted_at=match["accepted_at"],
        )

    def _get_top_shared_songs(self, first_user_id: str, second_user_id: str) -> list[dict]:
        first_song_ids = [row["song_id"] for row in self.taste_repository.list_for_user(first_user_id)]
        second_song_ids = [row["song_id"] for row in self.taste_repository.list_for_user(second_user_id)]
        shared_ids = list(dict.fromkeys(song_id for song_id in first_song_ids if song_id in set(second_song_ids)))
        songs = self.song_repository.get_by_ids(shared_ids[:5])
        songs_by_id = {song["id"]: song for song in songs}
        return [songs_by_id[song_id] for song_id in shared_ids[:5] if song_id in songs_by_id]

    def _get_match_candidate(self, match: dict) -> dict | None:
        request = self.request_repository.get_by_id(match["request_id"])
        if request and request.get("match_candidate_id"):
            return self.candidate_repository.get_by_id(request["match_candidate_id"])
        return self.candidate_repository.get_candidate(match["user_a_id"], match["user_b_id"]) or self.candidate_repository.get_candidate(
            match["user_b_id"],
            match["user_a_id"],
        )
