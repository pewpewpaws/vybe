drop view if exists public.song_catalog_view cascade;

drop table if exists public.song_interactions cascade;
drop table if exists public.accepted_matches cascade;
drop table if exists public.match_requests cascade;
drop table if exists public.match_candidate_shared_songs cascade;
drop table if exists public.match_candidate_shared_artists cascade;
drop table if exists public.match_candidates cascade;
drop table if exists public.user_taste_vectors cascade;
drop table if exists public.user_taste_songs cascade;
drop table if exists public.song_audio_features cascade;
drop table if exists public.song_external_ids cascade;
drop table if exists public.song_artists cascade;
drop table if exists public.songs cascade;
drop table if exists public.album_artists cascade;
drop table if exists public.albums cascade;
drop table if exists public.artist_external_ids cascade;
drop table if exists public.artists cascade;
drop table if exists public.music_provider_accounts cascade;
drop table if exists public.app_sessions cascade;
drop table if exists public.profiles cascade;

drop function if exists public.set_updated_at() cascade;
