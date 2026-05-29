# Database Schema Analysis

This document contains the current database schema. We will use this to track which tables and columns to keep, delete, or modify.

## Changes & Justifications

### 1. `profiles` Table
**Modifications:**
- **Removed:** `etlab_payload`, `etlab_verified_at`, `updated_at`, `onboarding_completed`, `is_admin`, `register_number`
- **Added:** `academic_year` (text), `etlab_verified` (boolean)
**Justification:** We only need to login via ETLab once so keeping the full `etlab_payload` is unnecessary. We just need the student's `academic_year` which is obtained during verification. `etlab_verified` provides a simpler boolean check for verification status. Other metadata fields were removed to simplify the profile.

### 2. `music_provider_accounts` Table
**Modifications:**
- **Removed:** `scope`, `updated_at`
**Justification:** The `scope` is already handled during the Spotify sign-up flow, so it doesn't need to be persisted here. `updated_at` is redundant. One user can indeed have multiple providers (e.g., Spotify, Apple Music), which is enforced by the existing unique constraints on `(user_id, provider)`.

### 3. Catalog Tables
**Modifications:**
- **Removed:** `artists`, `artist_external_ids`, `albums`, `album_artists`, `song_artists`, `song_external_ids`
- **Consolidated into:** `songs` and `song_audio_features`
- **Songs Table Removed:** `updated_at`, `provider`, `provider_url`
**Justification:** A fully normalized music catalog is over-engineered for our current needs. By flattening artist, album, and external provider IDs directly into the `songs` table, we drastically reduce join complexity and database size while preserving the essential metadata needed for features and user tastes. `updated_at` was removed from the songs table as song metadata generally doesn't change after creation. `provider` was removed since Spotify will be the exclusive music data source, making this column redundant. `provider_url` was removed because it can be easily constructed dynamically on the frontend using the `provider_song_id`.

### 4. `song_audio_features` Table
**Modifications:**
- **Removed:** `tempo_bpm_std`, `onset_rate_std`, `beat_interval_std_mean`, `beat_interval_std_std`, `loudness_std`, `energy_std`, `danceability_std`, `spectral_flux_std`, `spectral_centroid_std`, `spectral_contrast_std`, `mfcc_stds`, `key_strength_std`, `scale_encoded_std`, `raw_features`, `computed_at`
**Justification:** The standard deviation values are rarely used directly for analytics or the application UI. The mean values and the 48-dimensional feature vector provide enough data context. Removing them simplifies the schema and saves significant column space. `raw_features` was also removed to save storage space, relying solely on the extracted vector for matching. `computed_at` was removed since `created_at` serves a similar purpose.
> **Note on Dimensionality:** The `feature_vector` is the mathematical array actually used by the matching algorithms. Removing the `_std` database columns saves storage space. However, if the backend ML script is also updated to stop calculating standard deviations entirely, the resulting `feature_vector` array length will shrink from 48 dimensions down to roughly 24 dimensions. If so, the dimension constraint on `user_taste_vectors` must be updated to match the new size.

### 5. `user_taste_songs` Table
**Modifications:**
- **Removed:** `source`, `weight`, `updated_at`
**Justification:** A simple association between a user and a song is sufficient. If a user likes a song, it gets added. We don't need to overcomplicate the algorithm by applying custom weights or tracking the source of the addition (e.g., Spotify sync vs manual). Since the record won't be updated after creation, `updated_at` is unnecessary.

### 6. `user_taste_vectors` Table
**Modifications:**
- **Removed:** `summary`, `computed_at`, `feature_version`
- **Modified:** `vector` made nullable
**Justification:** The `vector` array itself is the core data point needed for matching. A secondary JSON `summary` adds unnecessary database bloat. `computed_at` was removed since `created_at` adequately covers timestamping. `feature_version` was removed as we intend to stick to a standardized ML model version rather than juggling multiple schemas. The `vector` column was made nullable because if a user's songs are still queued to be analyzed by the backend ML pipeline, their taste vector cannot be calculated yet and will temporarily be null.

### 7. `match_candidates` Table
**Modifications:**
- **Removed:** `feature_version`, `generated_at`, `updated_at`, `rank`
**Justification:** The matching logic is based on a similarity score using overlapping songs and artists. `feature_version` is no longer needed since we are using a unified model approach. `generated_at` is entirely redundant with `created_at`, and `updated_at` is unnecessary since match candidates are typically generated once and then either expire or turn into match requests. `rank` was removed because the backend can easily sort candidates dynamically using `ORDER BY match_score DESC`, removing the need to store a hardcoded index.

