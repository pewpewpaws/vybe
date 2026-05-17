export interface ArtistSummary {
  spotifyArtistId: string
  name: string
}

export interface MatchSongPreview {
  id: string
  spotifyTrackId?: string | null
  canonicalSource?: string
  title: string
  artist: string
  albumArt: string | null
  explicit?: boolean
  durationMs?: number | null
}

export type MatchStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

export interface MatchCandidate {
  userId: string
  name: string
  avatarUrl: string | null
  matchScore: number
  sharedArtists: ArtistSummary[]
  vibeSummary: string
  requestStatus: MatchStatus | null
  topSharedSong: MatchSongPreview | null
}

export interface MatchCandidatePreview extends MatchCandidate {
  canRequest: boolean
}

export interface MatchRequest {
  id: string
  requester: {
    id: string
    name: string
    avatarUrl: string | null
  }
  recipient: {
    id: string
    name: string
    avatarUrl: string | null
  }
  matchScore: number
  sharedArtists: ArtistSummary[]
  vibeSummary: string
  status: MatchStatus
  createdAt: string
  respondedAt: string | null
}

export interface RequestActionResponse {
  id: string
  status: MatchStatus
  acceptedMatchId: string | null
}
