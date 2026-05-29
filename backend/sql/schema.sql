create extension if not exists pgcrypto;

-- Unified user profile. Stores core data, Google identity, and ETLab verification status.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  avatar_url text,
  google_id text unique,
  google_payload jsonb not null default '{}'::jsonb,
  etlab_id text unique,
  academic_year text,
  etlab_verified boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
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

-- OAuth/music-provider account storage.
create table if not exists public.music_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('spotify')),
  provider_user_id text not null,
  display_name text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_type text,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique(user_id, provider),
  unique(provider, provider_user_id)
);

-- Normalized music catalog.
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist_name text not null,
  album_title text,
  provider_song_id text not null,
  image_url text,
  duration_ms integer,
  explicit boolean not null default false,
  isrc text check (isrc is null or isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'),
  created_at timestamptz not null default timezone('utc', now()),
  check (duration_ms is null or duration_ms > 0),
  unique(provider_song_id)
);

-- Audio analysis output
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
  onset_rate_mean double precision,
  loudness_mean double precision,
  energy_mean double precision,
  danceability_mean double precision,
  spectral_flux_mean double precision,
  spectral_centroid_mean double precision,
  spectral_contrast_mean double precision,
  mfcc_means double precision[] not null default '{}',
  key_strength_mean double precision,
  scale_encoded_mean double precision,
  feature_vector double precision[] not null default '{}',
  error text,
  created_at timestamptz not null default timezone('utc', now()),
  unique(song_id, extractor, feature_version, clip_strategy)
);

-- User taste
create table if not exists public.user_taste_songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique(user_id, song_id)
);

create table if not exists public.user_taste_vectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  song_count integer not null default 0,
  vector double precision[],
  created_at timestamptz not null default timezone('utc', now()),
  unique(user_id),
  check (song_count >= 0)
  -- The length check depends on the new vector length, sketchpad mentions it might change to 24, we remove it or leave it open
);

-- Matching state
create table if not exists public.match_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  candidate_user_id uuid not null references public.profiles(id) on delete cascade,
  match_score numeric(6,5) not null,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique(user_id, candidate_user_id),
  check (user_id <> candidate_user_id),
  check (match_score >= 0 and match_score <= 1)
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
  pair_key text generated always as (
    least(user_a_id::text, user_b_id::text) || ':' || greatest(user_a_id::text, user_b_id::text)
  ) stored,
  accepted_at timestamptz not null default timezone('utc', now()),
  check (user_a_id <> user_b_id)
);

-- DB-1: Hard unique constraint on accepted match pair
create unique index if not exists uq_accepted_matches_pair on public.accepted_matches(pair_key);

-- RLS
alter table public.profiles enable row level security;
alter table public.app_sessions enable row level security;
alter table public.music_provider_accounts enable row level security;
alter table public.songs enable row level security;
alter table public.song_audio_features enable row level security;
alter table public.user_taste_songs enable row level security;
alter table public.user_taste_vectors enable row level security;
alter table public.match_candidates enable row level security;
alter table public.match_requests enable row level security;
alter table public.accepted_matches enable row level security;

-- Identity/session indexes
create index if not exists idx_profiles_created_at on public.profiles(created_at desc);
create index if not exists idx_profiles_google_id on public.profiles(google_id);
create index if not exists idx_profiles_etlab_id on public.profiles(etlab_id);
create index if not exists idx_app_sessions_token_hash on public.app_sessions(session_token_hash);
create index if not exists idx_app_sessions_user on public.app_sessions(user_id);
create index if not exists idx_music_provider_accounts_user_provider on public.music_provider_accounts(user_id, provider);

-- Catalog indexes
create unique index if not exists idx_songs_isrc_not_null on public.songs(isrc) where isrc is not null;
create index if not exists idx_songs_title on public.songs(title);
create index if not exists idx_songs_provider_id on public.songs(provider_song_id);

-- Feature/vector indexes
create index if not exists idx_song_audio_features_song on public.song_audio_features(song_id);
create index if not exists idx_user_taste_songs_song on public.user_taste_songs(song_id);
create index if not exists idx_user_taste_songs_user_created_at on public.user_taste_songs(user_id, created_at desc);
create index if not exists idx_user_taste_vectors_user on public.user_taste_vectors(user_id);

-- Matching indexes
create index if not exists idx_match_candidates_user_score on public.match_candidates(user_id, match_score desc);
create index if not exists idx_match_candidates_candidate on public.match_candidates(candidate_user_id);
create index if not exists idx_match_requests_requester_status_created on public.match_requests(requester_id, status, created_at desc);
create index if not exists idx_match_requests_recipient_status_created on public.match_requests(recipient_id, status, created_at desc);
create index if not exists idx_match_requests_candidate on public.match_requests(match_candidate_id);
create unique index if not exists idx_match_requests_pending_pair on public.match_requests(requester_id, recipient_id) where status = 'pending';
create index if not exists idx_accepted_matches_user_a on public.accepted_matches(user_a_id);
create index if not exists idx_accepted_matches_user_b on public.accepted_matches(user_b_id);

-- Sweeping
create index if not exists idx_app_sessions_expires_at on public.app_sessions(expires_at) where revoked_at is null;