### 8. Match Candidate Shared Data
**Modifications:**
- **Removed:** `match_candidate_shared_artists` and `match_candidate_shared_songs` tables entirely.
**Justification:** Shared songs and artists between two users can be easily calculated dynamically by querying the intersection of `user_taste_songs` for both users. Storing these overlaps physically inside tables creates redundant data and increases database bloat without providing significant performance benefits.

### 9. Post-Match Engagement
**Modifications:**
- **Removed:** `song_interactions` table entirely.
**Justification:** The core MVP focuses on generating matches and connecting users. Building a custom in-app chat or reaction system for post-match engagement adds unnecessary development overhead at this stage. Users can connect via their provided social media handles. This feature can be reintroduced in a later update.

---

## Current Tables and Columns

### 1. `profiles`
- `id` (uuid, primary key)
- `email` (text, unique)
- `display_name` (text)
- `avatar_url` (text)
- `google_id` (text, unique)
- `google_payload` (jsonb)
- `etlab_id` (text, unique)
- `academic_year` (text)
- `etlab_verified` (boolean)
- `created_at` (timestamptz)

### 2. `app_sessions`
- `id` (uuid, primary key)
- `session_token_hash` (text, unique)
- `user_id` (uuid, fk to profiles.id)
- `user_agent` (text)
- `ip_address` (inet)
- `expires_at` (timestamptz)
- `revoked_at` (timestamptz)
- `created_at` (timestamptz)

### 3. `music_provider_accounts`
- `id` (uuid, primary key)
- `user_id` (uuid, fk to profiles.id)
- `provider` (text)
- `provider_user_id` (text)
- `display_name` (text)
- `access_token_ciphertext` (text)
- `refresh_token_ciphertext` (text)
- `token_type` (text)
- `expires_at` (timestamptz)
- `created_at` (timestamptz)

### 4. `songs`
- `id` (uuid, primary key)
- `title` (text)
- `artist_name` (text)
- `album_title` (text)
- `provider_song_id` (text)
- `image_url` (text)
- `duration_ms` (integer)
- `explicit` (boolean)
- `isrc` (text)
- `created_at` (timestamptz)

### 5. `song_audio_features`
- `id` (uuid, primary key)
- `song_id` (uuid, fk to songs.id)
- `extractor` (text)
- `feature_version` (text)
- `source_audio_provider` (text)
- `source_audio_id` (text)
- `clip_strategy` (text)
- `clip_seconds` (integer)
- `sample_rate` (integer)
- `tempo_bpm_mean` (double precision)
- `onset_rate_mean` (double precision)
- `loudness_mean` (double precision)
- `energy_mean` (double precision)
- `danceability_mean` (double precision)
- `spectral_flux_mean` (double precision)
- `spectral_centroid_mean` (double precision)
- `spectral_contrast_mean` (double precision)
- `mfcc_means` (double precision[])
- `key_strength_mean` (double precision)
- `scale_encoded_mean` (double precision)
- `feature_vector` (double precision[])
- `error` (text)
- `created_at` (timestamptz)

### 6. `user_taste_songs`
- `id` (uuid, primary key)
- `user_id` (uuid, fk to profiles.id)
- `song_id` (uuid, fk to songs.id)
- `created_at` (timestamptz)

### 7. `user_taste_vectors`
- `id` (uuid, primary key)
- `user_id` (uuid, fk to profiles.id)
- `song_count` (integer)
- `vector` (double precision[])
- `created_at` (timestamptz)

### 8. `match_candidates`
- `id` (uuid, primary key)
- `user_id` (uuid, fk to profiles.id)
- `candidate_user_id` (uuid, fk to profiles.id)
- `match_score` (numeric)
- `expires_at` (timestamptz)
- `created_at` (timestamptz)

### 9. `match_requests`
- `id` (uuid, primary key)
- `requester_id` (uuid, fk to profiles.id)
- `recipient_id` (uuid, fk to profiles.id)
- `match_candidate_id` (uuid, fk to match_candidates.id)
- `status` (text)
- `created_at` (timestamptz)
- `responded_at` (timestamptz)

### 10. `accepted_matches`
- `id` (uuid, primary key)
- `request_id` (uuid, fk to match_requests.id)
- `user_a_id` (uuid, fk to profiles.id)
- `user_b_id` (uuid, fk to profiles.id)
- `pair_key` (text, generated)
- `accepted_at` (timestamptz)
