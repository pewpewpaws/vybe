import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { api } from '@/services/api'
import {
  ACCEPTED_MATCHES_QUERY_KEY,
  INCOMING_REQUESTS_QUERY_KEY,
  MATCH_CANDIDATES_QUERY_KEY,
  OUTGOING_REQUESTS_QUERY_KEY,
} from '@/lib/queryKeys'
import type { MatchRequest, RequestActionResponse } from '@/types/match'

function formatPercent(score: number) {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function statusLabel(status: MatchRequest['status']) {
  if (status === 'declined') return 'Declined'
  if (status === 'accepted') return 'Accepted'
  if (status === 'cancelled') return 'Cancelled'
  return 'Pending'
}

export function MatchRequestsPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: incoming = [], isLoading: isIncomingLoading } = useQuery({
    queryKey: INCOMING_REQUESTS_QUERY_KEY,
    queryFn: () => api.get<MatchRequest[]>('/requests/incoming'),
  })

  const { data: outgoing = [], isLoading: isOutgoingLoading } = useQuery({
    queryKey: OUTGOING_REQUESTS_QUERY_KEY,
    queryFn: () => api.get<MatchRequest[]>('/requests/outgoing'),
  })

  const pendingIncoming = useMemo(
    () => incoming.filter((request) => request.status === 'pending'),
    [incoming],
  )
  const visibleOutgoing = useMemo(
    () => outgoing.filter((request) => request.status === 'pending'),
    [outgoing],
  )

  const invalidateRequestData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: INCOMING_REQUESTS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: OUTGOING_REQUESTS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: MATCH_CANDIDATES_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ACCEPTED_MATCHES_QUERY_KEY }),
    ])
  }

  const acceptMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.post<RequestActionResponse>(`/requests/${requestId}/accept`, {}),
    onSuccess: async () => {
      toast('Match accepted.', 'success')
      await invalidateRequestData()
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Could not accept request.', 'error')
    },
  })

  const declineMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.post<RequestActionResponse>(`/requests/${requestId}/decline`, {}),
    onSuccess: async () => {
      toast('Request declined.', 'info')
      await invalidateRequestData()
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Could not decline request.', 'error')
    },
  })

  // Show the subtitle only once both queries have settled
  const bothLoaded = !isIncomingLoading && !isOutgoingLoading
  const hasAny = pendingIncoming.length > 0 || visibleOutgoing.length > 0

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28">
      <div className="px-5 pt-5 pb-2 shrink-0">
        <h1 className="font-display font-bold text-xl text-white">Requests</h1>
        <p className="font-body text-white/40 text-xs mt-0.5">
          {bothLoaded
            ? hasAny
              ? `${pendingIncoming.length} incoming, ${visibleOutgoing.length} outgoing`
              : 'No pending requests'
            : 'Loading…'}
        </p>
      </div>

      <div className="px-5 py-3 flex flex-col gap-6 flex-1">
        {/* ── Incoming ────────────────────────────────────────── */}
        {isIncomingLoading ? (
          <div className="flex items-center justify-center py-6">
            <LoadingSpinner size="md" />
          </div>
        ) : pendingIncoming.length > 0 ? (
          <section>
            <h2 className="font-body font-semibold text-white/45 text-xs uppercase tracking-widest mb-3">
              Incoming
            </h2>
            <div className="flex flex-col gap-3">
              {pendingIncoming.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  person={request.requester}
                  tone="incoming"
                  actions={
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        isLoading={declineMutation.isPending && declineMutation.variables === request.id}
                        onClick={() => declineMutation.mutate(request.id)}
                      >
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        isLoading={acceptMutation.isPending && acceptMutation.variables === request.id}
                        onClick={() => acceptMutation.mutate(request.id)}
                      >
                        Accept
                      </Button>
                    </div>
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Outgoing ────────────────────────────────────────── */}
        {isOutgoingLoading ? (
          <div className="flex items-center justify-center py-6">
            <LoadingSpinner size="md" />
          </div>
        ) : visibleOutgoing.length > 0 ? (
          <section>
            <h2 className="font-body font-semibold text-white/45 text-xs uppercase tracking-widest mb-3">
              Sent
            </h2>
            <div className="flex flex-col gap-3">
              {visibleOutgoing.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  person={request.recipient}
                  tone="outgoing"
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Empty state — only once both loaded and nothing to show ── */}
        {bothLoaded && !hasAny && (
          <div className="flex flex-1 items-center">
            <EmptyState
              title="You're all caught up"
              description="Incoming and sent match requests will appear here as normalized candidate data turns into real connections."
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

function RequestCard({
  request,
  person,
  tone,
  actions,
}: {
  request: MatchRequest
  person: MatchRequest['requester']
  tone: 'incoming' | 'outgoing'
  actions?: JSX.Element
}) {
  const topArtistNames = request.sharedArtists.map((artist) => artist.name).slice(0, 3)

  return (
    <article className="rounded-2xl glass border border-white/8 p-4">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 overflow-hidden rounded-2xl bg-space-700 border border-white/8 shrink-0">
          {person.avatarUrl ? (
            <img src={person.avatarUrl} alt={person.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-display font-bold text-white/55">
              {person.name[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-base font-bold text-white">{person.name}</h3>
            <span className="rounded-full border border-beat-violet/25 bg-beat-violet/10 px-2 py-0.5 text-[10px] font-semibold text-beat-lilac">
              {formatPercent(request.matchScore)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-white/40">
            {tone === 'incoming' ? 'Requested you' : statusLabel(request.status)}
            {' on '}
            {formatDate(request.createdAt)}
          </p>
        </div>
      </div>

      {(request.vibeSummary || topArtistNames.length > 0) && (
        <div className="mt-3 rounded-xl bg-white/4 border border-white/6 px-3 py-2">
          <p className="text-xs text-white/55 line-clamp-2">
            {request.vibeSummary || `Shared artists: ${topArtistNames.join(', ')}`}
          </p>
        </div>
      )}

      {actions && <div className="mt-4">{actions}</div>}
    </article>
  )
}
