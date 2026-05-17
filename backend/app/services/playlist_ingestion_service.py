import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from html import unescape
from typing import Literal
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import HTTPException, status

from backend.app.core.settings import get_settings
from backend.app.services.onboarding_service import OnboardingService
from backend.app.services.spotify_service import SpotifyService

logger = logging.getLogger(__name__)


class PlaylistIngestionService:
    APPLE_TRACK_FETCH_PARALLELISM = 8
    SPOTIFY_NORMALIZATION_PARALLELISM = 6
    YOUTUBE_PAGE_SIZE = 50
    APPLE_TRACK_URL_RE = re.compile(r'<meta property="music:song" content="([^"]+)"')
    APPLE_SONG_SCHEMA_RE = re.compile(
        r"<script id=['\"]?schema:song['\"]? type=['\"]application/ld\+json['\"]>\s*(\{.*?\})\s*</script>",
        re.DOTALL,
    )
    YOUTUBE_NOISE_RE = re.compile(
        r"\s*[\(\[][^)\]]*(official|video|audio|lyrics?|visualizer|remaster(?:ed)?|live)[^)\]]*[\)\]]",
        re.IGNORECASE,
    )
    ISO8601_DURATION_RE = re.compile(
        r"^P(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)$"
    )

    def __init__(self) -> None:
        self.settings = get_settings()
        self.spotify_service = SpotifyService()
        self.onboarding_service = OnboardingService()

    def import_playlist_link_to_taste_profile(self, user_id: str, input_text: str) -> dict:
        source_platform, playlist_url = self._detect_platform_and_url(input_text)
        logger.info(
            "[Ingestion] ══ START  user=%s  platform=%s  url=%s",
            user_id, source_platform, playlist_url,
        )

        raw_tracks = self._ingest_tracks(playlist_url, source_platform)
        logger.info("[Ingestion] fetched %d raw track(s) from %s", len(raw_tracks), source_platform)

        cleaned_tracks = [self._clean_source_track(track) for track in raw_tracks]
        logger.info(
            "[Ingestion] cleaned tracks: %s",
            ", ".join(f"{t['title']!r} by {t['artist']!r}" for t in cleaned_tracks[:5])
            + (f" … +{len(cleaned_tracks) - 5} more" if len(cleaned_tracks) > 5 else ""),
        )

        logger.info(
            "[Ingestion] normalizing %d track(s) via Spotify (parallelism=%d) …",
            len(cleaned_tracks), min(self.SPOTIFY_NORMALIZATION_PARALLELISM, len(cleaned_tracks)) or 1,
        )
        max_workers = min(self.SPOTIFY_NORMALIZATION_PARALLELISM, len(cleaned_tracks)) or 1
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            normalized_tracks = list(executor.map(self._normalize_track_with_fallback, cleaned_tracks))

        spotify_matched = sum(1 for t in normalized_tracks if t is not None)
        skipped = len(normalized_tracks) - spotify_matched
        logger.info(
            "[Ingestion] normalization done: %d matched, %d skipped (no confident Spotify hit)",
            spotify_matched, skipped,
        )

        imported = self.onboarding_service.import_songs_to_user_taste_profile(
            user_id,
            [t for t in normalized_tracks if t is not None],
            source=source_platform,
        )
        logger.info(
            "[Ingestion] ══ DONE  imported=%d  spotify_normalized=%d  skipped=%d",
            imported, spotify_matched, skipped,
        )
        return {
            "detected_platform": source_platform,
            "imported": imported,
            "spotify_normalized": spotify_matched,
            "source_fallbacks": skipped,
        }

    def _detect_platform_and_url(self, input_text: str) -> tuple[Literal["apple_music", "youtube", "youtube_music"], str]:
        playlist_url = self._extract_url(input_text)
        parsed = urlparse(playlist_url)
        host = (parsed.netloc or "").lower()

        if "music.apple.com" in host:
            return "apple_music", playlist_url
        if "music.youtube.com" in host:
            return "youtube_music", playlist_url
        if host in {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}:
            return "youtube", playlist_url

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported playlist link. Use Apple Music, YouTube, or YouTube Music.",
        )

    @staticmethod
    def _extract_url(input_text: str) -> str:
        match = re.search(r"https?://\S+", input_text or "")
        if not match:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Paste a valid Apple Music, YouTube, or YouTube Music playlist link.",
            )

        return match.group(0).rstrip(").,!?]}>\"'")

    def _ingest_tracks(self, playlist_url: str, source_platform: str) -> list[dict]:
        if source_platform == "apple_music":
            return self._ingest_apple_music_playlist(playlist_url)
        return self._ingest_youtube_playlist(playlist_url, source_platform=source_platform)

    def _fetch_text(self, url: str) -> str:
        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            try:
                response = client.get(url, follow_redirects=True)
            except httpx.HTTPError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Playlist fetch failed: {exc}",
                ) from exc

        if response.status_code >= 400:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Playlist fetch failed with status {response.status_code}.",
            )

        return response.text

    def _ingest_apple_music_playlist(self, playlist_url: str) -> list[dict]:
        html = self._fetch_text(playlist_url)
        song_urls = list(dict.fromkeys(self.APPLE_TRACK_URL_RE.findall(html)))
        if not song_urls:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not extract tracks from the Apple Music playlist.",
            )

        def fetch_song(song_url: str) -> dict:
            try:
                return self._fetch_apple_music_song(song_url)
            except (HTTPException, ValueError, json.JSONDecodeError):
                return {}

        max_workers = min(self.APPLE_TRACK_FETCH_PARALLELISM, len(song_urls)) or 1
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            tracks = [track for track in executor.map(fetch_song, song_urls) if track]

        if not tracks:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not load any track metadata from the Apple Music playlist.",
            )

        return tracks

    def _fetch_apple_music_song(self, song_url: str) -> dict:
        html = self._fetch_text(song_url)
        match = self.APPLE_SONG_SCHEMA_RE.search(html)
        if not match:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not parse an Apple Music track page.",
            )

        payload = json.loads(match.group(1))
        recording = payload.get("audio") if isinstance(payload.get("audio"), dict) else payload
        album = recording.get("inAlbum") if isinstance(recording, dict) else {}
        artists = recording.get("byArtist") if isinstance(recording, dict) else []

        artist_names = [
            artist.get("name")
            for artist in artists
            if isinstance(artist, dict) and artist.get("name")
        ]
        return {
            "platform": "apple_music",
            "title": recording.get("name") or payload.get("name") or "Unknown Track",
            "artist": " • ".join(dict.fromkeys(artist_names)) or "Unknown Artist",
            "album": album.get("name") if isinstance(album, dict) else None,
            "album_art": album.get("image") if isinstance(album, dict) else payload.get("image"),
            "duration_ms": self._parse_duration_ms(recording.get("duration") or payload.get("timeRequired")),
            "source_url": song_url,
        }

    def _ingest_youtube_playlist(self, playlist_url: str, *, source_platform: str) -> list[dict]:
        playlist_id = self._extract_youtube_playlist_id(playlist_url)
        self._get_youtube_playlist_metadata(playlist_id)

        items: list[dict] = []
        next_page_token: str | None = None
        while True:
            page = self._youtube_api_get(
                "/playlistItems",
                {
                    "part": "snippet,contentDetails,status",
                    "playlistId": playlist_id,
                    "maxResults": self.YOUTUBE_PAGE_SIZE,
                    **({"pageToken": next_page_token} if next_page_token else {}),
                },
            )
            page_items = page.get("items", [])
            video_ids = [
                item.get("contentDetails", {}).get("videoId")
                for item in page_items
                if item.get("contentDetails", {}).get("videoId")
            ]
            video_details = self._get_youtube_video_details(video_ids)

            for item in page_items:
                snippet = item.get("snippet") or {}
                content_details = item.get("contentDetails") or {}
                video_id = content_details.get("videoId")
                if not video_id:
                    continue

                title = snippet.get("title")
                if title in {"Deleted video", "Private video"}:
                    continue

                video = video_details.get(video_id, {})
                video_snippet = video.get("snippet") if isinstance(video.get("snippet"), dict) else {}
                thumbnails = video_snippet.get("thumbnails") or snippet.get("thumbnails") or {}
                items.append(
                    {
                        "platform": source_platform,
                        "title": video_snippet.get("title") or title or "Unknown Track",
                        "artist": video_snippet.get("channelTitle")
                        or snippet.get("videoOwnerChannelTitle")
                        or snippet.get("channelTitle")
                        or "Unknown Artist",
                        "album": None,
                        "album_art": self._select_thumbnail_url(thumbnails),
                        "duration_ms": self._parse_duration_ms(
                            video.get("contentDetails", {}).get("duration")
                        ),
                        "source_url": f"https://www.youtube.com/watch?v={video_id}&list={playlist_id}",
                    }
                )

            next_page_token = page.get("nextPageToken")
            if not next_page_token:
                break

        if not items:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not extract tracks from the YouTube playlist.",
            )

        return items

    def _youtube_api_get(self, path: str, params: dict) -> dict:
        if not self.settings.youtube_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="YouTube playlist import is not configured. Set YOUTUBE_API_KEY on the backend.",
            )

        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            try:
                response = client.get(
                    f"https://www.googleapis.com/youtube/v3{path}",
                    params={**params, "key": self.settings.youtube_api_key},
                )
            except httpx.HTTPError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"YouTube API request failed: {exc}",
                ) from exc

        if response.status_code >= 400:
            detail = response.text
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"YouTube API request failed: {detail}",
            )

        payload = response.json()
        if not isinstance(payload, dict):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="YouTube API returned an unexpected payload.",
            )
        return payload

    def _get_youtube_playlist_metadata(self, playlist_id: str) -> dict:
        payload = self._youtube_api_get(
            "/playlists",
            {
                "part": "snippet",
                "id": playlist_id,
                "maxResults": 1,
            },
        )
        items = payload.get("items", [])
        if not items:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="YouTube playlist not found or is not publicly accessible.",
            )
        return items[0]

    def _get_youtube_video_details(self, video_ids: list[str]) -> dict[str, dict]:
        details: dict[str, dict] = {}
        unique_video_ids = list(dict.fromkeys(video_ids))
        for start in range(0, len(unique_video_ids), self.YOUTUBE_PAGE_SIZE):
            batch = unique_video_ids[start:start + self.YOUTUBE_PAGE_SIZE]
            payload = self._youtube_api_get(
                "/videos",
                {
                    "part": "snippet,contentDetails",
                    "id": ",".join(batch),
                    "maxResults": len(batch),
                },
            )
            for item in payload.get("items", []):
                video_id = item.get("id")
                if video_id:
                    details[video_id] = item
        return details

    @staticmethod
    def _extract_youtube_playlist_id(playlist_url: str) -> str:
        parsed = urlparse(playlist_url)
        playlist_id = parse_qs(parsed.query).get("list", [None])[0]
        if not playlist_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Paste a YouTube or YouTube Music playlist link that contains a list id.",
            )
        return playlist_id

    @staticmethod
    def _collapse_whitespace(value: str) -> str:
        return " ".join(value.split())

    @staticmethod
    def _loose_text(value: str) -> str:
        return "".join(char.lower() if char.isalnum() else " " for char in value).strip()

    def _clean_source_track(self, raw_track: dict) -> dict:
        platform = raw_track.get("platform") or "unknown"
        title = self._collapse_whitespace(unescape(str(raw_track.get("title") or "Unknown Track")))
        artist = self._collapse_whitespace(unescape(str(raw_track.get("artist") or "Unknown Artist")))

        if str(platform).startswith("youtube"):
            artist = re.sub(r"\s*-\s*topic$", "", artist, flags=re.IGNORECASE).strip()
            title = self.YOUTUBE_NOISE_RE.sub("", title)
            title = re.sub(
                r"\s*-\s*(official|video|audio|lyrics?|visualizer|remaster(?:ed)?|live).*$",
                "",
                title,
                flags=re.IGNORECASE,
            ).strip()

            for separator in (" - ", " – ", " — ", " | "):
                if separator not in title:
                    continue
                possible_artist, possible_title = [part.strip() for part in title.split(separator, 1)]
                if not possible_artist or not possible_title:
                    continue
                if not artist or self._loose_text(possible_artist) in self._loose_text(artist):
                    artist = possible_artist
                    title = possible_title
                    break

        return {
            "title": self._collapse_whitespace(title) or "Unknown Track",
            "artist": self._collapse_whitespace(artist) or "Unknown Artist",
            "album": raw_track.get("album"),
            "album_art": raw_track.get("album_art"),
            "duration_ms": raw_track.get("duration_ms"),
            "explicit": bool(raw_track.get("explicit", False)),
            "isrc": raw_track.get("isrc"),
            "source_url": raw_track.get("source_url"),
        }

    def _normalize_track_with_fallback(self, cleaned_track: dict) -> dict | None:
        """Return a Spotify-normalised song payload, or None if no confident
        Spotify match exists. Callers must filter out None values."""
        try:
            return self.spotify_service.normalize_external_track(cleaned_track)
        except HTTPException as exc:
            logger.info(
                "[Ingestion] normalize failed for %r by %r: %s",
                cleaned_track.get('title'), cleaned_track.get('artist'), exc.detail,
            )
            return None

    def _parse_duration_ms(self, value: str | None) -> int | None:
        if not value:
            return None

        match = self.ISO8601_DURATION_RE.match(value)
        if not match:
            return None

        hours = int(match.group("hours") or 0)
        minutes = int(match.group("minutes") or 0)
        seconds = int(match.group("seconds") or 0)
        return ((hours * 3600) + (minutes * 60) + seconds) * 1000

    @staticmethod
    def _select_thumbnail_url(thumbnails: dict) -> str | None:
        if not isinstance(thumbnails, dict):
            return None

        for key in ("maxres", "standard", "high", "medium", "default"):
            image = thumbnails.get(key)
            if isinstance(image, dict) and image.get("url"):
                return image["url"]
        return None
