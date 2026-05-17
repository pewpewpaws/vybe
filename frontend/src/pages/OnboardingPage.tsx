import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/services/api'
import { Sk } from '@/components/ui/Skeleton'
import { beginBackgroundImport, failBackgroundImport, succeedBackgroundImport } from '@/lib/importStatus'
import { useImagePreloadGate } from '@/lib/useImagePreloadGate'
import { usePrefetchedNavigate } from '@/lib/usePrefetchedNavigate'

type OnboardingStep = 'welcome' | 'music-source' | 'playlist-link' | 'select-playlist' | 'building'

interface OnboardingCompleteOptions {
  navigateImmediately?: boolean
}

interface PlaylistImportResponse {
  detectedPlatform: string
  imported: number
  spotifyNormalized: number
  sourceFallbacks: number
}

function formatSpotifyError(errorCode: string) {
  const decoded = decodeURIComponent(errorCode)

  const cannedMessages: Record<string, string> = {
    access_denied: 'Spotify access was denied. Please approve the requested permissions to continue.',
    invalid_grant: 'Spotify sign-in expired before it completed. Please try connecting again.',
    invalid_request: 'Spotify rejected the sign-in request. Double-check the configured redirect URI and try again.',
    invalid_spotify_callback_state: 'Spotify sign-in could not be verified. Please try connecting again.',
    missing_code: 'Spotify did not return an authorization code. Please try again.',
    session_expired: 'Your session expired before Spotify finished connecting. Sign in again, then retry.',
  }

  const normalizedKey = decoded.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cannedMessages[normalizedKey] ?? `Spotify connect failed: ${decoded}.`
}

// ─── Step components ─────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {

  return (
    <div className="flex flex-col items-center gap-φ5 text-center px-φ4">
      <div className="w-20 h-20 rounded-3xl bg-beat-violet/20 border border-beat-violet/30 flex items-center justify-center animate-pulse-glow">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>

      <div>
        <h1 className="font-display font-bold text-phi-h text-white">Add your vibe</h1>
        <p className="font-body text-white/50 mt-φ2 text-phi-body leading-relaxed">
          Tell us what you listen to. We'll find people on campus who match your music identity.
        </p>
      </div>

      <Button size="lg" onClick={onNext} id="onboarding-start-btn">
        Let's go
      </Button>
    </div>
  )
}

