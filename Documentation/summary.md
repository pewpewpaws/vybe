# CampusBeats / Vyne Technical Documentation

Generated from the current repository state in `/home/anair/Coding/CampusBeats`.

## 1. Project Overview

### Purpose

CampusBeats, branded as **Vyne** in the frontend and API metadata, is a campus music-matching application. Users authenticate, build a music taste profile from Spotify/manual/playlist imports, discover other users with compatible tastes, send match requests, accept or decline requests, and exchange songs after becoming accepted matches.

The repository also contains a separate local desktop/web tool under `MusicSynthesizer/` for extracting audio features from the song catalog. That tool is not wired into the live FastAPI matching runtime, but it is the only implemented audio/ML-style pipeline currently present in the codebase.

### Main Functionality

Implemented functional areas:

| Area | What exists |
| --- | --- |
| Authentication | Google OAuth, ETLab credential/callback login, session cookies, bearer-token fallback |
| Profile management | Profile retrieval/update, admin flag derivation, ETLab verification |
| Music onboarding | Add/remove taste songs, complete onboarding, Spotify connect, import top tracks/liked songs/playlists, import Apple Music/YouTube playlist links |
| Spotify browsing | Search tracks/artists/albums, artist detail pages, album detail pages, Last.fm artist context enrichment |
| Discovery | Lists precomputed `match_candidates` rows for the current user |
| Match requests | Create, list incoming/outgoing, accept, decline |
| Accepted matches | List accepted matches, verify a match, fetch match profile |
| Song interactions | Send songs to accepted matches and react like/dislike |
| Internal experiments | Admin-only creation/listing of experimental connection rows |
| Audio analysis tool | Fetch songs from Supabase, find YouTube audio, download/cache audio, create clips, extract Essentia features, checkpoint/export CSVs |

### Core Architecture

The main application has a conventional three-tier structure:

```text
React/Vite frontend
  |
  | HTTP via /api/v1, credentials included
  v
FastAPI backend
  |
  | Supabase Python/PostgREST client using service role key
  v
Supabase PostgreSQL tables

External services:
  Google OAuth, ETLab, Spotify Web API, Last.fm, YouTube Data API
```

The audio pipeline is separate:

```text
MusicSynthesizer Flask UI
  |
  | starts subprocess: python -c "import music; music.load_songs/main()"
  v
MusicSynthesizer/music.py
  |
  | Supabase songs -> yt-dlp -> ffmpeg -> Essentia -> CSV/checkpoint
  v
MusicSynthesizer/output/*.csv
```

### Technologies, Frameworks, Libraries

Backend:

| Dependency | Use |
| --- | --- |
| FastAPI | HTTP API routing and dependency injection |
| Pydantic / pydantic-settings | Request/response schemas and env config |
| Supabase Python client / PostgREST | Database access |
| httpx | External API calls |
| python-dotenv | Environment loading, mostly in pipeline |
| uvicorn | Expected FastAPI runtime, listed in requirements |

Frontend:

| Dependency | Use |
| --- | --- |
| React 18 | UI |
| Vite | Dev server/build |
| TypeScript | Frontend typing |
| React Router | Routing |
| TanStack React Query | Server-state cache and mutations |
| Zustand | Auth and toast stores |
| Framer Motion | Transitions/animations |
| Tailwind CSS | Styling |
| clsx / tailwind-merge | Class composition |

Audio tool:

| Dependency | Use |
| --- | --- |
| Flask | Local desktop web UI |
| Supabase Python client | Reads songs table |
| yt-dlp | YouTube lookup/download |
| ffmpeg/ffprobe | Audio validation and snippet generation |
| Essentia | Audio feature extraction |
| NumPy / pandas / SciPy | Numeric processing and CSV export |
| tqdm | Optional CLI progress |

### High-Level System Flow

1. User visits the frontend.
2. `frontend/src/main.tsx` initializes auth by calling `/api/v1/auth/session`.
3. Unauthenticated users are redirected to `/login`.
4. Login starts Google OAuth through `/api/v1/auth/google/start` or ETLab through backend routes.
5. Backend creates/updates a `profiles` row, creates an `app_sessions` row, and writes `vyne_session`.
6. Authenticated users with incomplete onboarding are routed to `/onboarding`.
7. Onboarding adds songs through:
   - Spotify connected imports,
   - Spotify search/manual adds,
   - Apple Music/YouTube/YouTube Music playlist URL ingestion.
8. Songs are normalized/upserted into `songs` and linked through `user_taste_songs`.
9. Completing onboarding only checks Spotify connectivity or minimum taste song count. It does not compute matching candidates.
10. Discovery reads preexisting `match_candidates` rows and augments them with profile/request/shared-song data.
11. Users create `match_requests`; accepting creates an `accepted_matches` row.
12. Accepted matches can exchange songs via `song_interactions`.

Important current gap: runtime creation of `match_candidates` is not implemented in the backend. Discovery assumes those rows already exist.

## 2. Codebase Structure

### Root

