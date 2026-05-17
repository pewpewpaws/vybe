import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { api } from '@/services/api'
import { usePrefetchedNavigate } from '@/lib/usePrefetchedNavigate'
import { MATCH_CANDIDATES_QUERY_KEY, OUTGOING_REQUESTS_QUERY_KEY } from '@/lib/queryKeys'
import type { MatchCandidatePreview, MatchRequest } from '@/types/match'

function formatPercent(score: number) {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`
}

export function MatchProfilePage() {
  const { userId = '' } = useParams()
  const navigate = usePrefetchedNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: candidate, isLoading, error } = useQuery({
    queryKey: ['match-candidate-preview', userId],
    queryFn: () => api.get<MatchCandidatePreview>(`/discovery/candidates/${userId}`),
    enabled: Boolean(userId),
  })

  const requestMutation = useMutation({
    mutationFn: () =>
      api.post<MatchRequest>('/discovery/requests', {
        candidateUserId: userId,
      }),
    onSuccess: async () => {
      toast('Match request sent.', 'success')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['match-candidate-preview', userId] }),
        queryClient.invalidateQueries({ queryKey: MATCH_CANDIDATES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: OUTGOING_REQUESTS_QUERY_KEY }),
      ])
    },
    onError: (mutationError) => {
      toast(mutationError instanceof Error ? mutationError.message : 'Could not send request.', 'error')
    },
  })

  const sharedArtistText = useMemo(
    () => candidate?.sharedArtists.map((artist) => artist.name).slice(0, 5).join(', ') ?? '',
    [candidate?.sharedArtists],
  )

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28">
      <div className="px-5 pt-5 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors"
          aria-label="Go back"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="font-body text-sm">Back</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : error || !candidate ? (
        <div className="px-5 py-8">
          <EmptyState
            title="Match preview unavailable"
            description={error instanceof Error ? error.message : 'No match candidate was selected.'}
          />
        </div>
      ) : (
        <div className="px-5 py-6">
          <section className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="absolute inset-0 scale-125 rounded-[2rem] bg-beat-violet/20 blur-2xl" aria-hidden="true" />
              <div className="relative h-24 w-24 overflow-hidden rounded-[2rem] border border-white/10 bg-space-700">
                {candidate.avatarUrl ? (
                  <img src={candidate.avatarUrl} alt={candidate.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl font-display font-bold text-white/60">
                    {candidate.name[0]?.toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            <h1 className="mt-5 font-display text-3xl font-bold text-white">{candidate.name}</h1>
            <div className="mt-2 rounded-full border border-beat-violet/25 bg-beat-violet/10 px-3 py-1 text-xs font-semibold text-beat-lilac">
              {formatPercent(candidate.matchScore)} match
            </div>
          </section>

          {candidate.topSharedSong && (
            <section className="mt-7 rounded-2xl glass border border-white/8 p-4">
              <h2 className="font-body font-semibold text-white/45 text-xs uppercase tracking-widest">
                Top Shared Song
              </h2>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-14 w-14 overflow-hidden rounded-2xl bg-space-700 border border-white/8 shrink-0">
                  {candidate.topSharedSong.albumArt ? (
                    <img
                      src={candidate.topSharedSong.albumArt}
                      alt={candidate.topSharedSong.title}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{candidate.topSharedSong.title}</p>
                  <p className="mt-0.5 truncate text-xs text-white/40">{candidate.topSharedSong.artist}</p>
                </div>
              </div>
            </section>
          )}

          {(candidate.vibeSummary || sharedArtistText) && (
            <section className="mt-4 rounded-2xl glass border border-white/8 p-4">
              <h2 className="font-body font-semibold text-white/45 text-xs uppercase tracking-widest">
                Why This Match
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {candidate.vibeSummary || `Shared artists: ${sharedArtistText}`}
              </p>
            </section>
          )}

          <div className="mt-7">
            <Button
              size="lg"
              disabled={!candidate.canRequest}
              isLoading={requestMutation.isPending}
              onClick={() => requestMutation.mutate()}
            >
              {candidate.requestStatus === 'pending'
                ? 'Request Sent'
                : candidate.canRequest
                  ? 'Send Match Request'
                  : 'Already Connected'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
