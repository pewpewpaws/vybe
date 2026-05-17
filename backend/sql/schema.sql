create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- Unified user profile. Stores core data, Google identity, and ETLab verification status.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  avatar_url text,
  
  -- Google Identity (Primary Auth)
  google_id text unique,
  google_payload jsonb not null default '{}'::jsonb,
  
  -- ETLab Verification
  etlab_id text unique,
  register_number text unique,
  etlab_payload jsonb not null default '{}'::jsonb,
  etlab_verified_at timestamptz,
  
  onboarding_completed boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token_hash text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_agent text,
  ip_address inet,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

-- OAuth/music-provider account storage. This replaces the Spotify-specific
-- table and can support future providers without a schema fork.
create table if not exists public.music_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('spotify')),
  provider_user_id text not null,
  display_name text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  scope text,
  token_type text,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, provider),
  unique(provider, provider_user_id)
);

-- Normalized music catalog.
create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  name text not null,
  external_urls jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.artist_external_ids (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  provider text not null check (provider in ('spotify', 'lastfm', 'musicbrainz')),
  provider_artist_id text not null,
  provider_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique(provider, provider_artist_id),
  unique(artist_id, provider)
);

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  title text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.album_artists (
  album_id uuid not null references public.albums(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  position integer not null default 0,
  primary key(album_id, artist_id)
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  title text not null,
  -- ISRC must be exactly 12 chars: 2-letter country, 3-char registrant, 7 digits.
  isrc text check (isrc is null or isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'),
  explicit boolean not null default false,
  duration_ms integer,
  image_url text,
  primary_album_id uuid references public.albums(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (duration_ms is null or duration_ms > 0)
);

create table if not exists public.song_artists (
  song_id uuid not null references public.songs(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  role text not null default 'primary' check (role in ('primary', 'featured', 'producer', 'remixer')),
  position integer not null default 0,
  primary key(song_id, artist_id, role)
);

create table if not exists public.song_external_ids (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  provider text not null check (provider in ('spotify', 'apple_music', 'youtube', 'youtube_music', 'isrc', 'source_fallback')),
  provider_song_id text not null,
  provider_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique(provider, provider_song_id),
  unique(song_id, provider, provider_song_id)
);

-- Audio analysis output from MusicSynthesizer or a future feature worker.
-- raw_features preserves the full extractor payload; typed columns hold the
-- current matching feature set for indexing, validation, and BI queries.
create table if not exists public.song_audio_features (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  extractor text not null default 'essentia',
  feature_version text not null,
  source_audio_provider text check (source_audio_provider in ('youtube', 'spotify_preview', 'uploaded', 'unknown')),
  source_audio_id text,
  clip_strategy text not null default 'start_middle_end',
  clip_seconds integer not null default 30,
  sample_rate integer not null default 22050,
  tempo_bpm_mean double precision,
  tempo_bpm_std double precision,
  onset_rate_mean double precision,
  onset_rate_std double precision,
  beat_interval_std_mean double precision,
  beat_interval_std_std double precision,
  loudness_mean double precision,
  loudness_std double precision,
  energy_mean double precision,
  energy_std double precision,
  danceability_mean double precision,
  danceability_std double precision,
  spectral_flux_mean double precision,
  spectral_flux_std double precision,
  spectral_centroid_mean double precision,
  spectral_centroid_std double precision,
  spectral_contrast_mean double precision,
  spectral_contrast_std double precision,
  mfcc_means double precision[] not null default '{}',
  mfcc_stds double precision[] not null default '{}',
  key_strength_mean double precision,
  key_strength_std double precision,
  scale_encoded_mean double precision,
  scale_encoded_std double precision,
  feature_vector double precision[] not null default '{}',
  raw_features jsonb not null default '{}'::jsonb,
  error text,
  computed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique(song_id, extractor, feature_version, clip_strategy)
);

-- User taste and derived user vectors.
create table if not exists public.user_taste_songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'spotify', 'apple_music', 'youtube', 'youtube_music', 'import')),
  weight numeric(6,4) not null default 1.0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, song_id)
);

create table if not exists public.user_taste_vectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature_version text not null,
  song_count integer not null default 0,
  -- vector dimension is validated at insert/update time via the CHECK below.
  -- Update the constant (128) when the ML extractor output dimension changes.
  vector double precision[] not null default '{}',
  summary jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique(user_id, feature_version),
  check (song_count >= 0),
  check (array_length(vector, 1) is null or array_length(vector, 1) = 48)
);

