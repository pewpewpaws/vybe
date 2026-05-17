/**
 * queryKeys.ts — Centralised TanStack Query key registry.
 *
 * Using shared constants prevents key drift between pages that
 * read the same data (e.g. MyVibesPage + ProfilePage both show
 * taste songs, so they must share a single cache entry).
 */

/** Taste songs + onboarding state — shared by MyVibesPage, ProfilePage */
export const TASTE_QUERY_KEY = ['taste-songs'] as const

/** Discovery candidates */
export const MATCH_CANDIDATES_QUERY_KEY = ['match-candidates'] as const

/** Match requests */
export const INCOMING_REQUESTS_QUERY_KEY = ['match-requests', 'incoming'] as const
export const OUTGOING_REQUESTS_QUERY_KEY = ['match-requests', 'outgoing'] as const

/** Accepted matches */
export const ACCEPTED_MATCHES_QUERY_KEY = ['accepted-matches'] as const

/** Profile vibe metrics (aggregated audio features) */
export const VIBE_METRICS_QUERY_KEY = ['profile', 'vibe-metrics'] as const

/** Spotify search results are ephemeral — no global key needed */