function MusicSourceStep({
  onComplete,
  onOpenPlaylistLink,
}: {
  onComplete: (options?: OnboardingCompleteOptions) => void
  onOpenPlaylistLink: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const sources = [
    {
      id: 'spotify',
      label: 'Connect Spotify',
      description: 'Recommended — imports your taste automatically',
      badge: 'Recommended' as const,
      badgeVariant: 'violet' as const,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="#1DB954" />
          <path d="M17.9 10.9C14.7 9 9.35 8.8 6.3 9.75c-.5.15-1-.15-1.15-.6-.15-.5.15-1 .6-1.15 3.55-1.05 9.4-.85 13.1 1.35.45.25.6.85.35 1.3-.25.35-.85.5-1.3.25zm-.1 2.8c-.25.35-.7.5-1.05.25-2.7-1.65-6.8-2.15-9.95-1.15-.4.1-.85-.1-.95-.5-.1-.4.1-.85.5-.95 3.65-1.1 8.15-.55 11.25 1.35.3.15.45.65.2 1zm-1.2 2.75c-.2.3-.55.4-.85.2-2.35-1.45-5.3-1.75-8.8-.95-.35.1-.65-.15-.75-.45-.1-.35.15-.65.45-.75 3.8-.85 7.1-.5 9.7 1.1.35.15.4.55.25.85z" fill="white"/>
        </svg>
      ),
    },
    {
      id: 'manual',
      label: 'Add songs manually',
      description: 'Search and add 5–10 songs you love',
      badge: null,
      badgeVariant: null,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-beat-lilac">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
    },
    {
      id: 'playlist',
      label: 'Paste a playlist link',
      description: 'Works with Spotify, Apple Music, YouTube',
      badge: null,
      badgeVariant: null,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-beat-lilac">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ),
    },
  ]

  async function handleContinue() {
    if (!selected) return
    setIsLoading(true)

    if (selected === 'spotify') {
      try {
        const { authorizationUrl } = await api.get<{ authorizationUrl: string }>('/spotify/connect')
        window.location.href = authorizationUrl
      } catch (err) {
        setIsLoading(false)
        console.error('Failed to start Spotify auth', err)
      }
      return
    }

    if (selected === 'playlist') {
      setIsLoading(false)
      onOpenPlaylistLink()
      return
    }

    if (selected === 'manual') {
      await new Promise((r) => setTimeout(r, 800))
      onComplete()
      return
    }

    await new Promise((r) => setTimeout(r, 800))
    onComplete()
  }

  return (
    <div className="flex flex-col gap-φ4 px-φ4 w-full">
      <div>
        <h2 className="font-display font-bold text-phi-sub text-white">How do you want to add music?</h2>
        <p className="font-body text-white/45 text-phi-sm mt-φ0">You can always add more later</p>
      </div>

      <div className="flex flex-col gap-φ2">
        {sources.map((src) => (
          <motion.button
            key={src.id}
            id={`source-${src.id}`}
            onClick={() => setSelected(src.id)}
            whileTap={{ scale: 0.985 }}
            className={[
              'flex items-center gap-4 p-4 rounded-2xl text-left transition-all duration-200 border relative overflow-hidden',
              selected === src.id
                ? 'bg-beat-violet/15 border-beat-violet/40'
                : 'bg-white/4 border-white/5 hover:bg-white/7 hover:border-white/15',
            ].join(' ')}
          >
            <div className="w-10 h-10 rounded-xl bg-space-700 flex items-center justify-center shrink-0">
              {src.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-body font-medium text-white text-sm">{src.label}</span>
                {src.badge && <Badge variant={src.badgeVariant!}>{src.badge}</Badge>}
              </div>
              <p className="font-body text-white/40 text-xs mt-0.5">{src.description}</p>
            </div>
            <div className="w-5 h-5 shrink-0">
              <AnimatePresence>
                {selected === src.id && (
                  <motion.div 
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="rounded-full bg-beat-violet w-full h-full flex items-center justify-center"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 5l3 3 7-7" />
                    </svg>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.button>
        ))}
      </div>

      <Button
        size="lg"
        onClick={handleContinue}
        isLoading={isLoading}
        disabled={!selected}
        id="onboarding-continue-btn"
      >
        Continue
      </Button>
    </div>
  )
}

function PlaylistLinkStep({
  onBack,
  onComplete,
}: {
  onBack: () => void
  onComplete: (options?: OnboardingCompleteOptions) => void
}) {
  const [playlistLink, setPlaylistLink] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)

  async function handleImport() {
    const trimmedLink = playlistLink.trim()
    if (!trimmedLink) return

    setIsSubmitting(true)
    setStepError(null)

    try {
      const result = await api.post<PlaylistImportResponse>('/onboarding/playlist-links/import', {
        inputText: trimmedLink,
      })

      if (result.imported <= 0) {
        setStepError('We could not find any songs in that playlist. Try another public playlist link.')
        setIsSubmitting(false)
        return
      }

      await onComplete()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Playlist import failed.'
      setStepError(message)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-φ4 px-φ4 w-full">
      <div>
        <h2 className="font-display font-bold text-phi-sub text-white">Paste your playlist link</h2>
        <p className="font-body text-white/45 text-phi-sm mt-φ0">
          Apple Music, YouTube, and YouTube Music playlists are supported.
        </p>
      </div>

      <div className="rounded-3xl border border-white/8 bg-white/4 p-4 flex flex-col gap-3">
        <label htmlFor="playlist-link" className="font-body text-[11px] uppercase tracking-[0.18em] text-white/35">
          Playlist URL
        </label>
        <input
          id="playlist-link"
          type="url"
          value={playlistLink}
          onChange={(event) => setPlaylistLink(event.target.value)}
          placeholder="https://music.apple.com/... or https://music.youtube.com/..."
          className="w-full rounded-2xl border border-white/8 bg-space-800 px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-beat-violet/50"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <p className="font-body text-[11px] text-white/35 leading-relaxed">
          Public playlists work best. We’ll clean the source tracks, normalize them against Spotify, and keep any good fallback matches that Spotify does not have.
        </p>
      </div>

      {stepError && (
        <div className="rounded-2xl border border-beat-rose/30 bg-beat-rose/10 px-4 py-3 font-body text-xs text-beat-rose">
          {stepError}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          onClick={handleImport}
          isLoading={isSubmitting}
          disabled={!playlistLink.trim() || isSubmitting}
        >
          Import Playlist
        </Button>
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="text-white/50 hover:text-white active:text-white transition-colors text-sm font-medium py-3 min-h-[44px]"
        >
          Back
        </button>
      </div>
    </div>
  )
}

function PlaylistItem({ 
  playlist, 
  isSelected, 
  onToggle 
}: { 
  playlist: { id: string; name: string; image_url: string | null };
  isSelected: boolean;
  onToggle: (id: string) => void;
}) {
  const textRef = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  // Computed in the same effect as isOverflowing so it is never read from
  // unset refs during render (which always returns 0 on first paint).
  const [scrollDistance, setScrollDistance] = useState(0)

  useEffect(() => {
    if (textRef.current && containerRef.current) {
      const overflow = textRef.current.scrollWidth > containerRef.current.offsetWidth
      setIsOverflowing(overflow)
      setScrollDistance(
        overflow
          ? textRef.current.scrollWidth - containerRef.current.offsetWidth
          : 0,
      )
    }
  }, [playlist.name])

  return (
    <motion.button
      onClick={() => onToggle(playlist.id)}
      whileTap={{ scale: 0.985 }}
      className={[
        'group/item flex items-center gap-4 p-0 h-16 rounded-2xl text-left transition-all duration-200 border relative overflow-hidden shrink-0',
        isSelected
          ? 'bg-beat-violet/15 border-beat-violet/40'
          : 'bg-white/4 border-white/5 hover:bg-white/7 hover:border-white/15',
      ].join(' ')}
    >
      <div className="w-16 h-16 bg-space-700 flex items-center justify-center shrink-0 overflow-hidden">
        {playlist.image_url ? (
          <img src={playlist.image_url} alt={playlist.name} className="w-full h-full object-cover" />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40">
             <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
        )}
      </div>
      <div ref={containerRef} className="flex-1 min-w-0 overflow-hidden">
        <motion.span
          ref={textRef}
          className="font-body font-medium text-white text-base whitespace-nowrap block"
          whileHover={isOverflowing ? { x: -scrollDistance - 10 } : {}}
          transition={{ duration: isOverflowing ? Math.max(1.5, scrollDistance / 40) : 0, ease: 'linear' }}
        >
          {playlist.name}
        </motion.span>
      </div>
      <div className="w-5 h-5 shrink-0 mr-4">
        <AnimatePresence>
          {isSelected && (
            <motion.div 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="rounded-full bg-beat-violet w-full h-full flex items-center justify-center"
            >
              <svg width="10" height="10" viewBox="0 0 12 10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 5l3 3 7-7" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  )
}

function SelectPlaylistStep({ onComplete }: { onComplete: (options?: OnboardingCompleteOptions) => void }) {
  const [playlists, setPlaylists] = useState<{ id: string; name: string; image_url: string | null }[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)
  const arePlaylistImagesReady = useImagePreloadGate(
    playlists.map((playlist) => playlist.image_url),
    playlists.length > 0 && !isLoading,
  )
  const showSkeleton = isLoading || (playlists.length > 0 && !arePlaylistImagesReady)

  useEffect(() => {
    const controller = new AbortController()

    setStepError(null)
    api.get<{ items: { id: string; name: string; image_url: string | null }[] }>('/spotify/playlists?limit=10', {
      signal: controller.signal,
    })
      .then(res => {
        setPlaylists(res.items)
        setIsLoading(false)
      })
      .catch(err => {
        if (controller.signal.aborted) {
          return
        }

        console.error(err)
        setStepError('Failed to load Spotify playlists. Try refreshing the page.')
        setIsLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [])

  function togglePlaylist(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  async function handleAutoImport() {
    setIsSubmitting(true)
    setStepError(null)
    beginBackgroundImport('Updating your top tracks in the background.')
    void api.post<{ imported: number }>('/spotify/top-tracks/import', {})
      .then(() => {
        succeedBackgroundImport('Top tracks imported successfully.')
      })
      .catch((err) => {
        console.error('Background top tracks import failed', err)
        failBackgroundImport('Top tracks import failed. Please try again.')
      })
    onComplete({ navigateImmediately: true })
  }

  async function handleLikedSongsImport() {
    setIsSubmitting(true)
    setStepError(null)
    beginBackgroundImport('Updating your liked songs in the background.')
    void api.post<{ imported: number }>('/spotify/liked-songs/import', {})
      .then(() => {
        succeedBackgroundImport('Liked songs imported successfully.')
      })
      .catch((err) => {
        console.error('Background liked songs import failed', err)
        failBackgroundImport('Liked songs import failed. Please try again.')
      })
    onComplete({ navigateImmediately: true })
  }

  async function handleImport() {
    if (selectedIds.length === 0) return
    setIsSubmitting(true)
    setStepError(null)
    beginBackgroundImport(
      selectedIds.length === 1
        ? 'Updating your playlist in the background.'
        : `Updating ${selectedIds.length} playlists in the background.`,
    )

    void (async () => {
      try {
        for (const id of selectedIds) {
          await api.post<{ imported: number }>(`/spotify/playlists/${id}/import`, {})
        }
        succeedBackgroundImport(
          selectedIds.length === 1
            ? 'Playlist imported successfully.'
            : `${selectedIds.length} playlists imported successfully.`,
        )
      } catch (err) {
        console.error('Background playlist import failed', err)
        failBackgroundImport('Playlist import failed. Please try again.')
      }
    })()

    onComplete({ navigateImmediately: true })
  }

  return (
    <div className="flex flex-col gap-φ4 px-φ4 w-full">
      <div>
        <h2 className="font-display font-bold text-phi-sub text-white">Choose your vibe</h2>
        <p className="font-body text-white/45 text-phi-sm mt-φ0">Select playlists to import your taste.</p>
      </div>

      {stepError && (
        <div className="rounded-2xl border border-beat-rose/30 bg-beat-rose/10 px-4 py-3 font-body text-xs text-beat-rose flex flex-col gap-2">
          <p>{stepError}</p>
          <button 
            onClick={handleAutoImport}
            disabled={isSubmitting}
            className="text-white font-medium underline text-left disabled:opacity-40"
          >
            Or auto-import your Top Tracks instead
          </button>
        </div>
      )}

      {showSkeleton ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Sk.PlaylistRow key={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-φ2 max-h-[400px] overflow-y-auto pb-4 no-scrollbar">
          {playlists.map((playlist) => (
            <PlaylistItem
              key={playlist.id}
              playlist={playlist}
              isSelected={selectedIds.includes(playlist.id)}
              onToggle={togglePlaylist}
            />
          ))}
          {playlists.length === 0 && (
            <p className="text-white/50 text-sm text-center py-4">No Spotify playlists found.</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          onClick={handleImport}
          isLoading={isSubmitting && selectedIds.length > 0}
          disabled={selectedIds.length === 0 || showSkeleton || (isSubmitting && selectedIds.length === 0)}
        >
          Import Selected
        </Button>
        <Button
          size="lg"
          onClick={handleLikedSongsImport}
          isLoading={isSubmitting && selectedIds.length === 0}
          disabled={showSkeleton || isSubmitting}
          variant="outline"
        >
          Import My Liked Songs
        </Button>
        <button 
          onClick={handleAutoImport}
          disabled={showSkeleton || isSubmitting}
          className="text-beat-lilac hover:text-white active:text-white transition-colors text-xs font-semibold py-3 min-h-[44px]"
        >
          Auto-import My Top Tracks
        </button>
      </div>
      <button 
        onClick={() => onComplete()}
        className="text-white/50 hover:text-white active:text-white transition-colors text-sm font-medium mt-1 py-3 min-h-[44px] pb-2"
      >
        Skip for now
      </button>
    </div>
  )
}

function BuildingStep() {
  return (
    <div className="flex flex-col items-center gap-φ4 text-center px-φ4">
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        className="w-20 h-20 rounded-3xl bg-beat-violet/20 border border-beat-violet/30 flex items-center justify-center"
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </motion.div>
      <div>
        <h2 className="font-display font-bold text-phi-sub text-white">Building your vibe…</h2>
        <p className="font-body text-white/45 text-phi-sm mt-φ2">Analysing your music and finding your matches</p>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-beat-violet"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── OnboardingPage ──────────────────────────────────────────────────────────

export function OnboardingPage() {
  const user = useAuthStore((s) => s.user)
  const isRefreshing = useAuthStore((s) => s.isLoading)
  const [step, setStep] = useState<OnboardingStep>(() => {
    if (user?.hasSpotifyLinked) return 'select-playlist'
    // Allow deep-linking into a specific step via ?step=playlist-link
    const params = new URLSearchParams(window.location.search)
    const deepStep = params.get('step') as OnboardingStep | null
    if (deepStep && ['welcome', 'music-source', 'playlist-link', 'select-playlist', 'building'].includes(deepStep)) {
      return deepStep
    }
    return 'welcome'
  })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = usePrefetchedNavigate()
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding)
  const refreshProfile = useAuthStore((s) => s.refreshProfile)
  // Tracks whether a Spotify callback profile refresh is in-flight.
  // We can't rely on spotifyConnected (param is cleaned immediately) or
  // isRefreshing+step (step changes before refresh settles).
  const isCallbackRefreshing = useRef(false)
  const [callbackRefreshVersion, setCallbackRefreshVersion] = useState(0)

  // Read as stable primitives — URLSearchParams object identity changes every render
  const spotifyError = searchParams.get('spotify_error')
  const spotifyConnected = searchParams.get('spotify_connected')

  useEffect(() => {
    if (spotifyError) {
      setSearchParams((current) => {
        const cleaned = new URLSearchParams(current)
        cleaned.delete('spotify_error')
        return cleaned
      }, { replace: true })
      setErrorMessage(formatSpotifyError(spotifyError))
      setStep('music-source')
      return
    }

    if (spotifyConnected === 'true') {
      // Remove the flag immediately so a back-navigation or re-render doesn't re-trigger
      setSearchParams((current) => {
        const cleaned = new URLSearchParams(current)
        cleaned.delete('spotify_connected')
        return cleaned
      }, { replace: true })

      setErrorMessage(null)
      setStep('select-playlist')
      // Mark callback refresh as in-flight so the loading overlay stays visible
      isCallbackRefreshing.current = true
      setCallbackRefreshVersion((v) => v + 1)
      refreshProfile()
        .catch((err: unknown) => {
          console.error('Failed to refresh profile after Spotify connect', err)
          setErrorMessage('Spotify connected, but profile sync was slow. Reload if your playlists do not appear.')
        })
        .finally(() => {
          isCallbackRefreshing.current = false
          setCallbackRefreshVersion((v) => v + 1)
        })
    }
  }, [refreshProfile, setSearchParams, spotifyConnected, spotifyError])

  // If we are refreshing the profile after a callback, show a mini loading state or the building step.
  // We use a local ref (isCallbackRefreshing) instead of spotifyConnected or step because:
  //   • spotifyConnected is cleared immediately after the param cleanup
  //   • step moves to 'select-playlist' before refresh settles
  // eslint-disable-next-line react-hooks/exhaustive-deps -- callbackRefreshVersion forces re-render when ref changes
  const isProcessingCallback = isCallbackRefreshing.current || (isRefreshing && step === 'welcome' && user?.hasSpotifyLinked)
  void callbackRefreshVersion // referenced so the dep above is satisfied
  const progressIndex = step === 'welcome' ? 0 : step === 'music-source' ? 1 : 2


  async function handleMusicComplete(options?: OnboardingCompleteOptions) {
    const navigateImmediately = options?.navigateImmediately ?? false
    if (!navigateImmediately) {
      setStep('building')
    }
    setErrorMessage(null)

    try {
      await completeOnboarding()

      if (!navigateImmediately) {
        // Preserve the existing ambient pacing before revealing discovery.
        await new Promise((r) => setTimeout(r, 2400))
      }

      await navigate('/discovery', { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to finish onboarding'
      setErrorMessage(message)
      setStep('music-source')
    }
  }

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center overflow-hidden bg-space-900">
      <div className="ambient-bg" aria-hidden="true" />

      {/* Step indicator */}
      {step !== 'building' && !isProcessingCallback && (
        <div className="absolute top-12 left-0 right-0 flex justify-center gap-2 z-10" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className={[
                'h-1 rounded-full transition-all duration-400',
                progressIndex === index
                  ? 'w-8 bg-beat-violet'
                  : progressIndex > index
                    ? 'w-4 bg-beat-violet/40'
                    : 'w-4 bg-white/15',
              ].join(' ')}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 w-full max-w-sm py-φ6">
        {errorMessage && (
          <div className="mb-φ4 px-φ4">
            <p className="rounded-2xl border border-beat-rose/30 bg-beat-rose/10 px-φ3 py-φ2 font-body text-phi-sm text-beat-rose">
              {errorMessage}
            </p>
          </div>
        )}
        <AnimatePresence mode="wait">
          {isProcessingCallback || step === 'building' ? (
            <motion.div
              key="building"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <BuildingStep />
            </motion.div>
          ) : step === 'welcome' ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
            >
              <WelcomeStep onNext={() => setStep('music-source')} />
            </motion.div>
          ) : step === 'music-source' ? (
            <motion.div
              key="music-source"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
            >
              <MusicSourceStep
                onComplete={handleMusicComplete}
                onOpenPlaylistLink={() => setStep('playlist-link')}
              />
            </motion.div>
          ) : step === 'playlist-link' ? (
            <motion.div
              key="playlist-link"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
            >
              <PlaylistLinkStep
                onBack={() => setStep('music-source')}
                onComplete={handleMusicComplete}
              />
            </motion.div>
          ) : (
            <motion.div
              key="select-playlist"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
            >
              <SelectPlaylistStep onComplete={handleMusicComplete} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