-- Matching state. Explanations are normalized instead of duplicating large JSON
-- blobs on every request and accepted match row.
create table if not exists public.match_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  candidate_user_id uuid not null references public.profiles(id) on delete cascade,
  feature_version text not null,
  match_score numeric(6,5) not null,
  rank integer,
  generated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, candidate_user_id, feature_version),
  check (user_id <> candidate_user_id),
  check (match_score >= 0 and match_score <= 1)
);

create table if not exists public.match_candidate_shared_artists (
  match_candidate_id uuid not null references public.match_candidates(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  weight numeric(8,5) not null default 1.0,
  primary key(match_candidate_id, artist_id)
);

create table if not exists public.match_candidate_shared_songs (
  match_candidate_id uuid not null references public.match_candidates(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  weight numeric(8,5) not null default 1.0,
  primary key(match_candidate_id, song_id)
);

create table if not exists public.match_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  match_candidate_id uuid references public.match_candidates(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  check (requester_id <> recipient_id)
);

create table if not exists public.accepted_matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.match_requests(id) on delete cascade,
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  -- Canonical pair key: always (lesser_uuid || ':' || greater_uuid) so the pair
  -- is order-independent. Enforced by UNIQUE below (DB-1 fix).
  pair_key text generated always as (
    least(user_a_id::text, user_b_id::text) || ':' || greatest(user_a_id::text, user_b_id::text)
  ) stored,
  accepted_at timestamptz not null default timezone('utc', now()),
  check (user_a_id <> user_b_id)
);

create table if not exists public.song_interactions (
  id uuid primary key default gen_random_uuid(),
  accepted_match_id uuid not null references public.accepted_matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  reaction text check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default timezone('utc', now()),
  reacted_at timestamptz,
  check (sender_id <> receiver_id)
);

-- Compatibility read model for existing app/API code while repositories are
-- migrated to the normalized catalog tables.
create or replace view public.song_catalog_view as
select
  s.id,
  s.canonical_key,
  case when primary_external.provider = 'spotify' then primary_external.provider_song_id end as spotify_track_id,
  coalesce(primary_external.provider, 'source_fallback') as canonical_source,
  s.isrc,
  s.title,
  coalesce(
    string_agg(a.name, ' - ' order by sa.position) filter (where a.id is not null),
    'Unknown Artist'
  ) as artist,
  al.title as album,
  s.image_url as album_art,
  s.explicit,
  s.duration_ms,
  s.created_at as added_at,
  s.updated_at
from public.songs s
left join lateral (
  select provider, provider_song_id
  from public.song_external_ids sei
  where sei.song_id = s.id
    and sei.provider <> 'isrc'
  order by case sei.provider when 'spotify' then 0 when 'source_fallback' then 2 else 1 end
  limit 1
) primary_external on true
left join public.song_artists sa
  on sa.song_id = s.id
left join public.artists a
  on a.id = sa.artist_id
left join public.albums al
  on al.id = s.primary_album_id
group by
  s.id,
  s.canonical_key,
  primary_external.provider_song_id,
  primary_external.provider,
  s.isrc,
  s.title,
  al.title,
  s.image_url,
  s.explicit,
  s.duration_ms,
  s.created_at,
  s.updated_at;

-- Updated-at triggers.
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();


drop trigger if exists music_provider_accounts_set_updated_at on public.music_provider_accounts;
create trigger music_provider_accounts_set_updated_at
before update on public.music_provider_accounts
for each row execute function public.set_updated_at();

drop trigger if exists artists_set_updated_at on public.artists;
create trigger artists_set_updated_at
before update on public.artists
for each row execute function public.set_updated_at();

drop trigger if exists albums_set_updated_at on public.albums;
create trigger albums_set_updated_at
before update on public.albums
for each row execute function public.set_updated_at();

drop trigger if exists songs_set_updated_at on public.songs;
create trigger songs_set_updated_at
before update on public.songs
for each row execute function public.set_updated_at();

drop trigger if exists user_taste_songs_set_updated_at on public.user_taste_songs;
create trigger user_taste_songs_set_updated_at
before update on public.user_taste_songs
for each row execute function public.set_updated_at();

drop trigger if exists match_candidates_set_updated_at on public.match_candidates;
create trigger match_candidates_set_updated_at
before update on public.match_candidates
for each row execute function public.set_updated_at();

-- RLS is enabled for all persistent tables. Policies are intentionally omitted
-- because the backend currently uses a service-role client and should own all
-- direct table access.
alter table public.profiles enable row level security;
alter table public.app_sessions enable row level security;
alter table public.music_provider_accounts enable row level security;
alter table public.artists enable row level security;
alter table public.artist_external_ids enable row level security;
alter table public.albums enable row level security;
alter table public.album_artists enable row level security;
alter table public.songs enable row level security;
alter table public.song_artists enable row level security;
alter table public.song_external_ids enable row level security;
alter table public.song_audio_features enable row level security;
alter table public.user_taste_songs enable row level security;
alter table public.user_taste_vectors enable row level security;
alter table public.match_candidates enable row level security;
alter table public.match_candidate_shared_artists enable row level security;
alter table public.match_candidate_shared_songs enable row level security;
alter table public.match_requests enable row level security;
alter table public.accepted_matches enable row level security;
alter table public.song_interactions enable row level security;

-- Identity/session indexes.
create index if not exists idx_profiles_created_at on public.profiles(created_at desc);
create index if not exists idx_profiles_google_id on public.profiles(google_id);
create index if not exists idx_profiles_etlab_id on public.profiles(etlab_id);
create index if not exists idx_app_sessions_token_hash on public.app_sessions(session_token_hash);
create index if not exists idx_app_sessions_user on public.app_sessions(user_id);
create index if not exists idx_music_provider_accounts_user_provider
  on public.music_provider_accounts(user_id, provider);

-- Catalog indexes.
create index if not exists idx_artists_name on public.artists(name);
create index if not exists idx_artist_external_ids_artist on public.artist_external_ids(artist_id);
create index if not exists idx_albums_title on public.albums(title);
create index if not exists idx_album_artists_artist on public.album_artists(artist_id);
create unique index if not exists idx_songs_isrc_not_null on public.songs(isrc) where isrc is not null;
create index if not exists idx_songs_title on public.songs(title);
create index if not exists idx_songs_primary_album on public.songs(primary_album_id);
create index if not exists idx_song_artists_artist on public.song_artists(artist_id);
create index if not exists idx_song_external_ids_song on public.song_external_ids(song_id);

-- Feature/vector indexes.
create index if not exists idx_song_audio_features_song on public.song_audio_features(song_id);
create index if not exists idx_song_audio_features_version on public.song_audio_features(feature_version);
create index if not exists idx_song_audio_features_computed_at on public.song_audio_features(computed_at desc);
create index if not exists idx_user_taste_songs_song on public.user_taste_songs(song_id);
create index if not exists idx_user_taste_songs_user_created_at
  on public.user_taste_songs(user_id, created_at desc);
create index if not exists idx_user_taste_vectors_user_version
  on public.user_taste_vectors(user_id, feature_version);

-- Matching indexes.
create index if not exists idx_match_candidates_user_score
  on public.match_candidates(user_id, match_score desc);
create index if not exists idx_match_candidates_candidate on public.match_candidates(candidate_user_id);
create index if not exists idx_match_candidate_shared_artists_artist
  on public.match_candidate_shared_artists(artist_id);
create index if not exists idx_match_candidate_shared_songs_song
  on public.match_candidate_shared_songs(song_id);
create index if not exists idx_match_requests_requester_status_created
  on public.match_requests(requester_id, status, created_at desc);
create index if not exists idx_match_requests_recipient_status_created
  on public.match_requests(recipient_id, status, created_at desc);
create index if not exists idx_match_requests_candidate on public.match_requests(match_candidate_id);
create unique index if not exists idx_match_requests_pending_pair
  on public.match_requests(requester_id, recipient_id)
  where status = 'pending';
create index if not exists idx_accepted_matches_user_a on public.accepted_matches(user_a_id);
create index if not exists idx_accepted_matches_user_b on public.accepted_matches(user_b_id);
-- Replaced by uq_accepted_matches_pair on the pair_key generated column (see DB-1 fix below).
-- drop index if exists idx_accepted_matches_pair;

create index if not exists idx_song_interactions_match on public.song_interactions(accepted_match_id);
create index if not exists idx_song_interactions_receiver_created
  on public.song_interactions(receiver_id, created_at desc);
create index if not exists idx_song_interactions_sender_created
  on public.song_interactions(sender_id, created_at desc);
create index if not exists idx_song_interactions_song on public.song_interactions(song_id);

-- DB-1: Hard unique constraint on accepted match pair (order-independent via pair_key).
create unique index if not exists uq_accepted_matches_pair on public.accepted_matches(pair_key);

-- DB-2 note: pending request deduplication uses idx_match_requests_pending_pair (partial unique
-- index on (requester_id, recipient_id) WHERE status = 'pending').  The application layer
-- must handle the unique-violation and return 409 rather than 500.

-- DB-3: Partial index to efficiently sweep expired sessions without scanning revoked rows.
create index if not exists idx_app_sessions_expires_at
  on public.app_sessions(expires_at)
  where revoked_at is null;

-- DB-8 note: RLS is enabled on all tables but no per-row policies are defined because the
-- backend uses the service-role key exclusively.  Add policies before enabling any anon/JWT
-- client access (e.g., Supabase Realtime subscriptions) to avoid full-table exposure.
