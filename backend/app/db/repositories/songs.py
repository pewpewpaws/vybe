import re
from typing import Any

from backend.app.db.base import BaseRepository


class SongsRepository(BaseRepository):
    table_name = "songs"

    @staticmethod
    def _normalize_spotify_track_id(value: str | None) -> str | None:
        if not value:
            return None
        normalized = value.split(":")[-1].strip()
        return normalized or None

    def get_by_song_id(self, song_id: str) -> dict[str, Any] | None:
        response = self.table.select("*").eq("id", song_id).limit(1).execute()
        return self.first_or_none(response.data)

    def get_by_spotify_track_id(self, spotify_track_id: str) -> dict[str, Any] | None:
        normalized = self._normalize_spotify_track_id(spotify_track_id)
        if not normalized:
            return None
        response = self.table.select("*").eq("provider_song_id", normalized).limit(1).execute()
        return self.first_or_none(response.data)

    def get_by_isrc(self, isrc: str | None) -> dict[str, Any] | None:
        if not isrc:
            return None
        response = self.table.select("*").eq("isrc", isrc.strip().upper()).limit(1).execute()
        return self.first_or_none(response.data)

    def get_by_ids(self, song_ids: list[str]) -> list[dict[str, Any]]:
        if not song_ids:
            return []
        response = self.table.select("*").in_("id", song_ids).execute()
        return response.data or []

    def upsert_song(self, payload: dict[str, Any]) -> dict[str, Any]:
        spotify_track_id = self._normalize_spotify_track_id(payload.get("spotify_track_id"))
        provider_song_id = spotify_track_id or "unknown"
        
        song_payload = {
            "title": payload.get("title") or "Unknown Track",
            "artist_name": payload.get("artist") or "Unknown Artist",
            "album_title": payload.get("album"),
            "provider_song_id": provider_song_id,
            "image_url": payload.get("album_art") or payload.get("image_url"),
            "duration_ms": payload.get("duration_ms"),
            "explicit": bool(payload.get("explicit", False)),
            "isrc": str(payload["isrc"]).strip().upper() if payload.get("isrc") else None,
        }
        song_payload = {key: value for key, value in song_payload.items() if value is not None}
        
        response = self.table.upsert(song_payload, on_conflict="provider_song_id").execute()
        return response.data[0]
