// ─── Shared domain types for Vyne ────────────────────────────────────────────
// All feature-level types import from here to keep the shape consistent
// across pages and hooks.

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  name: string
  email: string
  registerNumber: string | null
  avatarUrl: string | null
  hasCompletedOnboarding: boolean
  hasSpotifyLinked: boolean
}

// ─── Music ────────────────────────────────────────────────────────────────────

export interface Song {
  id?: string
  spotifyTrackId?: string | null
  canonicalSource?: string
  isrc: string | null
  title: string
  artist: string
  album?: string | null
  albumArt: string | null
  explicit?: boolean
  durationMs?: number | null
}

export interface Artist {
  spotifyArtistId: string
  name: string
}

// ─── Taste Profile ────────────────────────────────────────────────────────────

export interface TasteProfile {
  userId: string
  songs: Song[]
  topArtists: Artist[]
  featureVersion?: string
  vibeVector: number[]
  summary?: Record<string, unknown>
  updatedAt: string
}

// ─── Discovery & Matching ─────────────────────────────────────────────────────

export type MatchStatus = 'pending' | 'accepted' | 'declined'

export interface MatchCandidate {
  userId: string
  name: string
  avatarUrl: string | null
  matchScore: number        // 0–1 cosine similarity
  sharedArtists: Artist[]
  vibeSummary: string       // short descriptive label e.g. "Dark indie + high energy"
}

export interface MatchRequest {
  id: string
  fromUser: Pick<User, 'id' | 'name' | 'avatarUrl'>
  matchScore: number
  sharedArtists: Artist[]
  status: MatchStatus
  createdAt: string
}

export interface AcceptedMatch {
  id: string
  matchedUser: User
  matchScore: number
  sharedArtists: Artist[]
  vibeSummary: string
  topSharedSongs: Song[]
  acceptedAt: string
}

// ─── Song Interactions ────────────────────────────────────────────────────────

export type Reaction = 'like' | 'dislike'

export interface SongInteraction {
  id: string
  senderId: string
  receiverId: string
  song: Song
  reaction: Reaction | null
  sentAt: string
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number
  users: [Pick<User, 'id' | 'name' | 'avatarUrl'>, Pick<User, 'id' | 'name' | 'avatarUrl'>]
  matchScore: number
  vibeSummary: string
}