```text
.
|-- AGENTS.md
|-- .env.example
|-- backend/
|-- frontend/
|-- MusicSynthesizer/
|-- music_analysis_pipeline_colab.ipynb
|-- vyne_full_project.md
|-- vyne_tech_stack.md
`-- vyne_ui.md
```

| Path | Responsibility |
| --- | --- |
| `AGENTS.md` | Development instructions for agents |
| `.env.example` | Root backend env sample |
| `backend/` | FastAPI backend and SQL schema |
| `frontend/` | Vite React frontend |
| `MusicSynthesizer/` | Local Flask UI and audio feature extraction pipeline |
| `music_analysis_pipeline_colab.ipynb` | Notebook version of the music analysis pipeline |
| `vyne_*.md` | Product/design/tech notes, not executable runtime code |

### Backend

```text
backend/
|-- README.md
|-- requirements.txt
|-- sql/
|   |-- schema.sql
|   |-- nuke.sql
|   `-- README.md
`-- app/
    |-- main.py
    |-- api/
    |   |-- router.py
    |   `-- routes/*.py
    |-- auth/dependencies.py
    |-- core/settings.py
    |-- db/
    |   |-- base.py
    |   |-- supabase.py
    |   `-- repositories/*.py
    |-- internal/
    |   |-- router.py
    |   `-- routes/experiments.py
    |-- schemas/*.py
    `-- services/*.py
```

#### Entry Points

| File | Entry point |
| --- | --- |
| `backend/app/main.py` | Defines `create_application()` and module-level `app` for ASGI |
| `backend/app/api/router.py` | Mounts public `/api/v1` route groups |
| `backend/app/internal/router.py` | Mounts `/internal` route groups |
| `backend/sql/schema.sql` | Database schema bootstrap |

#### `backend/app/main.py`

Creates the FastAPI application with:

- title/version from `Settings`;
- CORS configured from `frontend_origin`;
- global `httpx.RequestError` handler returning HTTP 503;
- public API router under `settings.api_v1_prefix`, default `/api/v1`;
- internal router under `/internal`.

#### `backend/app/core/settings.py`

`Settings` is a `BaseSettings` class. It reads environment variables from `(".env", "../env")`, case-insensitively, and ignores extras.

Key behavior:

- hard-coded Spotify scopes include private/collaborative playlists, top tracks, and library reads;
- Google scopes are `openid email profile`;
- session cookie name is `vyne_session`;
- validates Spotify redirect URI so plain HTTP is allowed only for loopback addresses and `localhost` is rejected;
- parses comma-separated `FRONTEND_ORIGIN`, `ADMIN_EMAILS`, and `ADMIN_ETLAB_IDS`.

#### `backend/app/db/supabase.py`

Creates a custom Supabase client:

- `CampusBeatsPostgrestClient` disables HTTP/2 and follows redirects.
- `VyneSupabaseClient` injects the custom PostgREST client.
- monkey-patches PostgREST request builders to retry transient `httpx.ReadError`/`RequestError` three times with small backoff.
- `get_supabase_client()` is cached and uses the Supabase service role key.

This means all backend DB operations bypass RLS through the service-role key. Route/service-level authorization must therefore be correct.

#### Repositories

Repositories are thin table wrappers around Supabase queries.

| Repository | Table | Main methods |
| --- | --- | --- |
| `ProfilesRepository` | `profiles` | `get_by_id`, `get_by_etlab_id`, `get_by_email`, `create`, `update`, `list_by_ids` |
| `SessionsRepository` | `app_sessions` | `create`, `get_active_by_token`, `revoke` |
| `SongsRepository` | `songs` | normalize IDs, canonical-key upsert, batch fetch |
| `UserTasteSongsRepository` | `user_taste_songs` | add/upsert, remove, list |
| `SpotifyAccountsRepository` | `spotify_accounts` | upsert/get account |
| `MatchCandidatesRepository` | `match_candidates` | list for user, get one candidate |
| `MatchRequestsRepository` | `match_requests` | create, get, list incoming/outgoing, pending lookup, status update |
| `AcceptedMatchesRepository` | `accepted_matches` | create, get, list for user, pair lookup |
| `SongInteractionsRepository` | `song_interactions` | create, get, list received, update reaction |
| `ExperimentalConnectionsRepository` | `internal_experimental_connections` | list/create |

Hidden coupling: services often create their own repository instances against the cached Supabase client. This makes testing harder and means service construction has side effects if env is missing.

#### Services

| Service | Responsibility |
| --- | --- |
| `AuthService` | ETLab/Google login flows, session creation, logout, frontend redirect construction |
| `SessionService` | Session token generation, cookie read/write, expiration/revocation |
| `ProfileService` | Profile CRUD, admin flagging, identity merge/update |
| `ETLabService` | ETLab credential login, OAuth callback/token exchange, profile mapping |
| `ETLabVerificationService` | Verifies DOB/register number and marks profile verified |
| `GoogleOAuthService` | Google OAuth URL, token exchange, userinfo fetch |
| `SpotifyService` | Spotify OAuth, token refresh, search/import/browse/enrichment |
| `OnboardingService` | Upserts songs, links taste songs, onboarding state/completion |
| `PlaylistIngestionService` | Apple Music/YouTube playlist parsing and Spotify normalization |
| `MatchingService` | Reads discovery candidates and shared songs |
| `MatchRequestService` | Request creation/listing/accept/decline |
| `AcceptedMatchService` | Accepted match list/detail/verification |
| `SongInteractionService` | Send/react to songs between accepted matches |
| `InternalExperimentsService` | Admin experimental connections |

#### Schemas

Schemas use `CamelModel` where the API should emit camelCase. `CamelModel` sets:

- `populate_by_name=True`;
- `from_attributes=True`;
- `alias_generator=to_camel`.

Important schemas:

- `ProfileResponse`, `ProfilePreview`, `ProfileUpdateRequest`;
- `SongRecord`, `TasteSongResponse`;
- `AuthSessionResponse`, `OAuthStartResponse`;
- `MatchCandidateResponse`, `MatchRequestResponse`, `AcceptedMatchResponse`;
- `SendSongRequest`, `SongInteractionResponse`;
- `OnboardingStateResponse`, `PlaylistLinkImportResponse`;
- `SpotifyConnectStartResponse`, `SpotifyConnectResponse`.

### Frontend

```text
frontend/
|-- package.json
|-- vite.config.ts
|-- tailwind.config.js
|-- tsconfig*.json
|-- src/
|   |-- main.tsx
|   |-- App.tsx
|   |-- index.css
|   |-- router/
|   |-- services/api.ts
|   |-- store/authStore.ts
|   |-- pages/*.tsx
|   |-- components/
|   |-- lib/
|   |-- types/
|   `-- data/carouselTracks.*
`-- dist/
```

#### Frontend Entry Points

| File | Responsibility |
| --- | --- |
| `src/main.tsx` | Creates React root, initializes auth, preloads app/routes/images, installs React Query provider |
| `src/App.tsx` | Thin `RouterProvider` wrapper |
| `src/router/index.tsx` | Route definitions and guards |
| `src/services/api.ts` | Fetch wrapper |
| `src/store/authStore.ts` | Auth/session Zustand store |

#### Pages

| Page | Route | Responsibility |
| --- | --- | --- |
| `LoginPage.tsx` | `/login` | Google sign-in over animated track backdrop |
| `OnboardingPage.tsx` | `/onboarding` | Multi-step setup: Spotify connect, playlist link import, select Spotify playlist, background imports, complete onboarding |
| `DiscoveryPage.tsx` | `/discovery` | Shows match candidates from `/discovery/candidates` |
| `MatchRequestsPage.tsx` | `/requests` | Currently appears largely placeholder/static in current code |
| `MatchProfilePage.tsx` | `/match/:userId` | Currently placeholder/back button in current code |
| `LeaderboardPage.tsx` | `/leaderboard` | Placeholder/static |
| `ProfilePage.tsx` | `/profile` | Shows profile, taste stats, top artists, sign out |
| `MyVibesPage.tsx` | `/my-vibes` | Lists taste songs, background import status, delete song |
| `AddSongsPage.tsx` | `/add-songs` | Spotify search and manual add of tracks; artist/album result navigation |
| `ArtistPage.tsx` | `/artists/:artistId` | Spotify/Last.fm artist detail, top tracks, albums, similar artists, add tracks |
| `AlbumPage.tsx` | `/albums/:albumId` | Spotify album detail and add tracks |

#### Components

| Folder | Responsibility |
| --- | --- |
| `components/layout` | Auth guard, app shell, bottom nav, page transitions |
| `components/ui` | Button, card, badge, skeletons, spinner, toast |
| `components/common` | Loading/error/empty states, loader, explicit badge |

#### Frontend State

- Auth: Zustand persisted key `vyne-auth`, storing `user` and `token` even though the backend mainly uses cookies.
- Server state: React Query with 2 minute stale time and 5 minute garbage collection.
- Shared query keys:
  - `TASTE_QUERY_KEY = ['taste-songs']`;
  - `MATCH_CANDIDATES_QUERY_KEY = ['match-candidates']`.
- Background import status: localStorage keys `vyne-import-status` and `vyne-import-label`.

### MusicSynthesizer

```text
MusicSynthesizer/
|-- app.py
|-- desktop.py
|-- gui.py
|-- music.py
|-- config.json
|-- requirements.txt
|-- requirements-gui.txt
|-- templates/
|-- static/
|-- output/
`-- tmp/
```

| File | Responsibility |
| --- | --- |
| `app.py` | Flask UI, configuration API, subprocess orchestration, progress tracking |
| `desktop.py` | Runs Flask app on `127.0.0.1:5123` |
| `gui.py` | Same app runner alias |
| `music.py` | Core audio analysis pipeline |
| `config.json` | Local pipeline configuration, currently contains Supabase URL/key |
| `static/js/app.js` | Load/process progress UI |
| `static/js/preferences.js` | Config editing UI |
| `static/js/results.js` | CSV results display |
| `output/*.csv` | Checkpoints and exported analysis results |
| `tmp/cache` | Cached downloaded audio |

## 3. Data Flow

### Authentication Flow

```text
Frontend /login
  -> GET /api/v1/auth/google/start?next_path=...
  -> backend sets vyne_google_state and vyne_google_next_path cookies
  -> browser redirects to Google
  -> GET /api/v1/auth/google/callback?code&state
  -> AuthService validates state
  -> GoogleOAuthService exchanges code and fetches userinfo
  -> ProfileService get-or-create by email
  -> SessionService creates app_sessions row
  -> response sets vyne_session cookie
  -> frontend redirect to normalized next path
```

ETLab credential login:

```text
POST /api/v1/auth/etlab/login
  -> ETLabService.authenticate_with_credentials()
  -> ProfileService.get_or_create_from_etlab_identity()
  -> SessionService.create_session()
  -> Set vyne_session
```

Session lookup:

```text
GET /api/v1/auth/session
  -> get_optional_user()
  -> session cookie or Authorization: Bearer
  -> app_sessions lookup
  -> expiration check
  -> profiles lookup
  -> AuthSessionResponse
```

### Onboarding/Taste Data Flow

Manual add:

```text
Frontend AddSongsPage
  -> GET /spotify/search
  -> POST /onboarding/songs
  -> OnboardingService.add_song_to_user_taste_profile
  -> SongsRepository.upsert_song
  -> UserTasteSongsRepository.add_song
  -> ProfileService.update_profile(vibe_profile={})
```

Spotify playlist import:

```text
Frontend OnboardingPage
  -> GET /spotify/playlists
  -> POST /spotify/playlists/{playlist_id}/import
  -> SpotifyService.get_playlist_tracks
  -> OnboardingService.import_songs_to_user_taste_profile
  -> parallel per-song upserts
```

Playlist link import:

```text
POST /onboarding/playlist-links/import
  -> PlaylistIngestionService._detect_platform_and_url
  -> Apple Music HTML scrape OR YouTube Data API pagination
  -> clean title/artist/duration/art
  -> parallel Spotify normalization by catalog search
  -> OnboardingService bulk import
```

### Discovery/Matching Flow

```text
GET /api/v1/discovery/candidates
  -> require_etlab
  -> MatchCandidatesRepository.list_for_user(user_id)
  -> MatchRequestsRepository.list_outgoing(user_id)
  -> ProfilesRepository.list_by_ids(candidate_user_ids)
  -> UserTasteSongsRepository.list_for_user(current and candidate)
  -> SongsRepository.get_by_ids(shared_ids[:1])
  -> MatchCandidateResponse[]
```

Current limitation: no service writes `match_candidates`. The flow only reads rows. Upstream batch generation, admin seeding, SQL scripts, or external ML jobs would need to populate this table.

### Request/Accepted Match Flow

```text
POST /api/v1/discovery/requests
  -> validate requester != candidate
  -> require candidate row exists
  -> reject already accepted pair
  -> reject duplicate pending outgoing/incoming
  -> create match_requests row

POST /api/v1/requests/{id}/accept
  -> ensure current user is recipient
  -> ensure request pending
  -> update match_requests.status = accepted
  -> create accepted_matches row if absent
```

### Song Interaction Flow

```text
POST /api/v1/matches/{match_id}/songs
  -> require accepted match membership
  -> identify receiver
  -> upsert song
  -> create song_interactions row

POST /api/v1/matches/songs/{interaction_id}/reaction
  -> ensure current user is receiver
  -> update reaction and reacted_at
```

### Audio Pipeline Flow

```text
MusicSynthesizer UI
  -> POST /api/load-songs
  -> subprocess music.load_songs()
  -> Supabase songs fetch
  -> checkpoint skip calculation
  -> UI state updated by __STATUS__ lines

MusicSynthesizer UI
  -> POST /api/start-processing
  -> subprocess music.main()
  -> fetch songs
  -> load successful checkpoint rows
  -> ThreadPool download queue
  -> ProcessPool analysis queue
  -> per song:
       build YouTube query
       yt-dlp search
       download/cache audio
       ffprobe/ffmpeg validation
       create start/middle/end WAV clips
       Essentia feature extraction
       weighted aggregation
  -> checkpoint CSV
  -> final CSV exports
```

## 4. Feature Analysis

### Authentication

#### Google OAuth

Implemented in:

- `backend/app/api/routes/auth.py`;
- `backend/app/services/auth_service.py`;
- `backend/app/services/google_oauth_service.py`;
- `frontend/src/store/authStore.ts`;
- `frontend/src/pages/LoginPage.tsx`.

Inputs:

- optional `next_path` query param;
- Google callback `code` and `state`.

Outputs:

- `OAuthStartResponse` containing `authorizationUrl` and `state`;
- callback redirects to frontend and sets `vyne_session`.

Edge cases handled:

- invalid state returns 400;
- missing Google config returns 503;
- unverified Google email returns 403;
- missing profile fields returns 502;
- next path is normalized to same-origin path only.

Limitations:

- Google identity `picture` is fetched but not stored as `avatar_url`;
- persisted frontend `token` is unused/null for cookie sessions.

#### ETLab Login and Verification

Implemented in:

- `ETLabService`;
- `ETLabVerificationService`;
- `/auth/etlab/*`;
- `/verify/etlab`.

ETLab credential login creates an already verified profile. Verification endpoint can verify a Google-created profile by checking ETLab credentials and DOB.

Edge cases handled:

- mock mode via `ETLAB_MOCK_MODE`;
- ETLab "Kindly Use Web Portal" is mapped to 503 maintenance;
- missing ETLab access token/profile fields returns 502;
- DOB comparison strips non-alphanumeric and lowercases;
- register number must be alphanumeric.

Security notes:

- Passwords are sent to the backend for ETLab verification/login.
- ETLab SSL verification can be disabled by env.

### Profile

Implemented endpoints:

- `GET /api/v1/profile/me`;
- `PATCH /api/v1/profile/me`.

Supported updates:

- `name`;
- `avatar_url`.

Profile creation merges identities:

- ETLab identity first tries `etlab_id`, then email;
- Google identity tries email;
- admin flag is derived from configured admin emails/ETLab IDs.

### Spotify Connect and Browse

Implemented in `SpotifyService` and `frontend/src/pages/OnboardingPage.tsx`, `AddSongsPage.tsx`, `ArtistPage.tsx`, `AlbumPage.tsx`.

Connect flow:

- `/spotify/connect` sets `vyne_spotify_state` and returns Spotify authorization URL.
- `/spotify/callback` validates backend session and state, exchanges code, fetches Spotify profile, upserts `spotify_accounts`, marks profile connected, redirects to `/onboarding?spotify_connected=true`.

Token handling:

- user access tokens are stored in `spotify_accounts`;
- `_ensure_fresh_token()` refreshes if `expires_at` is within 60 seconds;
- refreshed access token and possibly rotated refresh token are upserted.

Search:

- `GET /spotify/search?q=&search_type=`;
- supports `all`, `track`, `artist`, `album`;
- returns a mixed flattened list for `all`;
- enriches track payloads with ISRC if missing.

Artist details:

- fetches Spotify artist and albums concurrently;
- gets top tracks through search fallback rather than the official top-tracks endpoint;
- enriches biography/tags/similar artists from Last.fm;
- returns albums and top tracks in frontend-friendly camelCase.

Album details:

- fetches Spotify album;
- returns tracks with album metadata and optional ISRC enrichment.

Edge cases handled:

- 429 rate limits retry with `Retry-After`/exponential backoff;
- common Spotify error structures are parsed;
- some market-sensitive calls retry/fallback without market, though `market` is currently always `None`;
- playlist import has multiple fallback paths for differently shaped playlist payloads.

Limitations:

- Spotify tokens are stored in plaintext in the database.
- Several debug `print()` statements may leak operational details.
- `market_profile` is always `None`, so market-specific availability is not used.
- Playlist import imports all deduped tracks it can parse, but return count is input payload count, not necessarily newly inserted count.

### Playlist Link Import

Implemented in `PlaylistIngestionService`.

Supported links:

- Apple Music playlist pages (`music.apple.com`);
- YouTube playlist links with `list=`;
- YouTube Music playlist links with `list=`.

Apple Music path:

1. Fetch playlist HTML.
2. Extract `<meta property="music:song" content="...">` song URLs.
3. Fetch each song page in parallel.
4. Parse `schema:song` JSON-LD.
5. Extract title, artist, album, artwork, duration.

YouTube path:

1. Extract playlist ID from `list` query param.
2. Validate playlist with `/playlists`.
3. Page through `/playlistItems`.
4. Batch fetch `/videos` for duration/thumbnails.
5. Clean titles and artists using regex rules.

Normalization:

1. Build Spotify catalog queries from title/artist.
2. Search Spotify with app client credentials.
3. Score candidates with title similarity (55%), artist similarity (30%), duration similarity (15%).
4. Use Spotify result if score >= `0.72`.
5. Otherwise store source fallback with `canonical_source = source_fallback`.

Edge cases handled:

- unsupported links return 400;
- missing YouTube API key returns 503;
- deleted/private videos are skipped;
- Apple track parse failures are swallowed per track.

Limitations:

- Apple Music parsing depends on page markup and may break.
- YouTube title cleanup is heuristic.
- Spotify app token cache is per `SpotifyService` instance, but services are instantiated repeatedly.

### Onboarding

Implemented in `OnboardingService` and `OnboardingPage`.

Backend state response:

```json
{
  "onboardingCompleted": true,
  "spotifyConnected": true,
  "tasteSongCount": 12,
  "vibeProfile": {},
  "tasteSongs": []
}
```

Completion rule:

- allowed if `profile.spotify_connected` is true OR the user has at least 5 taste songs.

Important current behavior:

- `refresh_user_vibe_profile()` sets `vibe_profile` to `{}`.
- No runtime taste vector or embedding is generated in the FastAPI backend.

### Discovery

Discovery displays rows from `match_candidates`.

For each row, backend returns:

- candidate profile name/avatar;
- score;
- `shared_artists` JSON;
- `vibe_summary`;
- outgoing pending request status if present;
- one top shared song based on exact overlapping `song_id`.

Edge cases:

- candidates with missing profile rows are skipped;
- candidate preview returns 404 for missing candidate/profile;
- request can be created only for current candidate rows.

Limitations:

- no candidate generation;
- no fallback discovery based on taste songs;
- shared songs require exact same canonical song row, so fallback canonicalization affects results heavily.

### Match Requests

Implemented in `MatchRequestService`.

Creation checks:

- requester cannot request self;
- candidate row must exist;
- pair must not already be accepted;
- no pending outgoing duplicate;
- no reverse pending request.

Acceptance:

- only recipient can accept;
- request must be pending;
- updates request status and `responded_at`;
- creates `accepted_matches` unless pair already exists.

Decline:

- only recipient can decline;
- request must be pending;
- updates request status and `responded_at`.

### Accepted Matches and Song Sharing

Accepted match endpoints require ETLab verification.

Match listing/detail:

- reads all matches where current user is `user_a_id` or `user_b_id`;
- resolves the other profile;
- calculates top shared songs by exact overlap of taste song IDs.

Song sharing:

- sender must be a member of the accepted match;
- song is upserted into global catalog;
- interaction row stores sender, receiver, song, and reaction.

Reaction:

- only receiver can react;
- reaction must be `like` or `dislike`.

### Internal Experiments

Admin-only routes under `/internal/experiments`.

Admin is determined by:

- `profiles.is_admin`;
- email in `ADMIN_EMAILS`;
- ETLab ID in `ADMIN_ETLAB_IDS`.

Routes:

- `GET /internal/experiments/connections`;
- `POST /internal/experiments/connections`.

## 5. Model / Embedding / ML Pipeline Analysis

### Main Backend Recommendation Logic

The main FastAPI backend does **not** currently implement embedding generation, dimensionality reduction, similarity calculation, model training, or online inference.

Current recommendation behavior is table-driven:

- `match_candidates.match_score` is read from the database;
- `shared_artists` is read as JSON from the database;
- `vibe_summary` is read from the database;
- top shared songs are computed by exact `song_id` overlap at request time;
- `profiles.vibe_profile` exists as JSONB but is reset to `{}` and never populated with features.

This means `match_candidates` is effectively an external/precomputed contract. The code assumes another process has inserted candidate rows.

### Audio Feature Extraction Pipeline

The implemented ML-adjacent pipeline is `MusicSynthesizer/music.py`.

#### Input

Rows from Supabase `songs`:

```text
id, spotify_track_id, title, artist, album, album_art, duration_ms
```

#### Lookup and Download

For each song:

1. Build query: `"{title} {artist} official audio"`.
2. Use `yt-dlp` with `ytsearch1`.
3. Use first result.
4. Download best audio unless a valid cached file exists.
5. Validate cache/downloads using:
   - `ffprobe` stream check;
   - a short `ffmpeg -t 1 -f null -` decode check.

#### Preprocessing

For each song, create a three-clip plan:

| Clip | Start |
| --- | --- |
| start | 0 seconds |
| middle | halfway minus half clip length |
| end | duration minus clip length |

If duration is missing, all clips start at 0.

Each clip is converted with ffmpeg to:

- mono;
- target sample rate, default `22050`;
- clip length, default `30` seconds;
- WAV snippet.

#### Feature Extraction

`extract_essentia_features(audio_path, sample_rate=22050)` extracts:

Rhythm/dynamics:

- `tempo_bpm`;
- `onset_rate`;
- `beat_interval_std`;
- `loudness`;
- `energy`;
- `danceability`.

Spectral/timbre:

- `spectral_flux`;
- `spectral_centroid`;
- `spectral_contrast`;
- `mfcc_1` through `mfcc_13`.

Tonal:

- `key_encoded`;
- `scale_encoded`;
- `key_strength`;
- `estimated_key`;
- `estimated_scale`.

Implementation details:

- Essentia `MonoLoader`, `RhythmExtractor2013`, `Danceability`, `Windowing`, `Spectrum`, `Centroid`, `MFCC`, `SpectralPeaks`, `HPCP`, `Key`.
- Frame size `2048`, hop size `512`.
- Spectral contrast is hand-computed over geometric frequency bands.
- HPCP average is used for key estimation.
- Essentia work is bounded by `ESSENTIA_SEMAPHORE`.

#### Aggregation

`aggregate_clip_features()` combines numeric features from clips:

- clip weights: start `0.25`, middle `0.5`, end `0.25`;
- for each numeric feature, output:
  - `{feature}_mean` weighted average;
  - `{feature}_std` standard deviation across available clips.

Non-numeric fields such as `estimated_key` are not included in aggregate output.

#### Output

Two CSVs:

- `EXPORT_CSV_PATH`, default `output/music_analysis_results.csv`;
- `SONG_NAME_EXPORT_CSV_PATH`, default `output/music_analysis_song_name_data.csv`.

Checkpoint:

- `CHECKPOINT_CSV`, default `output/music_analysis_checkpoint.csv` or `_test.csv` if `TEST_SONG_LIMIT` is set.

When `VIBE_SCORES_ONLY=true`, export keeps a fixed list of vibe score columns and identifiers.

#### Parallelism

- Downloads use `ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS)`.
- Analysis uses `ProcessPoolExecutor(max_workers=ANALYSIS_WORKERS)`.
- ffmpeg snippet creation uses a per-song `ThreadPoolExecutor`.
- Essentia extraction is bounded by semaphore, default roughly half CPU count capped by analysis workers.

#### Training/Inference Separation

No training or inference phase exists. The pipeline is feature extraction only. It does not:

- train a model;
- normalize features globally;
- scale features;
- run PCA/UMAP/t-SNE;
- compute user embeddings;
- compute song or user similarities;
- write features back into the application database.

## 6. Important Functions and Classes

### Backend Core

#### `create_application()` in `backend/app/main.py`

Purpose: construct and configure FastAPI app.

Parameters: none.

Returns: `FastAPI`.

Side effects:

- reads env settings;
- installs CORS middleware;
- registers exception handler;
- includes routers.

Potential issue: settings require Supabase and Spotify env vars, so importing app without env can fail.

#### `Settings` in `backend/app/core/settings.py`

Purpose: centralized runtime configuration.

Important properties:

- `frontend_origins`;
- `frontend_app_origin`;
- `admin_emails`;
- `admin_etlab_ids`;
- `validated_spotify_redirect_uri`.

Potential issues:

- env file tuple includes `"../env"`, likely intended to be `"../.env"` or another path;
- Google redirect URI is not validated the same way Spotify is.

#### `get_supabase_client()`

Purpose: cached service-role Supabase client.

Side effects:

- monkey-patched retry wrappers are installed at module import time.

Potential issues:

- all repository operations are privileged;
- no per-request DB client;
- service-role key must never be exposed to frontend.

### Auth and Sessions

#### `SessionService.create_session(user_id, user_agent, ip_address)`

Returns a new `app_sessions` row with a random URL-safe token and 10-year expiration.

Side effects: database insert.

Complexity: O(1).

Potential issues:

- 10-year sessions are long-lived;
- tokens are stored unhashed;
- no device/session limit.

#### `SessionService.get_active_session(session_token)`

Looks up non-revoked session and checks expiration.

Side effects: revokes expired session.

Potential issue: repository query only filters revoked status; expiration is enforced in app code.

#### `AuthService.handle_google_callback(code, state, request)`

Validates state cookie, exchanges code, fetches identity, creates session, redirects.

Side effects:

- profile create/update;
- session insert;
- cookie writes/deletes.

Security positives:

- state validation;
- next path normalization.

Limitations:

- stores no Google subject; identity is email-based only.

### Profile

#### `ProfileService.get_or_create_from_etlab_identity(identity)`

Merges by ETLab ID first, email second, then creates profile.

Side effects: insert/update `profiles`.

Potential issue: if a wrong email is returned or reused, accounts can merge by email.

#### `ProfileService._apply_admin_flag(payload)`

Adds `is_admin` when email/ETLab ID matches settings.

Potential issue: admin status is recomputed only when profile is created/updated through this path.

### Spotify

#### `SpotifyService._spotify_request()`

Purpose: common request wrapper with retry on 429.

Parameters:

- `client`, `method`, `url`;
- `retry_on_rate_limit`;
- other httpx kwargs.

Returns: `httpx.Response`.

Potential issue: only rate limits are retried, not transient network errors.

#### `SpotifyService.normalize_external_track(source_track, minimum_score=0.72)`

Purpose: map Apple/YouTube track metadata to Spotify canonical metadata when possible.

Logic:

- build query variants;
- search Spotify app catalog;
- dedupe candidates;
- score by title/artist/duration;
- return Spotify payload above threshold or source fallback.

Complexity: O(Q * S + C), where Q is query count and S/C are candidates.

Limitations:

- SequenceMatcher can be weak for multilingual/remix/live titles;
- first page of Spotify search only;
- no ISRC for Apple/YouTube unless source provides it.

#### `SpotifyService.get_playlist_tracks(user_id, playlist_id)`

Purpose: import tracks from a Spotify playlist.

Logic:

- validate linked Spotify account;
- refresh token if needed;
- fetch playlist metadata;
- page `/playlists/{id}/items`;
- fallback to nested playlist/tracks payloads;
- extract track fields;
- dedupe by Spotify ID;
- enrich missing ISRC.

Side effects: none directly, import endpoint later writes songs.

Potential issues:

- many debug logs;
- returns empty list on inaccessible/no items instead of always erroring;
- payload-shape fallback is complex and should have tests.

#### `SpotifyService.get_artist_details()` / `get_album_details()`

Purpose: Spotify browsing pages.

Side effects: external API calls and in-memory cache updates.

Limitations:

- no persistent cache;
- Last.fm context failure silently degrades.

### Onboarding

#### `OnboardingService.add_song_to_user_taste_profile(user_id, song_payload, source, refresh_vibe_profile=True)`

Purpose: insert/update catalog song and link it to user taste.

Side effects:

- `songs` upsert;
- `user_taste_songs` upsert;
- profile `vibe_profile` reset.

Potential issue: refresh is a placeholder, not a real vector update.

#### `OnboardingService.import_songs_to_user_taste_profile()`

Uses a thread pool and creates a new `OnboardingService` per song.

Potential issues:

- repeated service/repository creation;
- returns length of payloads, not number of newly inserted unique links;
- concurrent upserts depend on Supabase/PostgREST behavior and unique constraints.

### Matching

#### `MatchingService.get_current_user_match_candidates(user_id)`

Purpose: serialize discovery candidates.

Inputs: user ID.

Returns: list of `MatchCandidateResponse`.

Internal logic:

- fetch `match_candidates`;
- fetch outgoing pending statuses;
- fetch candidate profiles;
- compute first shared song by exact song ID overlap.

Complexity: O(C + C*T) because `_get_top_shared_song()` queries taste rows for each candidate. This can become slow for many candidates.

Potential issues:

- N+1 taste queries;
- no filtering for accepted/incoming requests in discovery response;
- no candidate generation.

#### `MatchRequestService.create_match_request()`

Purpose: create a pending match request with validation.

Edge cases handled:

- self request;
- missing candidate;
- already accepted;
- duplicate pending in either direction.

Potential issue: duplicate prevention partly relies on app checks plus one unique pending outgoing index; concurrent reverse requests may race.

### Audio Pipeline

#### `fetch_all_songs(supabase_client, page_size=500)`

Purpose: page through the `songs` table.

Complexity: O(N) rows and O(N/page_size) requests.

Potential issue: reads only song catalog, not user taste links or analysis storage.

#### `find_youtube_video(query, cookies_file=None)`

Purpose: first YouTube search result.

Potential issues:

- no confidence scoring;
- can select wrong video;
- YouTube/yt-dlp behavior is unstable by nature.

#### `download_youtube_audio(youtube_id, ...)`

Purpose: cache-aware audio download.

Side effects:

- creates temp work dir;
- reads/writes `tmp/cache`;
- uses network unless `CACHE_ONLY_AUDIO=true`.

Edge cases handled:

- validates cached files;
- skips `.part` files;
- can use hardlinks for cache materialization.

#### `extract_essentia_features(audio_path, sample_rate)`

Purpose: per-clip feature extraction.

Complexity: roughly O(number of audio frames * spectral/MFCC/HPCP work).

Potential issues:

- Essentia exceptions are caught only at higher level;
- danceability failures yield NaN;
- key encoding loses circular nature of key.

#### `main()` in `MusicSynthesizer/music.py`

Purpose: full feature extraction run.

Side effects:

- network requests to Supabase/YouTube;
- creates/deletes temp dirs;
- writes checkpoints and export CSVs;
- emits status callbacks.

Potential issues:

- `STATUS_CALLBACK = None` assignment near the end is local, not global;
- result rows with errors remain in checkpoint, but `load_checkpoint()` only treats successful rows as completed and retries failed rows.

## 7. Database / Storage Analysis

### Tables

#### `profiles`

Stores application users.

Columns:

- `id uuid primary key`;
- `etlab_id text unique`;
- `email text not null unique`;
- `name text not null`;
- `register_number text unique`;
- `date_of_birth text`;
- `etlab_verified boolean default false`;
- `avatar_url text`;
- `vibe_profile jsonb default '{}'`;
- `onboarding_completed boolean default false`;
- `spotify_connected boolean default false`;
- `is_admin boolean default false`;
- timestamps.

Relationships:

- referenced by sessions, taste songs, Spotify account, match candidates, requests, accepted matches, interactions, experimental connections.

#### `app_sessions`

Stores session tokens.

Columns:

- `session_token text unique`;
- `user_id -> profiles.id`;
- `user_agent`;
- `ip_address inet`;
- `expires_at`;
- `revoked_at`;
- `created_at`.

Indexes:

- token;
- user.

#### `songs`

Global canonical song catalog.

Columns:

- `canonical_key text unique not null`;
- `spotify_track_id text nullable unique when not null`;
- `canonical_source text default spotify`;
- `isrc`;
- title/artist/album/art/explicit/duration;
- `added_at`.

Canonicalization:

- Spotify tracks use `spotify:{track_id}`;
- non-Spotify fallback uses SHA1 of title/artist/album/duration.

#### `user_taste_songs`

Join table for user taste profiles.

Columns:

- `user_id -> profiles`;
- `song_id -> songs`;
- `source text default manual`;
- `created_at`;
- unique `(user_id, song_id)`.

#### `spotify_accounts`

Stores linked Spotify account and tokens.

Columns:

- `user_id unique -> profiles`;
- `spotify_user_id unique`;
- display name;
- access token;
- refresh token;
- scope/type/expires;
- created timestamp.

Security issue: tokens are plaintext.

#### `match_candidates`

Precomputed discovery candidates.

Columns:

- `user_id`;
- `candidate_user_id`;
- `match_score numeric(5,4)`;
- `shared_artists jsonb`;
- `vibe_summary`;
- timestamps;
- unique `(user_id, candidate_user_id)`;
- check users differ.

No writer exists in current backend.

#### `match_requests`

Pending/accepted/declined request records.

Columns:

- requester/recipient profile FKs;
- optional `match_candidate_id`;
- copied score/shared artists/vibe summary;
- status check pending/accepted/declined;
- created/responded timestamps.

Unique partial index:

- unique pending `(requester_id, recipient_id)`.

#### `accepted_matches`

Accepted pair rows.

Columns:

- unique request ID;
- `user_a_id`, `user_b_id`;
- copied score/shared artists/vibe summary;
- accepted timestamp.

Unique expression index:

- unordered pair uniqueness via `least(user_a_id::text, user_b_id::text)` and `greatest(...)`.

#### `song_interactions`

Songs sent between accepted matches.

Columns:

- accepted match ID;
- sender;
- receiver;
- song;
- reaction check like/dislike;
- created/reacted timestamps.

#### `internal_experimental_connections`

Admin-created experimental relationship rows.

Columns:

- owner user;
- other user;
- type/status;
- metadata JSONB;
- created timestamp.

### RLS

`schema.sql` enables row-level security on all tables but defines no policies. Since the backend uses a service role key, API access still works. Direct client access using anon/authenticated Supabase clients would be blocked unless policies are added elsewhere.

### Indexing

Indexes exist for:

- session token/user;
- taste song lookup;
- song album/canonical/Spotify ID;
- match candidate user/candidate;
- match request requester/recipient/candidate;
- accepted match sides and unordered pair;
- song interaction match/sender/receiver/song;
- experimental connection owner/other.

Missing potentially useful indexes:

- `songs(isrc)` if ISRC search/dedupe is added;
- `songs(title, artist)` for catalog search;
- `match_requests(recipient_id, status, created_at desc)`;
- `match_requests(requester_id, status, created_at desc)`;
- `song_interactions(accepted_match_id, receiver_id, created_at desc)`.

### Serialization Formats

- API responses are JSON, mostly camelCase.
- DB JSONB fields:
  - `profiles.vibe_profile`;
  - `match_candidates.shared_artists`;
  - `match_requests.shared_artists`;
  - `accepted_matches.shared_artists`;
  - `internal_experimental_connections.metadata`.
- Audio pipeline output is CSV.

## 8. API Documentation

Base prefix: `/api/v1`.

Authentication:

- Session cookie: `vyne_session`, HTTP-only.
- Fallback: `Authorization: Bearer <session_token>`.
- Most app routes require `get_current_user`.
- Discovery/match/request routes require `require_etlab`, meaning `profile.etlab_verified=true`.
- Internal routes require admin.

Error handling:

- services raise `HTTPException` with JSON `{"detail": ...}`;
- global `httpx.RequestError` handler returns 503;
- frontend `api.ts` throws `Error(body.detail ?? API error status)`.

### Health

#### `GET /health`

Response:

```json
{ "status": "ok" }
```

### Auth

#### `GET /auth/session`

Returns current session if valid.

Response:

```json
{
  "authenticated": true,
  "session": {
    "id": "uuid",
    "expiresAt": "datetime",
    "createdAt": "datetime"
  },
  "profile": {}
}
```

Unauthenticated response:

```json
{ "authenticated": false, "profile": null, "session": null }
```

#### `GET /auth/google/start?next_path=/path`

Sets OAuth state cookies.

Response:

```json
{ "authorizationUrl": "https://accounts.google.com/...", "state": "..." }
```

#### `GET /auth/google/callback?code=&state=`

Validates state, creates session, redirects to frontend. Response is 302.

#### `GET /auth/etlab/start?next_path=/path`

Sets ETLab state cookie.

Response:

```json
{ "authorizationUrl": "https://sctce.etlab.in/androidapp/oauth/authorize?...", "state": "..." }
```

#### `POST /auth/etlab/login`

Request:

```json
{ "username": "string", "password": "string" }
```

Response: `AuthSessionResponse`.

#### `GET /auth/etlab/callback?code=&state=`

Response: `AuthSessionResponse`.

#### `POST /auth/logout`

Requires auth.

Response:

```json
{ "message": "Logged out successfully." }
```

### Profile

#### `GET /profile/me`

Requires auth.

Response: `ProfileResponse`.

#### `PATCH /profile/me`

Request:

```json
{ "name": "New Name", "avatarUrl": "https://..." }
```

Response: `ProfileResponse`.

### ETLab Verification

#### `POST /verify/etlab`

Requires auth.

Request:

```json
{ "username": "string", "password": "string", "dob": "string" }
```

Response: verified `ProfileResponse`.

### Onboarding

#### `GET /onboarding/state`

Requires auth.

Response:

```json
{
  "onboardingCompleted": false,
  "spotifyConnected": false,
  "tasteSongCount": 0,
  "vibeProfile": {},
  "tasteSongs": []
}
```

#### `POST /onboarding/songs`

Requires auth.

Request:

```json
{
  "song": {
    "spotifyTrackId": "track-id",
    "canonicalSource": "spotify",
    "isrc": "US...",
    "title": "Song",
    "artist": "Artist",
    "album": "Album",
    "albumArt": "https://...",
    "explicit": false,
    "durationMs": 123000
  },
  "source": "manual"
}
```

Response: `TasteSongResponse`.

#### `DELETE /onboarding/songs/{song_id}`

Requires auth. Returns 204.

#### `POST /onboarding/playlist-links/import`

Requires auth.

Request:

```json
{ "inputText": "https://music.apple.com/..." }
```

Response:

```json
{
  "detectedPlatform": "apple_music",
  "imported": 10,
  "spotifyNormalized": 8,
  "sourceFallbacks": 2
}
```

#### `POST /onboarding/complete`

Requires auth.

Response:

```json
{ "onboardingCompleted": true, "minimumSeedMet": true }
```

Errors with 400 if not Spotify-connected and fewer than 5 taste songs.

### Spotify

#### `GET /spotify/connect`

Requires auth. Sets Spotify state cookie.

Response:

```json
{ "authorizationUrl": "https://accounts.spotify.com/authorize?...", "state": "..." }
```

#### `GET /spotify/callback?state=&code=`

Requires existing app session cookie. Redirects to frontend.

#### `GET /spotify/playlists?limit=10`

Requires auth and linked Spotify.

Response:

```json
{
  "items": [
    { "id": "playlist-id", "name": "Playlist", "image_url": "https://..." }
  ]
}
```

Note: this endpoint returns snake_case `image_url`, not camelCase, because it does not use a Pydantic response model.

#### `GET /spotify/search?q=&search_type=all`

Requires auth and linked Spotify.

Search type: `all`, `track`, `artist`, `album`.

Response:

```json
{ "items": [] }
```

Item shape varies by `kind`.

#### `GET /spotify/artists/{artist_id}`

Requires auth and linked Spotify.

Response contains artist profile, Last.fm enrichment, top tracks, albums.

#### `GET /spotify/artists/{artist_id}/similar`

Requires auth and linked Spotify.

Response:

```json
{ "items": [] }
```

#### `GET /spotify/albums/{album_id}`

Requires auth and linked Spotify.

Response contains album metadata and tracks.

#### `POST /spotify/playlists/{playlist_id}/import`

Requires auth and linked Spotify.

Response:

```json
{ "imported": 25 }
```

#### `POST /spotify/top-tracks/import`

Requires auth and linked Spotify. Imports up to 25 medium-term top tracks.

Response:

```json
{ "imported": 25 }
```

#### `POST /spotify/liked-songs/import`

Requires auth and linked Spotify. Imports up to 25 saved tracks.

Response:

```json
{ "imported": 25 }
```

### Discovery

#### `GET /discovery/candidates`

Requires ETLab verification.

Response: list of `MatchCandidateResponse`.

#### `GET /discovery/candidates/{candidate_user_id}`

Requires ETLab verification.

Response: `MatchCandidatePreviewResponse`.

#### `POST /discovery/requests`

Requires ETLab verification.

Request:

```json
{ "candidateUserId": "uuid" }
```

Response: `MatchRequestResponse`.

### Requests

#### `GET /requests/incoming`

Requires ETLab verification. Response: `MatchRequestResponse[]`.

#### `GET /requests/outgoing`

Requires ETLab verification. Response: `MatchRequestResponse[]`.

#### `POST /requests/{request_id}/accept`

Requires ETLab verification and recipient ownership.

Response:

```json
{ "id": "request-id", "status": "accepted", "acceptedMatchId": "uuid" }
```

#### `POST /requests/{request_id}/decline`

Requires ETLab verification and recipient ownership.

Response:

```json
{ "id": "request-id", "status": "declined", "acceptedMatchId": null }
```

### Matches

#### `GET /matches`

Requires ETLab verification. Response: `AcceptedMatchResponse[]`.

#### `GET /matches/verify/{other_user_id}`

Requires ETLab verification.

Response:

```json
{
  "otherUserId": "uuid",
  "isAcceptedMatch": true,
  "acceptedMatchId": "uuid"
}
```

#### `GET /matches/{match_id}`

Requires ETLab verification and match membership.

Response: `AcceptedMatchResponse`.

#### `POST /matches/{match_id}/songs`

Requires ETLab verification and match membership.

Request:

```json
{ "song": { "title": "Song", "artist": "Artist" } }
```

Response: `SongInteractionResponse`.

#### `GET /matches/{match_id}/songs/received`

Requires ETLab verification and match membership.

Response: `SongInteractionResponse[]`.

#### `POST /matches/songs/{interaction_id}/reaction`

Requires ETLab verification and receiver ownership.

Request:

```json
{ "reaction": "like" }
```

Response: `SongInteractionResponse`.

### Internal

Base prefix: `/internal`.

#### `GET /experiments/connections`

Requires admin. Response: `ExperimentalConnectionResponse[]`.

#### `POST /experiments/connections`

Requires admin.

Request:

```json
{
  "otherUserId": "uuid",
  "type": "direct",
  "status": "active",
  "metadata": {}
}
```

Response: `ExperimentalConnectionResponse`.

## 9. Configuration & Environment

### Backend Environment Variables

From `.env.example` and `Settings`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Backend service-role database access |
| `SPOTIFY_CLIENT_ID` | yes | Spotify OAuth/API |
| `SPOTIFY_CLIENT_SECRET` | yes | Spotify OAuth/API |
| `SPOTIFY_REDIRECT_URI` | default | Spotify callback URL |
| `LASTFM_API_KEY` | optional | Artist bio/tags/similar enrichment |
| `YOUTUBE_API_KEY` | optional | YouTube playlist imports |
| `GOOGLE_CLIENT_ID` | optional | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | optional | Google OAuth |
| `GOOGLE_REDIRECT_URI` | default | Google callback URL |
| `ETLAB_REDIRECT_URI` | default | ETLab callback URL |
| `ETLAB_SKIP_SSL_VERIFY` | default false | Disable ETLab TLS verification |
| `ETLAB_MOCK_MODE` | default false | Mock ETLab identities |
| `SESSION_COOKIE_SECURE` | default false | Secure session cookie flag |
| `FRONTEND_ORIGIN` | default localhost | CORS and redirect origin(s) |
| `ADMIN_EMAILS` | optional | Comma-separated admin emails |
| `ADMIN_ETLAB_IDS` | optional | Comma-separated admin ETLab IDs |
| `HTTP_TIMEOUT_SECONDS` | default 10 | External request timeout |

### Frontend Config

`frontend/src/lib/settings.ts` sets:

```ts
apiBaseUrl: '/api/v1'
```

`frontend/vite.config.ts`:

- aliases `@` to `src`;
- proxies `/api` to `http://127.0.0.1:8000`;
- dev server at `127.0.0.1:5173`;
- `envDir: '../'`;
- custom plugin repairs empty optimized dependency sourcemaps during dev.

### MusicSynthesizer Config

`MusicSynthesizer/app.py` exposes editable config fields including:

- `SUPABASE_URL`;
- `SUPABASE_KEY`;
- `TEST_SONG_LIMIT`;
- `PAGE_SIZE`;
- `DOWNLOAD_WORKERS`;
- `ANALYSIS_WORKERS`;
- `FFMPEG_WORKERS`;
- `ESSENTIA_WORKERS`;
- `CLIP_SECONDS`;
- `TARGET_SAMPLE_RATE`;
- `SAVE_EVERY`;
- `DOWNLOAD_RETRIES`;
- `ANALYSIS_REDOWNLOAD_RETRIES`;
- CSV output paths;
- `YT_COOKIES_FILE`;
- log/tqdm/cache toggles;
- `VIBE_SCORES_ONLY`.

Security concern: `MusicSynthesizer/config.json` currently contains a concrete Supabase URL and anon key. Even anon keys are normally public-ish in Supabase, but committing environment-specific credentials is risky and should be replaced with an example file.

### Build/Run

Frontend:

```bash
cd frontend
pnpm dev
pnpm build
```

Backend:

```bash
cd backend
make run
```

No `backend/Makefile` was present in the file listing, so this README/AGENTS instruction may be stale. A likely direct command would be `uvicorn backend.app.main:app --reload` from repo root if dependencies and env are set.

MusicSynthesizer:

```bash
cd MusicSynthesizer
env/bin/python desktop.py
```

External runtime requirements:

- ffmpeg and ffprobe on PATH;
- network access for Supabase, YouTube, Spotify, Google, ETLab, Last.fm as relevant.

## 10. Dependency Analysis

### Backend `requirements.txt`

The exact backend requirements file should be reviewed before deployment, but the code imports:

- `fastapi`;
- `uvicorn`;
- `pydantic`;
- `pydantic-settings`;
- `supabase`;
- `postgrest`;
- `httpx`;
- `python-dotenv`.

Critical dependencies:

- Supabase/PostgREST client: every persistence operation depends on it.
- httpx: all external integrations depend on it.
- FastAPI/Pydantic: API contract.

Risks:

- Supabase Python client internals are subclassed (`supabase._sync.client.SyncClient`) and PostgREST execute methods are monkey-patched. Private/internal APIs can break across dependency upgrades.
- OAuth and token handling are custom rather than using a hardened auth framework.

### Frontend `package.json`

Important versions:

- React `^18.3.1`;
- Vite `^5.3.1`;
- TypeScript `^5.2.2`;
- React Query `^5.40.0`;
- Zustand `^4.5.2`;
- Framer Motion `^11.2.10`;
- Tailwind `^3.4.4`.

Potentially stale/risky:

- ESLint `8.57.0` is end-of-life in the ESLint 8 line.
- Vite 5 is no longer the latest major in 2026.
- TypeScript 5.2 is old relative to current versions.

These are not immediate correctness bugs, but upgrades should be planned with lockfile review.

### MusicSynthesizer

Critical dependencies:

- `essentia` can be difficult to install and platform-sensitive.
- `yt-dlp` requires frequent updates because YouTube changes behavior.
- `ffmpeg` is a system dependency not listed in Python requirements.

Risks:

- audio pipeline relies on unofficial YouTube extraction;
- local `env/`, `tmp/`, and output artifacts are present in the repo tree and should generally be ignored/excluded.

## 11. Execution Flow

### Backend Startup

1. ASGI server imports `backend.app.main:app`.
2. `create_application()` calls `get_settings()`.
3. Settings validate required env.
4. CORS middleware is installed.
5. Global upstream request exception handler is registered.
6. Public and internal routers are mounted.
7. Route modules instantiate service singletons at import time.
8. Service constructors instantiate repositories and cached Supabase client.

Important consequence: missing env can break import/startup before any request is served.

### Frontend Startup

1. `ReactDOM.createRoot` renders `BootRoot`.
2. `configureApiToken()` wires API token getter.
3. Auth store `initialize()` calls `/auth/session`.
4. App and route preloader are dynamically imported.
5. Current route component is preloaded.
6. Login images are preloaded if current path is `/login`.
7. App router is rendered.
8. AuthGuard enforces:
   - not initialized: render nothing;
   - unauthenticated: `/login`;
   - authenticated without onboarding: `/onboarding`;
   - otherwise: children.

### User Request Lifecycle Example: Add Song

1. User types in Add Songs.
2. Debounced effect calls `/spotify/search`.
3. User clicks Add.
4. React Query mutation optimistically updates `TASTE_QUERY_KEY`.
5. Backend upserts into `songs`, upserts relation into `user_taste_songs`, resets `vibe_profile`.
6. Mutation success invalidates taste query.
7. My Vibes/Profile pick up shared cache updates.

### Background Import Flow

Onboarding page starts top tracks/liked songs/playlist imports without waiting:

1. Sets localStorage import status to `pending`.
2. Fires API request.
3. On promise resolution, writes `success` or `error`.
4. My Vibes reads and displays the status.

There is no backend job queue; these are normal HTTP requests from the browser. If the browser is closed or network disconnects, behavior depends on request completion.

### MusicSynthesizer Runtime

1. Flask serves UI on `127.0.0.1:5123`.
2. User loads songs.
3. Flask starts subprocess with env injected as `MUSICSYNTH_CONFIG_JSON`.
4. Subprocess imports `music.py`, applies env, fetches Supabase songs, emits status lines.
5. Flask parses `__STATUS__|...` lines and updates in-memory `PipelineState`.
6. Browser polls `/api/progress` every second.
7. Processing starts another subprocess and follows the same status mechanism.

## 12. Current Implementation Status

### Completed / Mostly Working

- FastAPI app scaffolding.
- Supabase schema for core entities.
- Session-based authentication.
- Google OAuth.
- ETLab credential login and verification.
- Spotify OAuth/token refresh.
- Manual song search/add via Spotify.
- Spotify playlist/top-track/liked-song imports.
- Apple Music and YouTube playlist link ingestion.
- Song catalog canonical-key upsert.
- Onboarding gate and completion rule.
- Reading discovery candidates.
- Match request lifecycle.
- Accepted match lifecycle.
- Song sharing/reaction storage.
- Local audio feature extraction pipeline and UI.

### Partially Implemented

- Matching/recommendation: DB read path exists; candidate generation does not.
- `vibe_profile`: schema field exists but backend writes `{}` only.
- Frontend Match Requests, Match Profile, Leaderboard pages appear incomplete/placeholders relative to backend capabilities.
- Admin internal experiments exist but no frontend/admin UI is present.
- Spotify/Last.fm enrichment is functional but best-effort and not cached persistently.

### TODOs / Dead Code / Experimental Sections

Observed issues:

- `MusicSynthesizer/app.py` has duplicate unreachable `return read_json_file(CONFIG_FILE, defaults)` after an earlier return in `load_config()`.
- `MusicSynthesizer/music.py` sets `STATUS_CALLBACK = None` inside `main()` without declaring global; this does not clear the module global.
- `frontend/src/lib/types.ts` defines idealized domain types, including `vibeVector`, that do not match current backend behavior.
- `frontend/src/types/match.ts` uses status `'rejected'`, while backend uses `'declined'`.
- `frontend/dist/`, `frontend/node_modules/`, `MusicSynthesizer/env/`, `MusicSynthesizer/tmp/`, and generated CSV/audio artifacts are present locally and should not be treated as source.
- `backend/README.md` says copy `backend/.env.example`, but only root `.env.example` was found.
- AGENTS/README mention `make run`, but no backend `Makefile` was found in the file listing.

### Missing Integrations

- No code writes audio features from `MusicSynthesizer/output` back into Supabase.
- No `song_features` table exists in `schema.sql`.
- No user embedding/profile generation exists.
- No candidate generation job exists.
- No scheduled/background worker infrastructure exists.
- No test suite was found.

## 13. Code Quality Review

### Architecture Quality

Strengths:

- Clear backend layering: routes -> services -> repositories.
- Pydantic response models for most endpoints.
- Frontend uses React Query and shared query keys well for taste data.
- Service logic is readable and mostly organized by domain.
- Database schema has sensible constraints and indexes for core flows.

Weaknesses:

- Services instantiate dependencies directly, reducing testability.
- Backend uses Supabase service role for all operations, making route-level auth the only protection.
- Matching domain is mostly storage/read logic, not actual recommendation logic.
- Main app and audio pipeline are disconnected.
- Some API shapes are inconsistent camelCase vs snake_case.

### Scalability

Potential bottlenecks:

- Discovery computes shared songs with per-candidate taste queries.
- Bulk imports create a new service instance per song.
- Spotify import/search relies on synchronous httpx in FastAPI routes, blocking worker threads.
- No background queue for long imports.
- No pagination on taste song list, candidates, matches, requests.
- Audio pipeline is local/offline and not production-integrated.

### Maintainability

Good:

- Functions are named clearly.
- Repository classes keep database operations discoverable.
- Most error cases return explicit HTTP statuses.

Needs improvement:

- Add tests around Spotify playlist payload variants, request race cases, and playlist link parsing.
- Replace debug prints with structured logging.
- Introduce dependency injection or factory pattern for service repositories.
- Align frontend domain types with backend schemas.
- Split large `SpotifyService` into OAuth, catalog, import, and enrichment modules.

### Performance

Backend:

- Many database operations are O(N) and unpaginated.
- Candidate shared song computation is N+1.
- Playlist normalization can call Spotify search once or twice per imported track.

Frontend:

- Boot preloading improves perceived startup.
- React Query cache avoids duplicate taste fetches.
- Some pages define local interfaces repeatedly rather than sharing generated types.

Audio:

- Parallelism is reasonably designed.
- ffmpeg/Essentia workload can still be CPU-heavy.
- Cache validation is robust but adds ffprobe/ffmpeg overhead.

### Security Concerns

High-priority:

- `MusicSynthesizer/config.json` contains real-looking Supabase project URL and anon key.
- Spotify access and refresh tokens are stored plaintext.
- Session tokens are stored plaintext and valid for 10 years.
- Backend uses service role key globally; any authorization bug can expose/modify all data.

Medium-priority:

- ETLab credentials pass through backend.
- Optional ETLab SSL verification disable flag.
- Debug logs may include upstream response bodies.
- No CSRF protection beyond SameSite Lax for cookie-authenticated mutating requests.
- No rate limiting on login/import endpoints.

### Error Handling Quality

Good:

- External API failures usually produce explicit HTTP statuses.
- Spotify rate limiting is handled.
- PostGREST transient errors have retry wrappers.
- Playlist link import validates unsupported/malformed links.

Gaps:

- Some frontend pages only log errors or show generic messages.
- Import endpoints do not expose partial failure detail.
- No centralized logging/tracing.
- No typed error envelope beyond `detail`.

## 14. Recommendations

### Refactoring

1. Split `SpotifyService` into:
   - `SpotifyOAuthService`;
   - `SpotifyCatalogService`;
   - `SpotifyImportService`;
   - `ArtistEnrichmentService`.
2. Inject repositories/services instead of constructing them inside every service.
3. Add a service factory for request-scoped dependencies.
4. Standardize all API response field naming through Pydantic models.
5. Move repeated frontend interfaces into shared generated or manually maintained API types.

### Matching and ML Improvements

1. Add `song_audio_features` table for MusicSynthesizer outputs.
2. Add `user_taste_vectors` table or populate `profiles.vibe_profile` with actual vector metadata.
3. Create a candidate generation job:
   - aggregate each user's song vectors;
   - normalize/scalefit features;
   - compute cosine similarity;
   - identify shared artists/songs;
   - write bidirectional `match_candidates`.
4. Use robust feature preprocessing:
   - impute NaNs;
   - standardize numeric features;
   - handle circular key encodings with sine/cosine;
   - cap or transform heavy-tailed features like spectral centroid/loudness.
5. Add explainability fields:
   - top shared artists;
   - top shared tracks;
   - taste dimensions such as tempo/energy/danceability deltas.
6. Separate offline training/feature extraction from online inference.

### Embedding Pipeline Improvements

1. Persist song-level features to DB instead of CSV only.
2. Add idempotent import from CSV to Supabase.
3. Track feature version and extraction parameters.
4. Store source YouTube confidence and allow manual correction.
5. Avoid first-result-only YouTube matching; add title/artist/duration scoring.
6. Add global scaler metadata for reproducible embeddings.
7. Add tests for aggregation and feature schema stability.

### Performance

1. Batch taste song reads in `MatchingService`.
2. Add pagination to candidates, taste songs, requests, and matches.
3. Move long imports to background jobs.
4. Add persistent cache for Last.fm artist context.
5. Reuse Spotify app token across service instances more deliberately.
6. Add DB indexes for request status/time and interactions receiver/time.

### Security

1. Remove committed local config secrets and add `config.example.json`.
2. Encrypt Spotify tokens at rest or store through a secret manager.
3. Hash session tokens in DB.
4. Reduce session lifetime and add session rotation.
5. Add CSRF protection for cookie-authenticated mutations.
6. Add rate limits to auth and import endpoints.
7. Avoid logging upstream response bodies with sensitive content.
8. Verify Supabase RLS policies if any frontend direct Supabase access is planned.

### Testing

Add backend tests for:

- auth state validation and next path normalization;
- session expiration/revocation;
- profile merge behavior;
- song canonicalization and duplicate imports;
- Spotify normalization scoring;
- playlist parsing;
- match request conflicts;
- accepted match authorization;
- song reaction authorization.

Add frontend tests for:

- AuthGuard routing;
- onboarding completion states;
- optimistic add/delete rollback;
- import status display;
- Spotify search result actions.

Add pipeline tests for:

- clip plan generation;
- checkpoint load/save;
- aggregation math;
- invalid cache handling;
- CSV schema.

### Documentation

1. Add a backend `.env.example` or fix README to point to root `.env.example`.
2. Document `match_candidates` producer expectations.
3. Document database migration process.
4. Add API examples for each frontend-used endpoint.
5. Add a data dictionary for `shared_artists` JSON shape.
6. Add operational docs for MusicSynthesizer and how outputs are used.

## 15. Textual Architecture Diagrams

### Main App Component Dependency

```text
pages/*.tsx
  -> services/api.ts
  -> FastAPI route modules
  -> service classes
  -> repository classes
  -> Supabase/PostgREST
```

### Auth/Data Gate

```text
BootRoot
  -> authStore.initialize()
  -> /auth/session
  -> AuthGuard
       unauthenticated -> /login
       no onboarding -> /onboarding
       ready -> AppLayout + protected routes
```

### Candidate Lifecycle

```text
external/precomputed process (missing)
  -> match_candidates
  -> /discovery/candidates
  -> /discovery/requests
  -> match_requests
  -> /requests/{id}/accept
  -> accepted_matches
```

### Audio Feature Pipeline

```text
songs table
  -> YouTube search
  -> audio download/cache
  -> start/middle/end snippets
  -> Essentia features
  -> weighted aggregate
  -> checkpoint/results CSV
  -> currently no app DB writeback
```

## 16. Key Assumptions and Uncertainties

- The code assumes `match_candidates` are generated elsewhere, but no generator exists in the repository.
- The code assumes Supabase service-role access is available to the backend at runtime.
- The code assumes ETLab payloads may vary and handles several wrapper keys, but actual ETLab API contract is not documented here.
- The audio feature pipeline appears intended to support matching, but there is no direct integration.
- The frontend routes for requests/match profile/leaderboard may be in-progress despite backend support.
- Some docs refer to backend Makefile and backend `.env.example`, but these files were not found.

## 17. Onboarding Notes for New Developers

Start by understanding these paths:

1. `backend/app/main.py` for API startup.
2. `backend/app/api/router.py` for route groups.
3. `backend/app/services/onboarding_service.py` for taste profile writes.
4. `backend/app/services/spotify_service.py` for the largest integration surface.
5. `backend/app/services/matching_service.py` and `match_request_service.py` for discovery/request behavior.
6. `backend/sql/schema.sql` for the actual data model.
7. `frontend/src/main.tsx`, `router/index.tsx`, and `store/authStore.ts` for frontend boot/auth flow.
8. `frontend/src/pages/OnboardingPage.tsx`, `AddSongsPage.tsx`, `MyVibesPage.tsx`, `DiscoveryPage.tsx` for primary UX.
9. `MusicSynthesizer/music.py` for audio feature extraction.

The most important redesign question is how to connect music taste data to actual matching:

```text
user_taste_songs + songs + audio features
  -> user vectors / embeddings
  -> candidate generation
  -> match_candidates
  -> frontend discovery
```

Until that path exists, the product can collect taste and display seeded matches, but it cannot independently recommend new matches from user listening data.
