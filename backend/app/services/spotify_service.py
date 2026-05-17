import logging
import secrets
import threading
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
from time import monotonic, sleep
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, Request, Response, status

from backend.app.core.settings import get_settings
from backend.app.db.repositories.spotify_accounts import SpotifyAccountsRepository
from backend.app.db.supabase import get_supabase_client
from backend.app.schemas.spotify import SpotifyConnectResponse, SpotifyConnectStartResponse
from backend.app.services.profile_service import ProfileService


logger = logging.getLogger(__name__)


class SpotifyService:
    SPOTIFY_STATE_COOKIE = "vyne_spotify_state"
    AUTHORIZE_URL = "https://accounts.spotify.com/authorize"
    TOKEN_URL = "https://accounts.spotify.com/api/token"
    PROFILE_URL = "https://api.spotify.com/v1/me"
    LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/"
    ENRICHMENT_PARALLELISM = 10
    SPOTIFY_RETRY_ATTEMPTS = 4
    SPOTIFY_BACKOFF_BASE_SECONDS = 1.0
    # Maximum seconds we will actually wait when Spotify sends Retry-After.
    # Values above this threshold indicate a long-term ban/abuse response —
    # we fail fast and let callers fall back instead of blocking the thread.
    SPOTIFY_MAX_RETRY_WAIT_SECONDS = 30.0
    PLAYLIST_PAGE_LIMIT = 50
    SEARCH_PAGE_LIMIT = 10

    def __init__(self) -> None:
        self.settings = get_settings()
        self.account_repository = SpotifyAccountsRepository(get_supabase_client())
        self.profile_service = ProfileService()
        self._cache_lock = threading.Lock()
        self._lastfm_artist_context_cache: dict[str, tuple[float, dict]] = {}
        self._spotify_artist_search_cache: dict[str, tuple[float, dict | None]] = {}
        self._app_access_token: str | None = None
        self._app_access_token_expires_at: datetime | None = None

    @staticmethod
    def _cache_key(*parts: str | None) -> str:
        return "::".join((part or "").strip().lower() for part in parts)

    def _cache_get(self, cache: dict[str, tuple[float, dict | None]], key: str, ttl_seconds: float) -> dict | None:
        with self._cache_lock:
            cached = cache.get(key)
            if not cached:
                return None
            cached_at, value = cached
            if monotonic() - cached_at > ttl_seconds:
                cache.pop(key, None)
                return None
            return value

    def _cache_set(self, cache: dict[str, tuple[float, dict | None]], key: str, value: dict | None) -> None:
        with self._cache_lock:
            cache[key] = (monotonic(), value)

    @staticmethod
    def _normalize_track_id(value: str | None) -> str | None:
        if not value:
            return None
        return value.split(":")[-1]

    @staticmethod
    def _normalize_isrc(value: str | None) -> str | None:
        if not isinstance(value, str):
            return None
        normalized = value.strip().upper()
        return normalized or None

    @staticmethod
    def _extract_isrc(track: dict | None) -> str | None:
        if not isinstance(track, dict):
            return None

        external_ids = track.get("external_ids")
        if not isinstance(external_ids, dict):
            return None

        return SpotifyService._normalize_isrc(external_ids.get("isrc"))

    @staticmethod
    def _join_artist_names(artists: list[dict] | None, fallback: str = "Unknown Artist") -> str:
        if not artists or not isinstance(artists, list):
            return fallback

        names = [
            artist.get("name")
            for artist in artists
            if isinstance(artist, dict) and artist.get("name")
        ]
        unique_names = list(dict.fromkeys(names))
        return " • ".join(unique_names) if unique_names else fallback

    def _dedupe_track_payloads(self, track_payloads: list[dict]) -> list[dict]:
        unique_tracks: list[dict] = []
        seen_track_ids: set[str] = set()

        for payload in track_payloads:
            track_id = self._normalize_track_id(payload.get("spotify_track_id"))
            if not track_id or track_id in seen_track_ids:
                continue
            seen_track_ids.add(track_id)
            unique_tracks.append({
                **payload,
                "spotify_track_id": track_id,
            })

        return unique_tracks

    @staticmethod
    def _normalize_match_text(value: str | None) -> str:
        if not value:
            return ""

        normalized = (
            value.lower()
            .replace("&", " and ")
            .replace("•", " ")
            .replace("/", " ")
        )
        for token in ("feat", "featuring", "ft", "official", "audio", "video", "lyrics", "lyric", "remaster", "remastered"):
            normalized = normalized.replace(token, " ")

        cleaned = [
            char if char.isalnum() or char.isspace() else " "
            for char in normalized
        ]
        return " ".join("".join(cleaned).split())

    @classmethod
    def _match_similarity(cls, left: str | None, right: str | None) -> float:
        normalized_left = cls._normalize_match_text(left)
        normalized_right = cls._normalize_match_text(right)
        if not normalized_left or not normalized_right:
            return 0.0
        return SequenceMatcher(None, normalized_left, normalized_right).ratio()

    @staticmethod
    def _duration_similarity(left_ms: int | None, right_ms: int | None) -> float:
        if not isinstance(left_ms, int) or not isinstance(right_ms, int) or left_ms <= 0 or right_ms <= 0:
            return 0.5

        delta_seconds = abs(left_ms - right_ms) / 1000
        if delta_seconds <= 2:
            return 1.0
        if delta_seconds <= 5:
            return 0.9
        if delta_seconds <= 10:
            return 0.75
        if delta_seconds <= 20:
            return 0.5
        return 0.2

    @staticmethod
    def _spotify_error_message(response: httpx.Response) -> str | None:
        try:
            payload = response.json()
        except ValueError:
            payload = None

        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict):
                message = error.get("message") or error.get("reason")
                if message:
                    return str(message)
            if isinstance(error, str):
                description = payload.get("error_description")
                return f"{error}: {description}" if description else error
            message = payload.get("message")
            if message:
                return str(message)

        body = response.text.strip()
        return body or None

    def _retry_delay_seconds(self, response: httpx.Response, attempt: int) -> float:
        """Return how many seconds to wait before retrying a 429 response.

        The Retry-After header is honoured but capped at SPOTIFY_MAX_RETRY_WAIT_SECONDS.
        If Spotify asks for a wait longer than the cap, the caller should treat the
        response as a permanent failure for this request rather than blocking the thread.
        """
        retry_after_seconds: float | None = None
        retry_after_header = response.headers.get("Retry-After")
        if retry_after_header:
            try:
                retry_after_seconds = max(float(retry_after_header), 0.0)
            except ValueError:
                retry_after_seconds = None

        exponential_delay = self.SPOTIFY_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
        if retry_after_seconds is None:
            return exponential_delay
        return max(min(retry_after_seconds, self.SPOTIFY_MAX_RETRY_WAIT_SECONDS), exponential_delay)

    def _spotify_request(
        self,
        client: httpx.Client,
        method: str,
        url: str,
        *,
        retry_on_rate_limit: bool = True,
        **kwargs,
    ) -> httpx.Response:
        last_response: httpx.Response | None = None

        for attempt in range(1, self.SPOTIFY_RETRY_ATTEMPTS + 1):
            try:
                response = client.request(method, url, **kwargs)
            except httpx.HTTPError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Spotify request failed: {exc}",
                ) from exc
            last_response = response
            if response.status_code != 429 or not retry_on_rate_limit:
                return response

            if attempt == self.SPOTIFY_RETRY_ATTEMPTS:
                return response

            # Check the raw Retry-After before capping so we can bail out early
            # when Spotify is signalling a long-term ban (e.g. 85000 s).
            raw_retry_after: float | None = None
            retry_after_header = response.headers.get("Retry-After")
            if retry_after_header:
                try:
                    raw_retry_after = float(retry_after_header)
                except ValueError:
                    pass

            if raw_retry_after is not None and raw_retry_after > self.SPOTIFY_MAX_RETRY_WAIT_SECONDS:
                logger.debug(
                    "Spotify rate limit exceeded max retry wait — failing fast. "
                    "url=%s attempt=%d/%d retry_after=%.0fs (cap=%.0fs)",
                    url, attempt, self.SPOTIFY_RETRY_ATTEMPTS,
                    raw_retry_after, self.SPOTIFY_MAX_RETRY_WAIT_SECONDS,
                )
                return response

            delay_seconds = self._retry_delay_seconds(response, attempt)
            logger.debug(
                "Spotify rate limit hit; waiting before retry. "
                "url=%s attempt=%d/%d delay=%.1fs",
                url, attempt, self.SPOTIFY_RETRY_ATTEMPTS, delay_seconds,
            )
            sleep(delay_seconds)

        return last_response if last_response is not None else client.request(method, url, **kwargs)

    def _raise_spotify_api_error(
        self,
        response: httpx.Response,
        *,
        default_detail: str,
        fallback_status_code: int = status.HTTP_502_BAD_GATEWAY,
    ) -> None:
        detail = self._spotify_error_message(response) or default_detail
        status_code = response.status_code

        if status_code not in {400, 401, 403, 404, 429}:
            status_code = fallback_status_code
            detail = f"{default_detail} {detail}".strip()

        raise HTTPException(status_code=status_code, detail=detail)

    def _spotify_get(
        self,
        client: httpx.Client,
        url: str,
        *,
        headers: dict[str, str],
        params: dict | None = None,
        retry_on_rate_limit: bool = True,
    ) -> httpx.Response:
        return self._spotify_request(
            client,
            "GET",
            url,
            headers=headers,
            params=params,
            retry_on_rate_limit=retry_on_rate_limit,
        )

    def _get_app_access_token(self) -> str:
        with self._cache_lock:
            if (
                self._app_access_token
                and self._app_access_token_expires_at
                and datetime.now(timezone.utc) < self._app_access_token_expires_at - timedelta(seconds=60)
            ):
                return self._app_access_token

        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            response = self._spotify_request(
                client,
                "POST",
                self.TOKEN_URL,
                data={"grant_type": "client_credentials"},
                auth=(self.settings.spotify_client_id, self.settings.spotify_client_secret),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                retry_on_rate_limit=False,
            )

        if response.status_code >= 400:
            self._raise_spotify_api_error(
                response,
                default_detail="Spotify app token request failed.",
            )

        payload = response.json()
        access_token = payload.get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Spotify app token response did not include an access token.",
            )

        expires_in = int(payload.get("expires_in", 3600))
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        with self._cache_lock:
            self._app_access_token = access_token
            self._app_access_token_expires_at = expires_at
        return access_token

    # Seconds to wait before each catalog search to be polite to the Spotify API
    # and avoid bursting all parallel normalization workers at once.
    CATALOG_SEARCH_DELAY_SECONDS = 0.15

    def _search_catalog_tracks(self, query: str, *, limit: int = 5) -> list[dict]:
        access_token = self._get_app_access_token()
        sleep(self.CATALOG_SEARCH_DELAY_SECONDS)
        logger.info("[Spotify search] query=%r limit=%d", query, limit)
        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            response = self._spotify_get(
                client,
                "https://api.spotify.com/v1/search",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"q": query, "type": "track", "limit": limit},
            )

        if response.status_code >= 400:
            logger.info("[Spotify search] FAILED status=%d query=%r", response.status_code, query)
            self._raise_spotify_api_error(
                response,
                default_detail="Spotify catalog search failed.",
            )

        payload = response.json()
        items = payload.get("tracks", {}).get("items", []) if isinstance(payload, dict) else []
        logger.info(
            "[Spotify search] returned %d result(s) for query=%r → %s",
            len(items),
            query,
            ", ".join(
                f"{t.get('name')!r} by {self._join_artist_names(t.get('artists'))}"
                for t in items[:3]
            ) or "(none)",
        )
        return items

    def _build_song_payload_from_spotify_track(self, track: dict) -> dict:
        album = track.get("album") if isinstance(track.get("album"), dict) else {}
        images = album.get("images") if isinstance(album, dict) else []
        return {
            "spotify_track_id": self._normalize_track_id(track.get("id") or track.get("uri")),
            "canonical_source": "spotify",
            "isrc": self._extract_isrc(track),
            "title": track.get("name") or "Unknown Track",
            "artist": self._join_artist_names(track.get("artists")),
            "album": album.get("name") if isinstance(album, dict) else None,
            "album_art": images[0].get("url") if images else None,
            "explicit": bool(track.get("explicit", False)),
            "duration_ms": track.get("duration_ms"),
        }

    def _build_catalog_queries(self, source_track: dict) -> list[str]:
        title = str(source_track.get("title") or "").strip()
        artist = str(source_track.get("artist") or "").strip().replace("•", " ")
        queries: list[str] = []

        if title and artist:
            queries.append(f"track:{title} artist:{artist}")
        if title or artist:
            queries.append(" ".join(part for part in (title, artist) if part))

        unique_queries: list[str] = []
        seen_queries: set[str] = set()
        for query in queries:
            normalized = " ".join(query.split())
            if not normalized or normalized.lower() in seen_queries:
                continue
            seen_queries.add(normalized.lower())
            unique_queries.append(normalized)
        return unique_queries

    def _score_catalog_track_match(self, source_track: dict, candidate_track: dict) -> float:
        candidate_artist = self._join_artist_names(candidate_track.get("artists"))
        title_score = self._match_similarity(source_track.get("title"), candidate_track.get("name"))
        artist_score = self._match_similarity(source_track.get("artist"), candidate_artist)
        duration_score = self._duration_similarity(
            source_track.get("duration_ms"),
            candidate_track.get("duration_ms"),
        )
        return (title_score * 0.55) + (artist_score * 0.3) + (duration_score * 0.15)

    def normalize_external_track(self, source_track: dict, *, minimum_score: float = 0.72) -> dict:
        title = source_track.get('title') or 'Unknown Track'
        artist = source_track.get('artist') or 'Unknown Artist'
        logger.info(
            "[Normalize] ── START  %r by %r (duration=%sms)",
            title, artist, source_track.get('duration_ms'),
        )

        queries = self._build_catalog_queries(source_track)
        logger.info("[Normalize] queries=%r", queries)

        candidates: list[dict] = []
        seen_track_ids: set[str] = set()

        for query in queries:
            for candidate in self._search_catalog_tracks(query):
                track_id = self._normalize_track_id(candidate.get("id") or candidate.get("uri"))
                if not track_id or track_id in seen_track_ids:
                    continue
                seen_track_ids.add(track_id)
                candidates.append(candidate)

        logger.info("[Normalize] %d unique candidate(s) to score", len(candidates))

        best_candidate: dict | None = None
        best_score = 0.0
        for candidate in candidates:
            score = self._score_catalog_track_match(source_track, candidate)
            candidate_title = candidate.get('name')
            candidate_artist = self._join_artist_names(candidate.get('artists'))
            logger.info(
                "[Normalize] score=%.3f  %r by %r%s",
                score,
                candidate_title,
                candidate_artist,
                " ← BEST" if score > best_score else "",
            )
            if score > best_score:
                best_candidate = candidate
                best_score = score

        if best_candidate and best_score >= minimum_score:
            result = self._build_song_payload_from_spotify_track(best_candidate)
            logger.info(
                "[Normalize] ✓ MATCHED  %r by %r  score=%.3f (threshold=%.2f)  spotify_id=%s",
                best_candidate.get('name'),
                self._join_artist_names(best_candidate.get('artists')),
                best_score,
                minimum_score,
                result.get('spotify_track_id'),
            )
            return result

        if best_candidate:
            logger.info(
                "[Normalize] ✗ BELOW THRESHOLD  best=%r by %r  score=%.3f < %.2f — skipping",
                best_candidate.get('name'),
                self._join_artist_names(best_candidate.get('artists')),
                best_score,
                minimum_score,
            )
        else:
            logger.info("[Normalize] ✗ NO CANDIDATES  %r by %r — skipping", title, artist)

        return None

    def _fetch_several_tracks(
        self,
        client: httpx.Client,
        headers: dict[str, str],
        track_ids: list[str],
        market: str | None,
    ) -> dict[str, dict]:
        tracks_by_id: dict[str, dict] = {}
        def fetch_one(track_id: str) -> tuple[str, dict | None]:
            params_to_try: list[dict[str, str]] = []
            if market:
                params_to_try.append({"market": market})
            params_to_try.append({})

            for params in params_to_try:
                response = self._spotify_get(
                    client,
                    f"https://api.spotify.com/v1/tracks/{track_id}",
                    headers=headers,
                    params=params,
                )
                if response.status_code < 400:
                    payload = response.json()
                    return track_id, payload if isinstance(payload, dict) else None

                print(
                    "DEBUG: Optional Spotify track-details enrichment failed: "
                    f"id={track_id} status={response.status_code} body={response.text}"
                )

            return track_id, None

        max_workers = min(self.ENRICHMENT_PARALLELISM, len(track_ids)) or 1
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for track_id, track in executor.map(fetch_one, track_ids):
                if isinstance(track, dict) and track.get("id"):
                    tracks_by_id[track_id] = track
        return tracks_by_id

    def _fetch_artists(
        self,
        client: httpx.Client,
        headers: dict[str, str],
        artist_ids: list[str],
    ) -> dict[str, dict]:
        artists_by_id: dict[str, dict] = {}
        def fetch_one(artist_id: str) -> tuple[str, dict | None]:
            response = self._spotify_get(
                client,
                f"https://api.spotify.com/v1/artists/{artist_id}",
                headers=headers,
            )
            if response.status_code >= 400:
                print(
                    "DEBUG: Optional Spotify artist enrichment failed: "
                    f"id={artist_id} status={response.status_code} body={response.text}"
                )
                return artist_id, None

            payload = response.json()
            return artist_id, payload if isinstance(payload, dict) else None

        max_workers = min(self.ENRICHMENT_PARALLELISM, len(artist_ids)) or 1
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for artist_id, artist in executor.map(fetch_one, artist_ids):
                if isinstance(artist, dict) and artist.get("id"):
                    artists_by_id[artist_id] = artist
        return artists_by_id

    def _search_spotify_artist_by_name(
        self,
        client: httpx.Client,
        headers: dict[str, str],
        artist_name: str,
        market: str | None,
    ) -> dict | None:
        if not artist_name:
            return None

        cache_key = self._cache_key(artist_name, market)
        cached = self._cache_get(self._spotify_artist_search_cache, cache_key, ttl_seconds=60 * 60)
        if cached is not None:
            return cached

        for params in (
            {"q": artist_name, "type": "artist", "limit": 1, **({"market": market} if market else {})},
            {"q": artist_name, "type": "artist", "limit": 1},
        ):
            response = self._spotify_get(
                client,
                "https://api.spotify.com/v1/search",
                headers=headers,
                params=params,
            )
            if response.status_code >= 400:
                print(
                    "DEBUG: Spotify artist search failed for similar artist "
                    f"{artist_name!r}: {response.status_code} - {response.text}"
                )
                continue

            items = response.json().get("artists", {}).get("items", [])
            if items:
                self._cache_set(self._spotify_artist_search_cache, cache_key, items[0])
                return items[0]

        self._cache_set(self._spotify_artist_search_cache, cache_key, None)
        return None

    def _enrich_similar_artists_with_spotify(
        self,
        client: httpx.Client,
        headers: dict[str, str],
        similar_artists: list[dict],
        market: str | None,
    ) -> list[dict]:
        enriched_artists: list[dict] = []
        seen_keys: set[str] = set()

        def enrich_one(artist: dict) -> dict | None:
            if not isinstance(artist, dict):
                return None

            name = artist.get("name")
            if not name:
                return None

            spotify_artist = self._search_spotify_artist_by_name(client, headers, name, market)
            if spotify_artist:
                return {
                    "id": spotify_artist.get("id"),
                    "name": spotify_artist.get("name") or name,
                    "image": spotify_artist["images"][0]["url"] if spotify_artist.get("images") else artist.get("image"),
                    "genres": spotify_artist.get("genres", [])[:2],
                    "followers": spotify_artist.get("followers", {}).get("total"),
                    "popularity": spotify_artist.get("popularity"),
                    "match": artist.get("match"),
                    "url": artist.get("url"),
                }

            return {
                "id": None,
                "name": name,
                "image": artist.get("image"),
                "genres": [],
                "followers": None,
                "popularity": None,
                "match": artist.get("match"),
                "url": artist.get("url"),
            }

        candidates = [artist for artist in similar_artists[:5] if isinstance(artist, dict)]
        if not candidates:
            return enriched_artists

        max_workers = min(5, len(candidates))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for enriched in executor.map(enrich_one, candidates):
                if not enriched:
                    continue
                unique_key = str(enriched.get("id") or enriched.get("name") or "").strip().lower()
                if not unique_key or unique_key in seen_keys:
                    continue
                seen_keys.add(unique_key)
                enriched_artists.append(enriched)

        return enriched_artists

    def _search_artist_top_tracks_fallback(
        self,
        client: httpx.Client,
        headers: dict[str, str],
        artist_name: str,
        market: str | None,
    ) -> list[dict]:
        if not artist_name:
            return []

        query = f'artist:"{artist_name}"'
        for params in (
            {"q": query, "type": "track", "limit": 10, **({"market": market} if market else {})},
            {"q": query, "type": "track", "limit": 10},
        ):
            response = self._spotify_get(
                client,
                "https://api.spotify.com/v1/search",
                headers=headers,
                params=params,
            )
            if response.status_code >= 400:
                print(
                    "DEBUG: Spotify fallback track search failed for artist "
                    f"{artist_name!r}: {response.status_code} - {response.text}"
                )
                continue

            items = response.json().get("tracks", {}).get("items", [])
            if items:
                return items

        return []

    @staticmethod
    def _lastfm_image_url(images: list[dict] | None) -> str | None:
        if not images or not isinstance(images, list):
            return None

        preferred_sizes = {"mega", "extralarge", "large", "medium", "small"}
        for size in preferred_sizes:
            for image in images:
                if not isinstance(image, dict):
                    continue
                if image.get("size") == size and image.get("#text"):
                    return image["#text"]

        for image in images:
            if isinstance(image, dict) and image.get("#text"):
                return image["#text"]
        return None

    def _lastfm_request(self, method: str, params: dict[str, str]) -> dict | None:
        if not self.settings.lastfm_api_key:
            return None

        request_params = {
            "method": method,
            "api_key": self.settings.lastfm_api_key,
            "format": "json",
            **params,
        }

        try:
            with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
                response = client.get(self.LASTFM_API_URL, params=request_params)
        except httpx.HTTPError as exc:
            print(f"Last.fm request failed for {method}: {exc}")
            return None

        if response.status_code >= 400:
            print(f"Last.fm {method} failed: {response.status_code} - {response.text}")
            return None

        payload = response.json()
        if isinstance(payload, dict) and payload.get("error"):
            print(f"Last.fm {method} returned API error: {payload}")
            return None
        return payload

    def _get_lastfm_artist_context(self, artist_name: str) -> dict:
        if not artist_name:
            return {
                "bio": None,
                "tags": [],
                "similarArtists": [],
                "bannerImage": None,
                "lastfmUrl": None,
            }

        cache_key = self._cache_key(artist_name)
        cached = self._cache_get(self._lastfm_artist_context_cache, cache_key, ttl_seconds=30 * 60)
        if cached is not None:
            return cached

        with ThreadPoolExecutor(max_workers=2) as executor:
            info_future = executor.submit(
                self._lastfm_request,
                "artist.getinfo",
                {"artist": artist_name, "autocorrect": "1", "lang": "en"},
            )
            similar_future = executor.submit(
                self._lastfm_request,
                "artist.getsimilar",
                {"artist": artist_name, "autocorrect": "1", "limit": "8"},
            )
            info_payload = info_future.result()
            similar_payload = similar_future.result()

        artist_info = info_payload.get("artist", {}) if isinstance(info_payload, dict) else {}
        bio = None
        bio_payload = artist_info.get("bio") if isinstance(artist_info, dict) else None
        if isinstance(bio_payload, dict):
            bio = bio_payload.get("summary") or bio_payload.get("content")
            if isinstance(bio, str):
                bio = bio.split("<a href=")[0].strip()

        tags_payload = artist_info.get("tags", {}).get("tag", []) if isinstance(artist_info, dict) else []
        if isinstance(tags_payload, dict):
            tags_payload = [tags_payload]
        tags = [
            tag.get("name")
            for tag in tags_payload
            if isinstance(tag, dict) and tag.get("name")
        ][:8]

        similar_artists_payload = (
            similar_payload.get("similarartists", {}).get("artist", [])
            if isinstance(similar_payload, dict)
            else []
        )
        if isinstance(similar_artists_payload, dict):
            similar_artists_payload = [similar_artists_payload]

        similar_artists = []
        seen_names: set[str] = set()
        for artist in similar_artists_payload:
            if not isinstance(artist, dict):
                continue
            name = artist.get("name")
            if not name:
                continue
            normalized_name = str(name).strip().lower()
            if normalized_name in seen_names:
                continue
            seen_names.add(normalized_name)
            similar_artists.append({
                "name": name,
                "image": self._lastfm_image_url(artist.get("image")),
                "match": artist.get("match"),
                "url": artist.get("url"),
            })
            if len(similar_artists) >= 5:
                break

        result = {
            "bio": bio,
            "tags": tags,
            "similarArtists": similar_artists,
            "bannerImage": self._lastfm_image_url(artist_info.get("image")) if isinstance(artist_info, dict) else None,
            "lastfmUrl": artist_info.get("url") if isinstance(artist_info, dict) else None,
        }
        self._cache_set(self._lastfm_artist_context_cache, cache_key, result)
        return result

    def _enrich_track_payloads(
        self,
        _access_token: str,
        _market: str | None,
        track_payloads: list[dict],
    ) -> list[dict]:
        normalized_tracks = []
        missing_isrc_track_ids: list[str] = []
        for payload in track_payloads:
            track_id = self._normalize_track_id(payload.get("spotify_track_id"))
            metadata = payload.get("metadata")
            song_metadata = dict(metadata) if isinstance(metadata, dict) else {}
            isrc = self._normalize_isrc(payload.get("isrc")) or self._normalize_isrc(song_metadata.get("isrc"))
            normalized_track_id = track_id or payload.get("spotify_track_id")
            normalized_tracks.append({
                **payload,
                "spotify_track_id": normalized_track_id,
                "isrc": isrc,
                "title": payload.get("title") or "Unknown Track",
                "artist": payload.get("artist") or "Unknown Artist",
                "album": payload.get("album") or song_metadata.get("album"),
                "album_art": payload.get("album_art"),
                "explicit": bool(payload.get("explicit", song_metadata.get("explicit", False))),
                "duration_ms": payload.get("duration_ms", song_metadata.get("duration_ms")),
            })
            if normalized_track_id and not isrc:
                missing_isrc_track_ids.append(normalized_track_id)

        track_details_by_id: dict[str, dict] = {}
        unique_missing_track_ids = list(dict.fromkeys(missing_isrc_track_ids))
        if unique_missing_track_ids and _access_token:
            with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
                track_details_by_id = self._fetch_several_tracks(
                    client,
                    {"Authorization": f"Bearer {_access_token}"},
                    unique_missing_track_ids,
                    _market,
                )

        for track in normalized_tracks:
            if track.get("isrc"):
                continue

            track_id = self._normalize_track_id(track.get("spotify_track_id"))
            if not track_id:
                continue

            isrc = self._extract_isrc(track_details_by_id.get(track_id))
            if isrc:
                track["isrc"] = isrc

        return normalized_tracks

    def _ensure_fresh_token(self, user_id: str, account: dict) -> str:
        expires_at_str = account.get("expires_at")
        if not expires_at_str:
            return account["access_token"]
        
        expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
        # Buffer of 60 seconds
        if datetime.now(timezone.utc) < expires_at - timedelta(seconds=60):
            return account["access_token"]
        
        print(f"Refreshing Spotify token for user {user_id}")
        return self._refresh_access_token(user_id, refresh_token=account["refresh_token"], account=account)

    def _refresh_access_token(self, user_id: str, refresh_token: str, account: dict | None = None) -> str:
        if not refresh_token:
            raise HTTPException(status_code=401, detail="Spotify refresh token missing.")
            
        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            response = self._spotify_request(
                client,
                "POST",
                self.TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                },
                auth=(self.settings.spotify_client_id, self.settings.spotify_client_secret),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        
        if response.status_code >= 400:
            print(f"Spotify token refresh failed: {response.status_code} - {response.text}")
            detail = self._spotify_error_message(response) or "Failed to refresh Spotify token."
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)
            
        data = response.json()
        access_token = data["access_token"]
        expires_in = int(data.get("expires_in", 3600))
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        existing_account = account or self.account_repository.get_by_user_id(user_id) or {}
        
        # Update DB
        self.account_repository.upsert_account({
            **existing_account,
            "user_id": user_id,
            "access_token": access_token,
            "expires_at": expires_at.isoformat(),
            # Refresh token might be rotated
            "refresh_token": data.get("refresh_token") or refresh_token
        })
        
        return access_token

    def get_user_playlists(self, user_id: str, *, limit: int | None = None) -> list[dict]:
        account = self.account_repository.get_by_user_id(user_id)
        if not account or not account.get("access_token"):
            raise HTTPException(status_code=401, detail="Spotify account not linked.")
        
        access_token = self._ensure_fresh_token(user_id, account)
        headers = {"Authorization": f"Bearer {access_token}"}
        items: list[dict] = []
        next_url: str | None = "https://api.spotify.com/v1/me/playlists"
        target_limit = max(1, min(limit, self.PLAYLIST_PAGE_LIMIT)) if limit is not None else None
        params: dict | None = {
            "limit": target_limit or self.PLAYLIST_PAGE_LIMIT,
        }
        
        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            while next_url:
                response = self._spotify_get(
                    client,
                    next_url,
                    headers=headers,
                    params=params,
                )
                if response.status_code >= 400:
                    print(f"Spotify playlists fetch failed: {response.status_code} - {response.text}")
                    self._raise_spotify_api_error(
                        response,
                        default_detail="Failed to load Spotify playlists.",
                    )

                data = response.json()
                page_items = data.get("items", [])
                if isinstance(page_items, list):
                    items.extend(page_items)
                    if target_limit is not None and len(items) >= target_limit:
                        return items[:target_limit]

                next_url = data.get("next")
                params = None

        return items

    def get_playlist_tracks(self, user_id: str, playlist_id: str) -> list[dict]:
        # Clean ID
        clean_id = playlist_id.split(":")[-1] if ":" in playlist_id else playlist_id
        
        account = self.account_repository.get_by_user_id(user_id)
        if not account or not account.get("access_token"):
            raise HTTPException(status_code=401, detail="Spotify account not linked.")
            
        access_token = self._ensure_fresh_token(user_id, account)
        granted_scope = account.get("scope") or ""
        
        # 1. Fetch user info for debugging
        market_profile = None
            
        print(f"DEBUG: Fetching playlist items for playlist {clean_id}. User market: {market_profile}")
            
        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            }
            
            # 2. Fetch playlist metadata to validate access and log basic context.
            meta_res = self._spotify_get(
                client,
                f"https://api.spotify.com/v1/playlists/{clean_id}",
                headers=headers,
                params={"market": market_profile} if market_profile else None,
            )
            
            if meta_res.status_code >= 400:
                print(f"Spotify playlist meta fetch failed: {meta_res.status_code} - {meta_res.text}")
                self._raise_spotify_api_error(
                    meta_res,
                    default_detail="Cannot access playlist metadata.",
                )

            meta_data = meta_res.json()
            print(f"DEBUG: Playlist Meta keys: {list(meta_data.keys())}")

            items = []
            offset = 0
            limit = 100
            playlist_items_url = f"https://api.spotify.com/v1/playlists/{clean_id}/items"

            while True:
                resp = self._spotify_get(
                    client,
                    playlist_items_url,
                    headers=headers,
                    params={
                        "limit": limit,
                        "offset": offset,
                        **({"market": market_profile} if market_profile else {}),
                    },
                )

                if resp.status_code == 403:
                    print(
                        "DEBUG: Playlist items endpoint returned 403; "
                        "falling back to playlist payload."
                    )
                    break

                if resp.status_code >= 400:
                    print(f"Spotify playlist items fetch failed: {resp.status_code} - {resp.text}")
                    self._raise_spotify_api_error(
                        resp,
                        default_detail="Cannot access playlist items.",
                    )

                page_data = resp.json()
                page_items = page_data.get("items", [])
                if not isinstance(page_items, list):
                    print(
                        "DEBUG: Playlist items payload was not a list at "
                        f"offset {offset}: {type(page_items).__name__}"
                    )
                    break

                items.extend(page_items)
                print(
                    f"DEBUG: Playlist items page offset={offset} returned "
                    f"{len(page_items)} items. Total so far: {len(items)}"
                )

                if len(page_items) < limit:
                    break

                offset += limit

            if not items:
                raw_items = meta_data.get("items", [])
                if isinstance(raw_items, list):
                    items = raw_items
                elif isinstance(raw_items, dict):
                    nested_items = raw_items.get("items", [])
                    if isinstance(nested_items, list):
                        items.extend(nested_items)

                    next_url = raw_items.get("next")
                    while next_url:
                        resp = self._spotify_get(client, next_url, headers=headers)
                        if resp.status_code >= 400:
                            print(f"DEBUG: Fallback items pagination failed: {resp.status_code} - {resp.text}")
                            break

                        page_data = resp.json()
                        page_items = page_data.get("items", [])
                        if not isinstance(page_items, list):
                            print(
                                "DEBUG: Fallback items page was not a list: "
                                f"{type(page_items).__name__}"
                            )
                            break

                        items.extend(page_items)
                        print(
                            f"DEBUG: Fallback playlist payload page returned {len(page_items)} items. "
                            f"Total so far: {len(items)}"
                        )
                        next_url = page_data.get("next")

                if not items:
                    tracks_payload = meta_data.get("tracks", {})
                    if isinstance(tracks_payload, dict):
                        nested_items = tracks_payload.get("items", [])
                        if isinstance(nested_items, list):
                            items.extend(nested_items)

                        next_url = tracks_payload.get("next")
                        while next_url:
                            resp = self._spotify_get(client, next_url, headers=headers)
                            if resp.status_code >= 400:
                                print(f"DEBUG: Fallback tracks pagination failed: {resp.status_code} - {resp.text}")
                                break

                            page_data = resp.json()
                            page_items = page_data.get("items", [])
                            if not isinstance(page_items, list):
                                print(
                                    "DEBUG: Fallback tracks page was not a list: "
                                    f"{type(page_items).__name__}"
                                )
                                break

                            items.extend(page_items)
                            print(
                                f"DEBUG: Fallback tracks page returned {len(page_items)} items. "
                                f"Total so far: {len(items)}"
                            )
                            next_url = page_data.get("next")

                print(f"DEBUG: Fallback playlist payload contained {len(items)} items.")

        if not items:
            print(
                "WARNING: No playlist items found for playlist "
                f"{clean_id}. Playlist name: {meta_data.get('name')}. "
                f"Granted scope: {granted_scope or 'none'}"
            )
            return []
            
        tracks = []
        first_item_debugged = False
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                print(
                    f"DEBUG: Skipping playlist item at index {index} because it is "
                    f"{type(item).__name__}, not a dict."
                )
                continue

            # Playlist responses can return playlist-item wrappers, `item` wrappers,
            # or direct track objects depending on endpoint/shape.
            track_obj = item.get("track")
            if track_obj is None:
                track_obj = item.get("item")
            if track_obj is None:
                track_obj = item

            if not isinstance(track_obj, dict):
                print(
                    f"DEBUG: Skipping playlist item at index {index} because nested track is "
                    f"{type(track_obj).__name__}, not a dict."
                )
                continue

            if not track_obj:
                continue

            if not first_item_debugged:
                print(f"DEBUG: First playlist item keys: {list(item.keys())}")
                print(f"DEBUG: First extracted media object keys: {list(track_obj.keys())}")
                first_item_debugged = True
                
            # Basic track info
            track_id = track_obj.get("id") or track_obj.get("uri")
            if not track_id:
                continue
                
            # Artists list
            artists = track_obj.get("artists", [])
            artist_name = self._join_artist_names(artists)
            
            # Images
            album = track_obj.get("album")
            img_url = None
            if album and album.get("images") and len(album["images"]) > 0:
                img_url = album["images"][0].get("url")
            
            tracks.append({
                "spotify_track_id": track_id,
                "isrc": self._extract_isrc(track_obj),
                "title": track_obj.get("name") or "Unknown Track",
                "artist": artist_name,
                "album": album.get("name") if isinstance(album, dict) else None,
                "album_art": img_url,
                "explicit": bool(track_obj.get("explicit", False)),
                "duration_ms": track_obj.get("duration_ms"),
            })
        
        if not tracks and items:
            sample = items[0]
            if isinstance(sample, dict):
                print(f"DEBUG: Sample playlist item when no tracks processed: {sample}")

        deduped_tracks = self._dedupe_track_payloads(tracks)
        enriched_tracks = self._enrich_track_payloads(access_token, market_profile, deduped_tracks)
        print(f"DEBUG: Successfully processed {len(enriched_tracks)} tracks for import.")
        return enriched_tracks

    def search_tracks(self, user_id: str, query: str, search_type: str = "all") -> list[dict]:
        account = self.account_repository.get_by_user_id(user_id)
        if not account or not account.get("access_token"):
            raise HTTPException(status_code=401, detail="Spotify account not linked.")

        access_token = self._ensure_fresh_token(user_id, account)
        market = None
        normalized_search_type = search_type if search_type in {"all", "track", "artist", "album"} else "all"
        spotify_search_type = "track,artist,album" if normalized_search_type == "all" else normalized_search_type

        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            headers = {"Authorization": f"Bearer {access_token}"}
            search_params = {
                "q": query,
                "type": spotify_search_type,
                "limit": self.SEARCH_PAGE_LIMIT,
                **({"market": market} if market else {}),
            }
            response = self._spotify_get(
                client,
                "https://api.spotify.com/v1/search",
                headers=headers,
                params=search_params,
            )

            if market and response.status_code in {400, 403}:
                print(
                    "DEBUG: Spotify search with market failed; retrying without market. "
                    f"status={response.status_code} body={response.text}"
                )
                response = self._spotify_get(
                    client,
                    "https://api.spotify.com/v1/search",
                    headers=headers,
                    params={
                        "q": query,
                        "type": spotify_search_type,
                        "limit": self.SEARCH_PAGE_LIMIT,
                    },
                )

        if response.status_code >= 400:
            print(f"Spotify search failed: {response.status_code} - {response.text}")
            self._raise_spotify_api_error(
                response,
                default_detail="Spotify search failed.",
            )

        payload = response.json()

        artists = []
        for artist in payload.get("artists", {}).get("items", []):
            artists.append({
                "id": artist.get("id"),
                "kind": "artist",
                "title": artist.get("name") or "Unknown Artist",
                "subtitle": " • ".join(artist.get("genres", [])[:2]) if artist.get("genres") else "Artist",
                "image": artist["images"][0]["url"] if artist.get("images") else None,
            })

        albums = []
        for album in payload.get("albums", {}).get("items", []):
            albums.append({
                "id": album.get("id"),
                "kind": "album",
                "title": album.get("name") or "Unknown Album",
                "subtitle": self._join_artist_names(album.get("artists")),
                "image": album["images"][0]["url"] if album.get("images") else None,
            })

        track_payloads = []
        for track in payload.get("tracks", {}).get("items", []):
            track_payloads.append({
                "spotify_track_id": track.get("id") or track.get("uri"),
                "isrc": self._extract_isrc(track),
                "title": track.get("name") or "Unknown Track",
                "artist": self._join_artist_names(track.get("artists")),
                "album": track["album"].get("name") if track.get("album") else None,
                "album_art": track["album"]["images"][0]["url"] if track.get("album") and track["album"].get("images") else None,
                "explicit": bool(track.get("explicit", False)),
                "duration_ms": track.get("duration_ms"),
            })

        tracks = [
            {
                "id": track["spotify_track_id"],
                "kind": "track",
                "spotifyTrackId": track["spotify_track_id"],
                "isrc": track.get("isrc"),
                "title": track["title"],
                "artist": track["artist"],
                "subtitle": track["artist"],
                "album": track.get("album"),
                "albumArt": track.get("album_art"),
                "image": track.get("album_art"),
                "explicit": bool(track.get("explicit", False)),
                "durationMs": track.get("duration_ms"),
            }
            for track in self._enrich_track_payloads(access_token, market, track_payloads)
        ]

        if normalized_search_type == "track":
            return tracks
        if normalized_search_type == "artist":
            return artists
        if normalized_search_type == "album":
            return albums

        return [
            *tracks[:10],
            *artists[:4],
            *albums[:4],
        ]

    def get_artist_details(self, user_id: str, artist_id: str) -> dict:
        account = self.account_repository.get_by_user_id(user_id)
        if not account or not account.get("access_token"):
            raise HTTPException(status_code=401, detail="Spotify account not linked.")

        access_token = self._ensure_fresh_token(user_id, account)
        market = None
        clean_id = artist_id.split(":")[-1] if ":" in artist_id else artist_id

        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            headers = {"Authorization": f"Bearer {access_token}"}
            with ThreadPoolExecutor(max_workers=2) as executor:
                artist_future = executor.submit(
                    self._spotify_get,
                    client,
                    f"https://api.spotify.com/v1/artists/{clean_id}",
                    headers=headers,
                )
                albums_future = executor.submit(
                    self._spotify_get,
                    client,
                    f"https://api.spotify.com/v1/artists/{clean_id}/albums",
                    headers=headers,
                    params={
                        "include_groups": "album,single",
                        **({"market": market} if market else {}),
                    },
                )
                artist_response = artist_future.result()
                albums_response = albums_future.result()

        if artist_response.status_code >= 400:
            self._raise_spotify_api_error(
                artist_response,
                default_detail="Failed to load artist.",
            )

        if albums_response.status_code >= 400:
            print(f"Spotify artist albums failed: {albums_response.status_code} - {albums_response.text}")

        artist = artist_response.json()
        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            top_tracks_items = self._search_artist_top_tracks_fallback(
                client,
                headers,
                artist.get("name") or "",
                market,
            )
            albums_items = (
                albums_response.json().get("items", [])
                if albums_response.status_code < 400
                else []
            )
            lastfm_context = self._get_lastfm_artist_context(artist.get("name") or "")

        top_track_payloads = [
            {
                "spotify_track_id": track.get("id") or track.get("uri"),
                "isrc": self._extract_isrc(track),
                "title": track.get("name") or "Unknown Track",
                "artist": self._join_artist_names(track.get("artists")),
                "album": track["album"].get("name") if track.get("album") else None,
                "album_art": track["album"]["images"][0]["url"] if track.get("album") and track["album"].get("images") else None,
                "explicit": bool(track.get("explicit", False)),
                "duration_ms": track.get("duration_ms"),
            }
            for track in top_tracks_items
        ]
        top_tracks = [
            {
                "id": track["spotify_track_id"],
                "spotifyTrackId": track["spotify_track_id"],
                "isrc": track.get("isrc"),
                "title": track["title"],
                "artist": track["artist"],
                "album": track.get("album"),
                "albumArt": track.get("album_art"),
                "explicit": bool(track.get("explicit", False)),
                "durationMs": track.get("duration_ms"),
            }
            for track in self._enrich_track_payloads(access_token, market, top_track_payloads)
        ]

        albums = []
        seen_album_ids: set[str] = set()
        for album in albums_items:
            album_id = album.get("id")
            if not album_id or album_id in seen_album_ids:
                continue
            seen_album_ids.add(album_id)
            albums.append({
                "id": album_id,
                "title": album.get("name") or "Unknown Album",
                "artist": self._join_artist_names(album.get("artists")),
                "image": album["images"][0]["url"] if album.get("images") else None,
                "releaseDate": album.get("release_date"),
                "totalTracks": album.get("total_tracks"),
            })

        return {
            "id": artist.get("id"),
            "name": artist.get("name") or "Unknown Artist",
            "image": artist["images"][0]["url"] if artist.get("images") else None,
            "bannerImage": artist["images"][0]["url"] if artist.get("images") else None,
            "spotifyUrl": artist.get("external_urls", {}).get("spotify"),
            "genres": artist.get("genres", []),
            "followers": artist.get("followers", {}).get("total") if isinstance(artist.get("followers"), dict) else None,
            "popularity": artist.get("popularity"),
            "about": lastfm_context.get("bio"),
            "tags": lastfm_context.get("tags", []),
            "lastfmUrl": lastfm_context.get("lastfmUrl"),
            "topTracks": top_tracks,
            "albums": albums,
        }

    def get_artist_similar(self, user_id: str, artist_id: str) -> dict:
        account = self.account_repository.get_by_user_id(user_id)
        if not account or not account.get("access_token"):
            raise HTTPException(status_code=401, detail="Spotify account not linked.")

        access_token = self._ensure_fresh_token(user_id, account)
        market = None
        clean_id = artist_id.split(":")[-1] if ":" in artist_id else artist_id

        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            headers = {"Authorization": f"Bearer {access_token}"}
            artist_response = self._spotify_get(
                client,
                f"https://api.spotify.com/v1/artists/{clean_id}",
                headers=headers,
            )

            if artist_response.status_code >= 400:
                self._raise_spotify_api_error(
                    artist_response,
                    default_detail="Failed to load artist.",
                )

            artist = artist_response.json()
            lastfm_context = self._get_lastfm_artist_context(artist.get("name") or "")
            similar_artists = self._enrich_similar_artists_with_spotify(
                client,
                headers,
                lastfm_context.get("similarArtists", []),
                market,
            )

        return {"items": similar_artists}

    def get_album_details(self, user_id: str, album_id: str) -> dict:
        account = self.account_repository.get_by_user_id(user_id)
        if not account or not account.get("access_token"):
            raise HTTPException(status_code=401, detail="Spotify account not linked.")

        access_token = self._ensure_fresh_token(user_id, account)
        market = None
        clean_id = album_id.split(":")[-1] if ":" in album_id else album_id

        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            response = self._spotify_get(
                client,
                f"https://api.spotify.com/v1/albums/{clean_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"market": market} if market else None,
            )

        if response.status_code >= 400:
            self._raise_spotify_api_error(
                response,
                default_detail="Failed to load album.",
            )

        album = response.json()
        track_payloads = [
            {
                "spotify_track_id": track.get("id") or track.get("uri"),
                "title": track.get("name") or "Unknown Track",
                "artist": self._join_artist_names(track.get("artists")),
                "album": album.get("name"),
                "album_art": album["images"][0]["url"] if album.get("images") else None,
                "explicit": bool(track.get("explicit", False)),
                "duration_ms": track.get("duration_ms"),
            }
            for track in album.get("tracks", {}).get("items", [])
        ]
        tracks = [
            {
                "id": track["spotify_track_id"],
                "spotifyTrackId": track["spotify_track_id"],
                "isrc": track.get("isrc"),
                "title": track["title"],
                "artist": track["artist"],
                "album": track.get("album"),
                "albumArt": track.get("album_art"),
                "explicit": bool(track.get("explicit", False)),
                "durationMs": track.get("duration_ms"),
            }
            for track in self._enrich_track_payloads(access_token, market, track_payloads)
        ]

        return {
            "id": album.get("id"),
            "title": album.get("name") or "Unknown Album",
            "artist": self._join_artist_names(album.get("artists")),
            "image": album["images"][0]["url"] if album.get("images") else None,
            "bannerImage": album["images"][0]["url"] if album.get("images") else None,
            "spotifyUrl": album.get("external_urls", {}).get("spotify"),
            "releaseDate": album.get("release_date"),
            "genres": album.get("genres", []),
            "label": album.get("label"),
            "tracks": tracks,
        }

    def get_user_top_tracks(self, user_id: str) -> list[dict]:
        account = self.account_repository.get_by_user_id(user_id)
        if not account or not account.get("access_token"):
            raise HTTPException(status_code=401, detail="Spotify account not linked.")
            
        access_token = self._ensure_fresh_token(user_id, account)
            
        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            response = self._spotify_get(
                client,
                "https://api.spotify.com/v1/me/top/tracks",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"limit": 25, "time_range": "medium_term"},
            )
            
        if response.status_code >= 400:
            print(f"Spotify top tracks fetch failed: {response.status_code} - {response.text}")
            self._raise_spotify_api_error(
                response,
                default_detail="Failed to load Spotify top tracks.",
            )
            
        data = response.json()
        tracks = []
        for track in data.get("items", []):
            tracks.append({
                "spotify_track_id": track.get("id") or track.get("uri"),
                "isrc": self._extract_isrc(track),
                "title": track.get("name") or "Unknown Track",
                "artist": self._join_artist_names(track.get("artists")),
                "album": track["album"].get("name") if track.get("album") else None,
                "album_art": track["album"]["images"][0]["url"] if track.get("album") and track["album"].get("images") and len(track["album"]["images"]) > 0 else None,
                "explicit": bool(track.get("explicit", False)),
                "duration_ms": track.get("duration_ms"),
            })
        return self._enrich_track_payloads(access_token, None, tracks)

    def get_user_liked_songs(self, user_id: str) -> list[dict]:
        account = self.account_repository.get_by_user_id(user_id)
        if not account or not account.get("access_token"):
            raise HTTPException(status_code=401, detail="Spotify account not linked.")
            
        access_token = self._ensure_fresh_token(user_id, account)
            
        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            response = self._spotify_get(
                client,
                "https://api.spotify.com/v1/me/tracks",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"limit": 25},
            )
            
        if response.status_code >= 400:
            print(f"Spotify liked songs fetch failed: {response.status_code} - {response.text}")
            self._raise_spotify_api_error(
                response,
                default_detail="Failed to load Spotify saved tracks.",
            )
            
        data = response.json()
        tracks = []
        for item in data.get("items", []):
            track = item.get("track")
            if track:
                tracks.append({
                    "spotify_track_id": track.get("id") or track.get("uri"),
                    "isrc": self._extract_isrc(track),
                    "title": track.get("name") or "Unknown Track",
                    "artist": self._join_artist_names(track.get("artists")),
                    "album": track["album"].get("name") if track.get("album") else None,
                    "album_art": track["album"]["images"][0]["url"] if track.get("album") and track["album"].get("images") and len(track["album"]["images"]) > 0 else None,
                    "explicit": bool(track.get("explicit", False)),
                    "duration_ms": track.get("duration_ms"),
                })
        return self._enrich_track_payloads(access_token, None, tracks)

    def start_connect_flow(self, response: Response) -> SpotifyConnectStartResponse:
        state = secrets.token_urlsafe(24)
        response.set_cookie(
            key=self.SPOTIFY_STATE_COOKIE,
            value=state,
            max_age=600,
            httponly=True,
            samesite="lax",
            path="/",
        )
        scopes = " ".join(self.settings.spotify_scope_list)
        print(f"DEBUG: Requesting Spotify scopes: {scopes}")
        
        query = urlencode(
            {
                "client_id": self.settings.spotify_client_id,
                "response_type": "code",
                "redirect_uri": self.settings.validated_spotify_redirect_uri,
                "scope": scopes,
                "state": state,
                "show_dialog": "true",
            }
        )
        return SpotifyConnectStartResponse(
            authorization_url=f"{self.AUTHORIZE_URL}?{query}",
            state=state,
        )

    def handle_callback(self, user_id: str, code: str, state: str, request: Request, response: Response) -> SpotifyConnectResponse:
        stored_state = request.cookies.get(self.SPOTIFY_STATE_COOKIE)
        if not stored_state or stored_state != state:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Spotify callback state.")

        token_payload = self._exchange_code_for_tokens(code)
        spotify_profile = self._fetch_spotify_profile(token_payload["access_token"])
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(token_payload.get("expires_in", 3600)))

        account = self.account_repository.upsert_account(
            {
                "user_id": user_id,
                "spotify_user_id": spotify_profile["id"],
                "display_name": spotify_profile.get("display_name"),
                "access_token": token_payload["access_token"],
                "refresh_token": token_payload.get("refresh_token"),
                "scope": token_payload.get("scope"),
                "token_type": token_payload.get("token_type"),
                "expires_at": expires_at.isoformat(),
            }
        )
        self.profile_service.mark_spotify_connected(user_id)
        response.delete_cookie(key=self.SPOTIFY_STATE_COOKIE, path="/")
        return SpotifyConnectResponse(connected=True, profile=account)

    def _exchange_code_for_tokens(self, code: str) -> dict:
        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            response = self._spotify_request(
                client,
                "POST",
                self.TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": self.settings.validated_spotify_redirect_uri,
                },
                auth=(self.settings.spotify_client_id, self.settings.spotify_client_secret),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if response.status_code >= 400:
            detail = self._spotify_error_message(response) or "Spotify token exchange failed."
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)
        return response.json()

    def _fetch_spotify_profile(self, access_token: str) -> dict:
        with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
            response = self._spotify_get(
                client,
                self.PROFILE_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if response.status_code >= 400:
            detail = self._spotify_error_message(response) or "Spotify profile retrieval failed."
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)
        return response.json()
