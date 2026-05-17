# CampusBeats Database Schema

For a fresh database, apply `schema.sql` before starting the API.

```bash
psql "$DATABASE_URL" -f backend/sql/schema.sql
```

`nuke.sql` is a destructive local reset helper. It drops the normalized schema objects and the shared `set_updated_at()` function.

## Schema Direction

The schema is normalized around these boundaries:

| Area | Tables |
| --- | --- |
| Users and auth | `profiles`, `app_sessions` |
| Provider accounts | `music_provider_accounts` |
| Music catalog | `artists`, `artist_external_ids`, `albums`, `album_artists`, `songs`, `song_artists`, `song_external_ids` |
| Audio features | `song_audio_features` |
| User taste | `user_taste_songs`, `user_taste_vectors` |
| Matching | `match_candidates`, `match_candidate_shared_artists`, `match_candidate_shared_songs`, `match_requests`, `accepted_matches` |
| Song exchange | `song_interactions` |

Removed from the previous schema:

- `user_identities` and `student_verifications` (merged back into `profiles` as single source of truth);
- `date_of_birth` and its hashes (purged for privacy reasons);
- `profiles.vibe_profile`, replaced by `user_taste_vectors`;
- `profiles.spotify_connected`, derived from `music_provider_accounts`;
- denormalized song columns `artist`, `album`, and `album_art`;
- Spotify-only `spotify_accounts`, replaced by provider-neutral `music_provider_accounts`;
- duplicated match explanation JSON on request/accepted-match rows;
- `internal_experimental_connections`.

## Song Features

`song_audio_features` stores the output of the audio feature pipeline. It keeps typed columns for the current matching feature set, array columns for MFCC means/stds, `feature_vector` for model input, and `raw_features` for full extractor payloads.

The table is versioned by `(song_id, extractor, feature_version, clip_strategy)` so features can be regenerated without ambiguity when extraction logic changes.

## Compatibility View

`song_catalog_view` reconstructs the old song shape:

- `spotify_track_id`;
- `canonical_source`;
- `artist`;
- `album`;
- `album_art`;
- `added_at`.

This is a read model to help migrate API code gradually. Writes should target the normalized tables directly.

## Backend Compatibility Notes

The backend repositories have been migrated to the normalized layout while keeping the public API mostly stable for the current frontend:

- profile responses still expose `name`, `etlabVerified`, and `spotifyConnected`, derived from normalized tables;
- Spotify account code still uses the `SpotifyAccountsRepository` class name, but it stores rows in `music_provider_accounts`;
- song writes upsert normalized artists, albums, external IDs, and relationships;
- song reads use `song_catalog_view` for the old flat shape;
- matching responses derive score and shared artists from `match_candidates` and the normalized explanation tables.

New code should write to normalized tables directly and use `song_catalog_view` only as a read model.
