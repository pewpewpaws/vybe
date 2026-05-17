import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { TASTE_QUERY_KEY } from '@/lib/queryKeys'
import { useShouldAnimateOnMount } from '@/lib/useShouldAnimateOnMount'
import { useImagePreloadGate } from '@/lib/useImagePreloadGate'
import { useToast } from '@/components/ui/Toast'
import { Sk } from '@/components/ui/Skeleton'
import { ExplicitBadge } from '@/components/common/ExplicitBadge'
import { usePrefetchedNavigate } from '@/lib/usePrefetchedNavigate'
import {
  clearBackgroundImport,
  getBackgroundImportLabel,
  getBackgroundImportStatus,
  type BackgroundImportStatus,
} from '@/lib/importStatus'

interface TasteSong {
  id: string
  spotifyTrackId?: string | null
  isrc?: string | null
  canonicalSource?: string
  title: string
  artist: string
  album?: string | null
  albumArt: string | null
  source: string
  addedAt: string
  explicit?: boolean
  durationMs?: number | null
}

function formatDuration(durationMs?: number | null) {
  if (typeof durationMs !== 'number' || durationMs <= 0) return null
  const totalSeconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

interface OnboardingState {
  tasteSongs: TasteSong[]
  tasteSongCount: number
  spotifyConnected: boolean
  onboardingCompleted: boolean
}

const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  spotify: { label: 'Spotify', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' },
  manual: { label: 'Manual', color: 'text-beat-lilac bg-beat-lilac/10 border-beat-lilac/25' },
  import: { label: 'Import', color: 'text-sky-300 bg-sky-500/10 border-sky-500/25' },
  apple_music: { label: 'Apple Music', color: 'text-rose-300 bg-rose-500/10 border-rose-500/25' },
  youtube: { label: 'YouTube', color: 'text-red-300 bg-red-500/10 border-red-500/25' },
  youtube_music: { label: 'YT Music', color: 'text-orange-300 bg-orange-500/10 border-orange-500/25' },
  source_fallback: { label: 'Matched', color: 'text-sky-300 bg-sky-500/10 border-sky-500/25' },
}

function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_LABEL[source] ?? { label: source, color: 'text-white/40 bg-white/5 border-white/10' }
  return (
    <span className={`text-[10px] font-body font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
      {meta.label}
    </span>
  )
}



export function MyVibesPage() {
  const navigate = usePrefetchedNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [importStatus, setImportStatus] = useState<BackgroundImportStatus>(() => getBackgroundImportStatus())
  const [importLabel, setImportLabel] = useState(() => getBackgroundImportLabel())
  const previousImportStatus = useRef(importStatus)

  // Snapshot: was data already in cache when this component mounted?
  // Prevents re-running entrance animations on background-refetch or
  // when navigating back from AddSongsPage.
  const wasPreloaded = useRef(
    (() => {
      const cached = queryClient.getQueryData<OnboardingState>(TASTE_QUERY_KEY)
      return Array.isArray(cached?.tasteSongs) && cached.tasteSongs.length > 0
    })()
  )
  const shouldAnimateOnMount = useShouldAnimateOnMount(!wasPreloaded.current)

  const { data, isLoading, error } = useQuery<OnboardingState>({
    queryKey: TASTE_QUERY_KEY,
    queryFn: () => api.get<OnboardingState>('/onboarding/state'),
    refetchInterval: importStatus === 'pending' ? 2000 : false,
  })

  const songs = data?.tasteSongs ?? []
  const songImageSources = useMemo(
    () => songs.map((song) => song.albumArt),
    [songs],
  )
  const areSongImagesReady = useImagePreloadGate(
    songImageSources,
    Boolean(data) && songs.length > 0 && !isLoading,
  )
  const showSkeleton = isLoading || (songs.length > 0 && !areSongImagesReady)

  useEffect(() => {
    const syncImportState = () => {
      const nextStatus = getBackgroundImportStatus()
      const nextLabel = getBackgroundImportLabel(nextStatus)

      setImportStatus(nextStatus)
      setImportLabel(nextLabel)

      if (previousImportStatus.current === 'pending' && nextStatus !== 'pending') {
        void queryClient.invalidateQueries({ queryKey: TASTE_QUERY_KEY })
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

  const deleteMutation = useMutation({
    mutationFn: (songId: string) =>
      api.delete(`/onboarding/songs/${songId}`),

    onMutate: async (songId) => {
      // Freeze any in-flight refetch so it doesn't overwrite our optimistic state
      await queryClient.cancelQueries({ queryKey: TASTE_QUERY_KEY })
      const prev = queryClient.getQueryData<OnboardingState>(TASTE_QUERY_KEY)

      // Optimistic removal — instant, no spinner needed
      queryClient.setQueryData<OnboardingState>(TASTE_QUERY_KEY, (old) => {
        if (!old) return old
        return {
          ...old,
          tasteSongs: old.tasteSongs.filter((s) => s.id !== songId),
          tasteSongCount: Math.max(0, old.tasteSongCount - 1),
        }
      })

      return { prev }
    },

    onError: (_err, _id, ctx) => {
      // Rollback — song reappears immediately
      if (ctx?.prev) queryClient.setQueryData(TASTE_QUERY_KEY, ctx.prev)
      toast('Failed to remove song. Please try again.', 'error')
    },

    onSettled: () => {
      // Sync with server in background — won't re-trigger animations
      // because wasPreloaded.current stays true and isLoading stays false
      queryClient.invalidateQueries({ queryKey: TASTE_QUERY_KEY })
    },
  })

  const groupedSongs = useMemo(
    () =>
      Object.entries(
        songs.reduce<Record<string, TasteSong[]>>((acc, song) => {
          if (!acc[song.source]) acc[song.source] = []
          acc[song.source].push(song)
          return acc
        }, {}),
      ),
    [songs],
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-6 pb-3 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-xl text-white">My Vibes</h1>
          {showSkeleton ? (
            <Sk.Line width="w-36" height="h-2.5" className="mt-1 opacity-50" />
          ) : (
            <p className="font-body text-white/40 text-xs mt-0.5">
              {`${songs.length} song${songs.length !== 1 ? 's' : ''} shaping your matches`}
            </p>
          )}
        </div>
        <button
          id="add-songs-btn"
          onClick={() => navigate('/add-songs')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass border border-beat-violet/30 text-beat-lilac text-xs font-semibold hover:bg-beat-violet/10 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Songs
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
          <div className="flex items-center gap-3">
            {importStatus === 'pending' && (
              <div className="w-4 h-4 rounded-full border-2 border-emerald-300/70 border-t-transparent animate-spin shrink-0" />
            )}
            <div>
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
              </p>
              {importStatus === 'pending' && (
                <p className="font-body text-[11px] text-emerald-200/70 mt-1">
                  {`${songs.length} song${songs.length !== 1 ? 's' : ''} synced so far`}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-28">
        {showSkeleton ? (
          // Content-aware skeleton — matches real source-group + song-row layout exactly
          <div className="flex flex-col gap-2 pt-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Sk.SongRow key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-beat-rose/70 text-sm font-body">Failed to load songs. Try refreshing.</p>
          </div>
        ) : songs.length === 0 && importStatus === 'pending' ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-64 gap-5"
          >
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center">
              <div className="w-7 h-7 rounded-full border-2 border-emerald-300/70 border-t-transparent animate-spin" />
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-white text-lg">Importing your songs</p>
              <p className="text-white/40 text-sm font-body mt-1">Stay here or keep exploring while we build your vibes.</p>
            </div>
          </motion.div>
        ) : songs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-64 gap-5"
          >
            <div className="w-20 h-20 rounded-3xl bg-beat-violet/10 border border-beat-violet/20 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-white text-lg">No vibes yet</p>
              <p className="text-white/40 text-sm font-body mt-1">Add songs to power your music matches</p>
            </div>
            <button
              onClick={() => navigate('/add-songs')}
              className="px-5 py-2.5 rounded-2xl bg-beat-violet text-white font-body font-semibold text-sm hover:bg-beat-violet/80 transition-colors"
            >
              Add your first songs
            </button>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-6 pt-1">
            {groupedSongs.map(([source, sourceSongs], gi) => (
              <motion.section
                key={source}
                initial={shouldAnimateOnMount ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: shouldAnimateOnMount ? gi * 0.06 : 0 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <SourceBadge source={source} />
                  <span className="text-white/25 text-[10px] font-body">{sourceSongs.length} songs</span>
                </div>

                <div className="flex flex-col gap-2">
                  <AnimatePresence initial={false}>
                    {sourceSongs.map((song, i) => (
                      (() => {
                        const duration = formatDuration(song.durationMs)

                        return (
                          <motion.div
                            key={song.id}
                            layout
                            initial={shouldAnimateOnMount ? { opacity: 0, x: -12 } : false}
                            animate={{ opacity: 1, x: 0, height: 'auto' }}
                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                            transition={{
                              layout:   { type: 'spring', stiffness: 400, damping: 30 },
                              opacity:  { duration: 0.18 },
                              height:   { duration: 0.22 },
                              delay: shouldAnimateOnMount ? i * 0.03 : 0,
                            }}
                            className="flex items-center gap-3 p-3 rounded-2xl glass border border-white/6 group overflow-hidden"
                          >
                            {/* Album art */}
                            <div className="w-11 h-11 rounded-xl bg-space-700 flex items-center justify-center shrink-0 overflow-hidden">
                              {song.albumArt ? (
                                <img src={song.albumArt} alt={song.title} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30">
                                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                                </svg>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="text-white text-sm font-body font-medium line-clamp-1">{song.title}</p>
                                {song.explicit && <ExplicitBadge />}
                              </div>
                              <p className="text-white/40 text-xs font-body line-clamp-1 mt-0.5">
                                {song.artist}
                                {duration ? ` • ${duration}` : ''}
                              </p>
                            </div>

                            {/* Delete */}
                            <button
                              onClick={() => deleteMutation.mutate(song.id)}
                              disabled={deleteMutation.isPending}
                              className="w-11 h-11 rounded-xl flex items-center justify-center text-white/30 hover:text-beat-rose hover:bg-beat-rose/10 active:text-beat-rose active:bg-beat-rose/10 transition-all disabled:pointer-events-none shrink-0"
                              aria-label={`Remove ${song.title}`}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                              </svg>
                            </button>
                          </motion.div>
                        )
                      })()
                    ))}
                  </AnimatePresence>
                </div>
              </motion.section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
