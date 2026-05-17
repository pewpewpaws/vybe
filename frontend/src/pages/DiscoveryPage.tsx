import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useShouldAnimateOnMount } from '@/lib/useShouldAnimateOnMount'
import { useImagePreloadGate } from '@/lib/useImagePreloadGate'
import type { MatchCandidate } from '@/types/match'
import { useCurrentUser } from '@/store/authStore'
import { usePrefetchedNavigate } from '@/lib/usePrefetchedNavigate'
import {
  clearBackgroundImport,
  getBackgroundImportLabel,
  getBackgroundImportStatus,
  type BackgroundImportStatus,
} from '@/lib/importStatus'
import { MATCH_CANDIDATES_QUERY_KEY, TASTE_QUERY_KEY } from '@/lib/queryKeys'

interface OnboardingState {
  tasteSongCount: number
}

function matchPercent(score: number) {
  return Math.round(Math.max(0, Math.min(1, score)) * 100)
}

export function DiscoveryPage() {
  const navigate = usePrefetchedNavigate()
  const currentUser = useCurrentUser()
  const queryClient = useQueryClient()
  const [importStatus, setImportStatus] = useState<BackgroundImportStatus>(() => getBackgroundImportStatus())
  const [importLabel, setImportLabel] = useState(() => getBackgroundImportLabel())
  const previousImportStatus = useRef(importStatus)
  const canLoadCandidates = Boolean(currentUser?.isEtlabVerified)
  const shouldAnimateOnMount = useShouldAnimateOnMount(
    !Array.isArray(queryClient.getQueryData<MatchCandidate[]>(MATCH_CANDIDATES_QUERY_KEY)),
  )

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: MATCH_CANDIDATES_QUERY_KEY,
    queryFn: () => api.get<MatchCandidate[]>('/discovery/candidates'),
    enabled: canLoadCandidates,
  })

  useQuery<OnboardingState>({
    queryKey: TASTE_QUERY_KEY,
    queryFn: () => api.get<OnboardingState>('/onboarding/state'),
    enabled: importStatus === 'pending',
    refetchInterval: importStatus === 'pending' ? 3000 : false,
  })

  useEffect(() => {
    const syncImportState = () => {
      const nextStatus = getBackgroundImportStatus()
      const nextLabel = getBackgroundImportLabel(nextStatus)

      setImportStatus(nextStatus)
      setImportLabel(nextLabel)

      if (previousImportStatus.current === 'pending' && nextStatus !== 'pending') {
        void queryClient.invalidateQueries({ queryKey: TASTE_QUERY_KEY })
        void queryClient.invalidateQueries({ queryKey: MATCH_CANDIDATES_QUERY_KEY })
      }

      previousImportStatus.current = nextStatus
    }

    syncImportState()
    // Only poll while an import is in progress — skip the interval when idle
    if (importStatus === 'idle') return
    const intervalId = window.setInterval(syncImportState, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [queryClient, importStatus])

  useEffect(() => {
    if (importStatus !== 'success' && importStatus !== 'error') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      clearBackgroundImport()
      setImportStatus('idle')
      setImportLabel(getBackgroundImportLabel('idle'))
    }, 5000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [importStatus])

  const candidateImageSources = useMemo(
    () => candidates.flatMap((candidate) => [
      candidate.topSharedSong?.albumArt ?? null,
      candidate.avatarUrl ?? null,
    ]),
    [candidates],
  )
  const areCandidateImagesReady = useImagePreloadGate(
    candidateImageSources,
    !isLoading && candidates.length > 0,
  )
  const isVisualLoading = isLoading || (candidates.length > 0 && !areCandidateImagesReady)

  return (
    <div className="relative h-dvh flex flex-col overflow-hidden pb-24">
      <div className="px-5 pt-5 pb-2 flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-display font-bold text-xl text-white">Discover</h1>
          <p className="font-body text-white/40 text-xs mt-0.5">People close in vibe are close on screen</p>
        </div>
        <button
          onClick={() => navigate('/requests')}
          className="relative w-11 h-11 glass rounded-xl flex items-center justify-center active:bg-surface-hover transition-colors"
          aria-label="View match requests"
          id="go-to-requests-btn"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
      </div>

      {importStatus !== 'idle' && (
        <div
          className={[
            'mx-5 mb-3 rounded-2xl px-4 py-3 shrink-0 border',
            importStatus === 'pending'
              ? 'border-emerald-400/25 bg-emerald-500/10'
              : importStatus === 'success'
                ? 'border-sky-400/25 bg-sky-500/10'
                : 'border-beat-rose/30 bg-beat-rose/10',
          ].join(' ')}
        >
          <p
            className={[
              'font-body text-xs',
              importStatus === 'pending'
                ? 'text-emerald-300'
                : importStatus === 'success'
                  ? 'text-sky-200'
                  : 'text-beat-rose',
            ].join(' ')}
          >
            {importLabel}
            {importStatus === 'pending' ? ' You can keep exploring while your songs sync.' : ''}
          </p>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden" aria-label="Vibe match bubble field">
        {isVisualLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : candidates.length > 0 ? (
          <div className="absolute inset-0">
            {/* Central "YOU" Bubble */}
            <motion.div
              initial={shouldAnimateOnMount ? { scale: 0, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="absolute z-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              aria-label="You"
            >
              <div className="w-16 h-16 rounded-full bg-beat-violet border-2 border-beat-lilac flex items-center justify-center shadow-glow animate-pulse-glow">
                <span className="font-display font-bold text-white text-sm">YOU</span>
              </div>
            </motion.div>

            {candidates.map((candidate, index) => {
              // Calculate position based on match score and index (simplified spiral/distributed layout)
              const normalizedScore = Math.max(0, Math.min(1, candidate.matchScore))
              const distance = (1 - normalizedScore) * 165 + 110 // Closer for higher scores
              const angle = (index * 137.5) * (Math.PI / 180) // Golden angle for distribution
              const x = Math.cos(angle) * distance
              const y = Math.sin(angle) * distance
              const topSong = candidate.topSharedSong
              const albumArt = topSong?.albumArt
              const subtitle = topSong?.artist ?? candidate.vibeSummary ?? 'Shared vibe'

              return (
                <motion.div
                  key={candidate.userId}
                  initial={shouldAnimateOnMount ? { scale: 0, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1, x, y }}
                  transition={{ delay: shouldAnimateOnMount ? index * 0.05 : 0, type: 'spring' }}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                >
                  <button
                    onClick={() => navigate(`/match/${candidate.userId}`)}
                    className="group relative flex flex-col items-center"
                  >
                    <div className="relative h-40 w-28 overflow-hidden rounded-[1.75rem] border border-white/12 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover:scale-105 group-hover:border-white/20">
                      {albumArt ? (
                        <img src={albumArt} alt={topSong?.title ?? candidate.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(167,139,250,0.35),_rgba(10,10,20,0.92)_68%)]">
                          {candidate.avatarUrl ? (
                            <img src={candidate.avatarUrl} alt={candidate.name} className="h-16 w-16 rounded-2xl object-cover ring-1 ring-white/10" />
                          ) : (
                            <span className="font-display text-3xl font-bold text-white/55">{candidate.name[0]}</span>
                          )}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/0 to-black/80" />
                      <div className="absolute left-3 right-3 top-3 flex items-start justify-between">
                        <div className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-semibold text-white/80 backdrop-blur-sm">
                          {matchPercent(candidate.matchScore)}%
                        </div>
                        <div className="h-8 w-8 overflow-hidden rounded-xl border border-white/10 bg-black/20 backdrop-blur-sm">
                          {candidate.avatarUrl ? (
                            <img src={candidate.avatarUrl} alt={candidate.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white/70">
                              {candidate.name[0]}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 p-3 text-left">
                        <p className="truncate font-display text-sm font-bold text-white">{topSong?.title ?? candidate.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-white/65">{subtitle}</p>
                      </div>
                    </div>
                  </button>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="w-full max-w-sm pt-24">
              <EmptyState
                title={canLoadCandidates ? 'No live match candidates yet' : 'Verify ETLab to unlock discovery'}
                description={
                  canLoadCandidates
                    ? 'Discovery will populate once real candidate data is available from the backend.'
                    : 'Your music sync can still finish in the background, but match discovery opens after ETLab verification.'
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
