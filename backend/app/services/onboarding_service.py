from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException, status

from backend.app.db.repositories.songs import SongsRepository
from backend.app.db.repositories.user_taste_songs import UserTasteSongsRepository
from backend.app.db.supabase import get_supabase_client
from backend.app.schemas.songs import TasteSongResponse
from backend.app.services.profile_service import ProfileService


class OnboardingService:
    MINIMUM_TASTE_SONGS = 5
    IMPORT_PARALLELISM = 10

    def __init__(self) -> None:
        client = get_supabase_client()
        self.song_repository = SongsRepository(client)
        self.taste_repository = UserTasteSongsRepository(client)
        self.profile_service = ProfileService()

    def add_song_to_user_taste_profile(
        self,
        user_id: str,
        song_payload: dict,
        source: str = "manual",
        refresh_vibe_profile: bool = True,
    ) -> TasteSongResponse:
        song = self.song_repository.upsert_song(song_payload)
        relation = self.taste_repository.add_song(
            {
                "user_id": user_id,
                "song_id": song["id"],
                "source": source,
            }
        )
        if refresh_vibe_profile:
            self.refresh_user_vibe_profile(user_id)
        return self._build_taste_song(song, relation)

    def import_songs_to_user_taste_profile(
        self,
        user_id: str,
        song_payloads: list[dict],
        *,
        source: str,
        refresh_vibe_profile: bool = True,
    ) -> int:
        if not song_payloads:
            return 0

        def import_one(song_payload: dict) -> None:
            onboarding_service = OnboardingService()
            onboarding_service.add_song_to_user_taste_profile(
                user_id=user_id,
                song_payload=song_payload,
                source=source,
                refresh_vibe_profile=False,
            )

        max_workers = min(self.IMPORT_PARALLELISM, len(song_payloads)) or 1
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            list(executor.map(import_one, song_payloads))

        if refresh_vibe_profile:
            self.refresh_user_vibe_profile(user_id)

        return len(song_payloads)

    def remove_song_from_user_taste_profile(self, user_id: str, song_id: str) -> None:
        song = self.song_repository.get_by_song_id(song_id)
        if not song:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found in the catalog.")
        self.taste_repository.remove_song(user_id, song["id"])
        self.refresh_user_vibe_profile(user_id)

    def list_user_taste_songs(self, user_id: str) -> list[TasteSongResponse]:
        relations = self.taste_repository.list_for_user(user_id)
        songs = self.song_repository.get_by_ids([item["song_id"] for item in relations])
        songs_by_id = {song["id"]: song for song in songs}
        return [
            self._build_taste_song(songs_by_id[item["song_id"]], item)
            for item in relations
            if item["song_id"] in songs_by_id
        ]


    def get_onboarding_state(self, profile: dict) -> dict:
        latest_profile = self.profile_service.get_profile_by_id(profile["id"])
        taste_songs = self.list_user_taste_songs(profile["id"])
        return {
            "onboarding_completed": latest_profile["onboarding_completed"],
            "spotify_connected": latest_profile["spotify_connected"],
            "taste_song_count": len(taste_songs),
            "vibe_profile": {},
            "taste_songs": taste_songs,
        }

    def mark_onboarding_complete(self, profile: dict) -> dict:
        taste_count = len(self.list_user_taste_songs(profile["id"]))
        minimum_seed_met = profile["spotify_connected"] or taste_count >= self.MINIMUM_TASTE_SONGS
        if not minimum_seed_met:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Add at least 5 songs or connect Spotify before completing onboarding.",
            )

        updated = self.profile_service.mark_onboarding_completed(profile["id"])
        return {
            "onboarding_completed": updated["onboarding_completed"],
            "minimum_seed_met": True,
        }

    def refresh_user_vibe_profile(self, user_id: str) -> None:
        """No-op stub: the taste vector is computed by the ML pipeline (MusicSynthesizer)
        and written directly to user_taste_vectors.  There is nothing to update here;
        the vibe_profile field on the profile dict is derived at read time."""
        return None

    @staticmethod
    def _build_taste_song(song: dict, relation: dict) -> TasteSongResponse:
        return TasteSongResponse(
            id=song["id"],
            spotify_track_id=song.get("spotify_track_id"),
            canonical_source=song.get("canonical_source", "spotify"),
            isrc=song.get("isrc"),
            title=song["title"],
            artist=song["artist"],
            album=song.get("album"),
            album_art=song.get("album_art"),
            explicit=bool(song.get("explicit", False)),
            duration_ms=song.get("duration_ms"),
            source=relation.get("source", "manual"),
            added_at=song["added_at"],
        )
