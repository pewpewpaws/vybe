import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { TASTE_QUERY_KEY } from '@/lib/queryKeys'
import { useToast } from '@/components/ui/Toast'
import { ExplicitBadge } from '@/components/common/ExplicitBadge'
import { usePrefetchedNavigate } from '@/lib/usePrefetchedNavigate'

type SearchFilter = 'all' | 'track' | 'artist' | 'album'

interface SpotifySearchResult {
  id: string
  kind: SearchFilter
  spotifyTrackId?: string
  isrc?: string | null
  title: string
  artist?: string
  album?: string | null
  albumArt?: string | null
  explicit?: boolean
  durationMs?: number | null
  subtitle?: string
  image?: string | null
}

interface OnboardingState {
  tasteSongs: Array<{
    id: string
    spotifyTrackId?: string | null
    isrc?: string | null
    title: string
    artist: string
    album?: string | null
    albumArt: string | null
    source: string
    addedAt: string
    explicit?: boolean
    durationMs?: number | null
  }>
  tasteSongCount: number
  spotifyConnected: boolean
  onboardingCompleted: boolean
}

export function AddSongsPage() {
  const navigate = usePrefetchedNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all')
  const [results, setResults] = useState<SpotifySearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  // Track which IDs are optimistically in the cache already (added this session)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [addingId, setAddingId] = useState<string | null>(null)

  const { data: onboardingState } = useQuery<OnboardingState>({
    queryKey: TASTE_QUERY_KEY,
    queryFn: () => api.get<OnboardingState>('/onboarding/state'),
  })

  const existingTrackIds = new Set(
    (onboardingState?.tasteSongs ?? [])
      .flatMap((song) => (song.spotifyTrackId ? [song.spotifyTrackId] : [])),
  )

  const addMutation = useMutation({
    mutationFn: (song: SpotifySearchResult) =>
      api.post('/onboarding/songs', {
        song: {
          spotifyTrackId: song.spotifyTrackId ?? song.id,
          isrc: song.isrc ?? null,
          title: song.title,
          artist: song.artist ?? '',
          album: song.album ?? null,
          albumArt: song.albumArt ?? null,
          explicit: song.explicit ?? false,
          durationMs: song.durationMs ?? null,
        },
        source: 'manual',
      }),

    onMutate: async (song) => {
      const trackId = song.spotifyTrackId ?? song.id
      setAddingId(trackId)

      // Freeze any in-flight refetch
      await queryClient.cancelQueries({ queryKey: TASTE_QUERY_KEY })
      const prev = queryClient.getQueryData<OnboardingState>(TASTE_QUERY_KEY)

      // Optimistic add — immediately visible in My Vibes + Profile
      queryClient.setQueryData<OnboardingState>(TASTE_QUERY_KEY, (old) => {
        if (!old) return old
        // Avoid duplicates if the user taps twice before mutation settles
        const alreadyIn = old.tasteSongs.some(
          (s) => s.spotifyTrackId === trackId
        )
        if (alreadyIn) return old
        const newSong = {
          id: `optimistic-${trackId}`,
          spotifyTrackId: trackId,
          isrc: song.isrc ?? null,
          title: song.title,
          artist: song.artist ?? '',
          album: song.album ?? null,
          albumArt: song.albumArt ?? null,
          source: 'manual',
          addedAt: new Date().toISOString(),
          explicit: song.explicit ?? false,
          durationMs: song.durationMs ?? null,
        }
        return {
          ...old,
          tasteSongs: [...old.tasteSongs, newSong],
          tasteSongCount: old.tasteSongCount + 1,
        }
      })

      return { prev }
    },

    onSuccess: (_data, song) => {
      const trackId = song.spotifyTrackId ?? song.id
      // Mark as confirmed-added in local UI state
      setAddedIds((prev) => new Set([...prev, trackId]))
      setAddingId(null)
      // Background sync to replace optimistic id with real server id
      queryClient.invalidateQueries({ queryKey: TASTE_QUERY_KEY })
    },

    onError: (_err, song, ctx) => {
      // Roll back optimistic add
      if (ctx?.prev) queryClient.setQueryData(TASTE_QUERY_KEY, ctx.prev)
      setAddingId(null)
      toast(`Couldn't add "${song.title}". Please try again.`, 'error')
    },
  })

  const filterOptions: Array<{ id: SearchFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'track', label: 'Songs' },
    { id: 'artist', label: 'Artists' },
    { id: 'album', label: 'Albums' },
  ]

  const isPlaylistUrl = /^https?:\/\/(music\.apple\.com|music\.youtube\.com|(?:www\.|m\.)?youtube\.com|youtu\.be)\//i.test(query.trim())

  useEffect(() => {
    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      setResults([])
      setSearchError(null)
      setIsSearching(false)
      return
    }

    // Don't fire a Spotify search when the user pastes a playlist URL —
    // that causes a flood of rate-limit errors and is never what they want.
    if (/^https?:\/\//i.test(trimmedQuery)) {
      setResults([])
      setIsSearching(false)
      setSearchError(null)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setIsSearching(true)
      setSearchError(null)

      try {
        const data = await api.get<{ items: SpotifySearchResult[] }>(
          `/spotify/search?q=${encodeURIComponent(trimmedQuery)}&search_type=${searchFilter}`,
          { signal: controller.signal },
        )
        setResults(data.items)
      } catch (err) {
        if (controller.signal.aborted) {
          return
        }

        console.error(err)
        const message = err instanceof Error ? err.message : 'Search failed.'
        setSearchError(message === 'Spotify account not linked.'
          ? 'Connect Spotify first to search for songs.'
          : message)
        setResults([])
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false)
        }
      }
    }, 500)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, searchFilter])

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate('/my-vibes')}
            className="w-11 h-11 glass rounded-xl flex items-center justify-center text-white/60 hover:text-white active:bg-surface-hover transition-colors shrink-0"
            aria-label="Back"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div>
            <h1 className="font-display font-bold text-xl text-white">Add Songs</h1>
            <p className="font-body text-white/40 text-xs mt-0.5">Search any song to add to your vibe</p>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
            {isSearching ? (
              <div className="w-4 h-4 border-2 border-beat-violet border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            )}
          </div>
          <input
            id="add-songs-search"
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search songs, artists, albums…"
            autoFocus
            className="w-full pl-10 pr-4 py-3 min-h-[48px] rounded-2xl border border-white/10 bg-white/5 text-base text-white outline-none placeholder:text-white/25 focus:border-beat-violet/40 focus:bg-white/8 transition-all"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setResults([])
                setSearchError(null)
                setIsSearching(false)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {filterOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSearchFilter(option.id)}
              className={[
                'px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors shrink-0',
                searchFilter === option.id
                  ? 'bg-beat-violet/20 border-beat-violet/35 text-beat-lilac'
                  : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-5 pb-28">
        <AnimatePresence mode="popLayout">
          {isPlaylistUrl ? (
            <motion.div
              key="playlist-url-hint"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 rounded-2xl border border-beat-violet/25 bg-beat-violet/10 px-4 py-4 flex flex-col gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-beat-violet/20 border border-beat-violet/25 flex items-center justify-center shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-body font-semibold leading-snug">Looks like a playlist link</p>
                  <p className="text-white/50 text-xs font-body mt-0.5 leading-relaxed">
                    This search box is for finding individual songs. To import a full Apple Music or YouTube playlist, use the playlist import flow.
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/onboarding?step=playlist-link')}
                className="w-full py-2.5 rounded-xl bg-beat-violet/25 border border-beat-violet/35 text-beat-lilac text-xs font-semibold font-body hover:bg-beat-violet/40 transition-colors"
              >
                Import playlist instead →
              </button>
            </motion.div>
          ) : searchError ? (
            <motion.div 
              key="search-error" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-beat-rose/30 bg-beat-rose/10 px-4 py-3 font-body text-xs text-beat-rose mt-1"
            >
              {searchError}
            </motion.div>
          ) : !query.trim() ? (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-52 gap-3"
            >
              <div className="w-16 h-16 rounded-2xl bg-beat-violet/10 border border-beat-violet/15 flex items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <p className="text-white/30 text-sm font-body text-center">
                {`Search ${searchFilter === 'all' ? 'songs, artists, and albums' : searchFilter === 'track' ? 'songs' : searchFilter === 'artist' ? 'artists' : 'albums'} above`}
              </p>
            </motion.div>
          ) : results.length === 0 && !isSearching ? (
            <motion.div
              key="no-results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-40 gap-2"
            >
              <p className="text-white/40 text-sm font-body">No results for "{query}"</p>
            </motion.div>
          ) : (
            <div key="results-list" className="flex flex-col gap-2 mt-1">
              {results.map((song, i) => {
                const isTrack = song.kind === 'track'
                const trackId = song.spotifyTrackId ?? song.id
                const isAdded = isTrack && addedIds.has(trackId)
                const isAdding = isTrack && addingId === trackId
                const alreadyInPlaylist = isTrack && existingTrackIds.has(trackId)
                const image = song.albumArt ?? song.image ?? null
                const subtitle = song.kind === 'track' ? song.artist : (song.subtitle ?? '')

                return (
                  <motion.div
                    key={`${song.kind}-${song.id}`}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3 p-3 rounded-2xl glass border border-white/6"
                  >
                    {/* Album art */}
                    <div className="w-12 h-12 rounded-xl bg-space-700 flex items-center justify-center shrink-0 overflow-hidden">
                      {image ? (
                        <img src={image} alt={song.title} className="w-full h-full object-cover" loading="lazy" />
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
                        {song.kind === 'track' && song.explicit && <ExplicitBadge />}
                      </div>
                      <p className="text-white/40 text-xs font-body line-clamp-1 mt-0.5">{subtitle}</p>
                    </div>

                    {isTrack ? (
                      <button
                        onClick={() => {
                          if (isAdded || isAdding || alreadyInPlaylist) return
                          addMutation.mutate(song)
                        }}
                        disabled={isAdded || isAdding || alreadyInPlaylist}
                        className={[
                          'rounded-xl flex items-center justify-center shrink-0 transition-all text-xs font-semibold',
                          isAdded
                            ? 'px-3 h-11 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 cursor-default'
                            : alreadyInPlaylist
                              ? 'px-3 h-11 bg-white/8 border border-white/10 text-white/45 cursor-default'
                              : 'w-11 h-11 bg-beat-violet/20 border border-beat-violet/30 text-beat-lilac hover:bg-beat-violet/35',
                        ].join(' ')}
                        aria-label={isAdded || alreadyInPlaylist ? 'Already added' : `Add ${song.title}`}
                      >
                        {isAdding ? (
                          <div className="w-3.5 h-3.5 border border-beat-lilac border-t-transparent rounded-full animate-spin" />
                        ) : isAdded ? (
                          'Added'
                        ) : alreadyInPlaylist ? (
                          'Added'
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(song.kind === 'artist' ? `/artists/${song.id}` : `/albums/${song.id}`)}
                        className="px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-semibold text-white/55 hover:text-white shrink-0"
                      >
                        View
                      </button>
                    )}
                  </motion.div>
                )
              })}
            </div>
          )}
        </AnimatePresence>

        {/* Done CTA — shows once at least one song added this session */}
        {addedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="sticky bottom-0 pt-4"
          >
            <button
              onClick={() => navigate('/my-vibes')}
              className="w-full py-3 rounded-2xl bg-beat-violet text-white font-body font-semibold text-sm hover:bg-beat-violet/80 transition-colors"
            >
              Done — {addedIds.size} song{addedIds.size !== 1 ? 's' : ''} added
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
