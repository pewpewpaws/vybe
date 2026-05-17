import hashlib
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

    @staticmethod
    def _fallback_canonical_key(payload: dict[str, Any]) -> str:
        parts = [
            str(payload.get("title") or "").strip().lower(),
            str(payload.get("artist") or "").strip().lower(),
            str(payload.get("album") or "").strip().lower(),
            str(payload.get("duration_ms") or "").strip(),
        ]
        digest = hashlib.sha1("::".join(parts).encode("utf-8")).hexdigest()
        return f"source:{digest}"

    @staticmethod
    def _slug(value: str | None) -> str:
        normalized = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
        return normalized or "unknown"

    @staticmethod
    def _split_artist_names(value: str | None) -> list[str]:
        if not value:
            return ["Unknown Artist"]
        normalized_value = str(value).replace(chr(8226), ",")
        names = [
            part.strip()
            for part in normalized_value.split(",")
            if part.strip()
        ]
        return list(dict.fromkeys(names)) or ["Unknown Artist"]

    @property
    def catalog_view(self) -> Any:
        return self.client.table("song_catalog_view")

    def get_by_song_id(self, song_id: str) -> dict[str, Any] | None:
        response = self.catalog_view.select("*").eq("id", song_id).limit(1).execute()
        return self.first_or_none(response.data)

    def get_by_spotify_track_id(self, spotify_track_id: str) -> dict[str, Any] | None:
        normalized = self._normalize_spotify_track_id(spotify_track_id)
        if not normalized:
            return None
        external_id = self.first_or_none(
            self.client.table("song_external_ids")
            .select("song_id")
            .eq("provider", "spotify")
            .eq("provider_song_id", normalized)
            .limit(1)
            .execute()
            .data
        )
        if not external_id:
            return None
        return self.get_by_song_id(external_id["song_id"])

    def get_by_isrc(self, isrc: str | None) -> dict[str, Any] | None:
        if not isrc:
            return None
        response = self.catalog_view.select("*").eq("isrc", isrc.strip().upper()).limit(1).execute()
        return self.first_or_none(response.data)

    def get_by_ids(self, song_ids: list[str]) -> list[dict[str, Any]]:
        if not song_ids:
            return []
        response = self.catalog_view.select("*").in_("id", song_ids).execute()
        return response.data or []

    def upsert_song(self, payload: dict[str, Any]) -> dict[str, Any]:
        spotify_track_id = self._normalize_spotify_track_id(payload.get("spotify_track_id"))
        canonical_key = payload.get("canonical_key")
        if not canonical_key:
            canonical_key = (
                f"spotify:{spotify_track_id}"
                if spotify_track_id
                else self._fallback_canonical_key(payload)
            )

        # Resolution order (highest fidelity first):
        #   1. ISRC  — globally unique, always wins regardless of Spotify ID
        #   2. Spotify track ID — dedup within Spotify's catalog
        # This prevents "duplicate key on idx_songs_isrc_not_null" when a track
        # that was previously stored under one canonical_key comes in again via
        # a different Spotify track ID (e.g. re-import after re-normalization).
        if payload.get("isrc"):
            existing = self.get_by_isrc(payload.get("isrc"))
            if existing:
                canonical_key = existing["canonical_key"]
        elif spotify_track_id:
            existing = self.get_by_spotify_track_id(spotify_track_id)
            if existing:
                canonical_key = existing["canonical_key"]

        artist_rows = [
            self._upsert_artist(artist_name)
            for artist_name in self._split_artist_names(payload.get("artist"))
        ]
        album = self._upsert_album(payload, artist_rows) if payload.get("album") or payload.get("album_art") else None

        song_payload = {
            "canonical_key": canonical_key,
            "title": payload.get("title") or "Unknown Track",
            "isrc": str(payload["isrc"]).strip().upper() if payload.get("isrc") else None,
            "explicit": bool(payload.get("explicit", False)),
            "duration_ms": payload.get("duration_ms"),
            "image_url": payload.get("album_art"),
            "primary_album_id": album.get("id") if album else None,
        }
        song_payload = {key: value for key, value in song_payload.items() if value is not None}
        song = self.table.upsert(song_payload, on_conflict="canonical_key").execute().data[0]

        for position, artist in enumerate(artist_rows):
            self.client.table("song_artists").upsert(
                {
                    "song_id": song["id"],
                    "artist_id": artist["id"],
                    "role": "primary" if position == 0 else "featured",
                    "position": position,
                },
                on_conflict="song_id,artist_id,role",
            ).execute()

        provider = "spotify" if spotify_track_id else (payload.get("canonical_source") or "source_fallback")
        provider_song_id = spotify_track_id or canonical_key
        self.client.table("song_external_ids").upsert(
            {
                "song_id": song["id"],
                "provider": provider if provider in {"spotify", "apple_music", "youtube", "youtube_music", "isrc", "source_fallback"} else "source_fallback",
                "provider_song_id": provider_song_id,
                "provider_url": payload.get("source_url"),
                "raw_payload": payload.get("raw_payload") or {},
            },
            on_conflict="provider,provider_song_id",
        ).execute()

        if payload.get("isrc"):
            self.client.table("song_external_ids").upsert(
                {
                    "song_id": song["id"],
                    "provider": "isrc",
                    "provider_song_id": str(payload["isrc"]).strip().upper(),
                },
                on_conflict="provider,provider_song_id",
            ).execute()

        return self.get_by_song_id(song["id"]) or song

    def _upsert_artist(self, name: str) -> dict[str, Any]:
        canonical_key = f"artist:{self._slug(name)}"
        response = self.client.table("artists").upsert(
            {
                "canonical_key": canonical_key,
                "name": name,
            },
            on_conflict="canonical_key",
        ).execute()
        return response.data[0]

    def _upsert_album(self, payload: dict[str, Any], artist_rows: list[dict[str, Any]]) -> dict[str, Any]:
        album_title = payload.get("album") or f"{payload.get('title') or 'Unknown Track'} - Single"
        artist_key = ":".join(artist["canonical_key"] for artist in artist_rows) or "unknown"
        digest = hashlib.sha1(f"{album_title.lower()}::{artist_key}".encode("utf-8")).hexdigest()
        album = self.client.table("albums").upsert(
            {
                "canonical_key": f"album:{digest}",
                "title": album_title,
            },
            on_conflict="canonical_key",
        ).execute().data[0]

        for position, artist in enumerate(artist_rows):
            self.client.table("album_artists").upsert(
                {
                    "album_id": album["id"],
                    "artist_id": artist["id"],
                    "position": position,
                },
                on_conflict="album_id,artist_id",
            ).execute()

        return album
