import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/services/api'
import { TASTE_QUERY_KEY, VIBE_METRICS_QUERY_KEY } from '@/lib/queryKeys'
import { Sk } from '@/components/ui/Skeleton'
import { useShouldAnimateOnMount } from '@/lib/useShouldAnimateOnMount'
import { Button } from '@/components/ui/Button'

const AVATAR_HUES = [12, 24, 36, 48, 162, 188, 30]

function getAvatarHue(name: string) {
  const code = name.charCodeAt(0) + name.charCodeAt(name.length - 1)
  return AVATAR_HUES[code % AVATAR_HUES.length]
}

interface TasteSong {
  id: string
  spotifyTrackId?: string | null
  title: string
  artist: string
  albumArt: string | null
  source: string
}

interface OnboardingState {
  tasteSongs: TasteSong[]
  tasteSongCount: number
  spotifyConnected: boolean
  onboardingCompleted: boolean
}

interface VibeFeatures {
  energy: number | null
  danceability: number | null
  tempo_bpm: number | null
  loudness: number | null
  spectral_centroid: number | null
  spectral_contrast: number | null
}

interface VibeMetrics {
  song_count_with_features: number
  features: VibeFeatures
}

function splitArtists(artistText: string) {
  return artistText
    .split(/\s*(?:•|-|,)\s*/)
    .map((artist) => artist.trim())
    .filter(Boolean)
}

// ─── Vibe Bubble definitions ─────────────────────────────────────────────────

interface BubbleDef {
  featureKey: keyof VibeFeatures
  label: string
  /** Tooltip shown on hover */
  tooltip: string
  /** Convert raw feature value → [0, 1] for radius sizing */
  normalise: (v: number) => number
  /** HSL hue for the bubble gradient */
  hue: number
  /** Emoji icon in the bubble */
  icon: string
}

const BUBBLE_DEFS: BubbleDef[] = [
  {
    featureKey: 'energy',
    label: 'Energy',
    tooltip: 'How intense & active your music feels',
    normalise: (v) => Math.min(1, Math.max(0, v / 0.12)), // Recalibrated: 0.06 RMS^2 -> 50%
    hue: 15,
    icon: '⚡',
  },
  {
    featureKey: 'danceability',
    label: 'Groove',
    tooltip: 'How rhythmically danceable your songs are',
    normalise: (v) => Math.min(1, Math.max(0, v / 2.0)), // Essentia typically ~1.0
    hue: 290,
    icon: '🕺',
  },
  {
    featureKey: 'tempo_bpm',
    label: 'Tempo',
    tooltip: 'Average BPM of your taste profile',
    normalise: (v) => Math.min(1, Math.max(0, (v - 50) / 140)), // 50–190 BPM range
    hue: 210,
    icon: '🥁',
  },
  {
    featureKey: 'loudness',
    label: 'Loudness',
    tooltip: 'How full and loud your tracks tend to be',
    normalise: (v) => Math.min(1, Math.max(0, (v + 35) / 30)), // -30dB to -5dB range
    hue: 45,
    icon: '🔊',
  },
  {
    featureKey: 'spectral_centroid',
    label: 'Brightness',
    tooltip: 'How bright or treble-heavy your songs sound',
    normalise: (v) => Math.min(1, Math.max(0, v / 2500)), // ~0–2500 Hz typical
    hue: 170,
    icon: '✨',
  },
  {
    featureKey: 'spectral_contrast',
    label: 'Uniqueness',
    tooltip: 'How sonically distinct & colourful your taste is',
    normalise: (v) => Math.min(1, Math.max(0, v / 0.07)), // Recalibrated: 0.035 linear -> 50%
    hue: 330,
    icon: '🌀',
  },
]

// ─── Single vibe bubble ───────────────────────────────────────────────────────

interface VibeBubbleProps extends BubbleDef {
  /** Normalised 0–1 fill value */
  value: number
  index: number
  /** When false the bubble skips its entrance animation (already visible on mount) */
  animate?: boolean
}

function VibeBubble({ label, tooltip, hue, value, index, icon, animate: doAnimate = true }: VibeBubbleProps) {
  // Map 0…1 → 52px … 88px diameter (clamped)
  const minDiam = 52
  const maxDiam = 88
  const rawDiameter = minDiam + value * (maxDiam - minDiam)
  const diam = Math.round(Math.max(minDiam, Math.min(rawDiameter, maxDiam)))

  const pct = Math.round(value * 100)

  // Subtle float offsets unique per bubble
  const floatY = [(- 6), 5, -4, 7, -5, 4][index % 6]
  const floatDuration = 3.2 + index * 0.45

  return (
    <motion.div
      className="flex flex-col items-center gap-1.5 group cursor-default"
      // Entrance animation — skip when data was already cached at mount time
      initial={doAnimate ? { opacity: 0, scale: 0.4 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        delay: doAnimate ? 0.1 + index * 0.07 : 0,
        type: 'spring',
        stiffness: 320,
        damping: 22,
      }}
      title={tooltip}
      aria-label={`${label}: ${pct}%`}
    >
      {/* Float wrapper — keeps the label attached during float */}
      <motion.div
        className="flex flex-col items-center gap-1.5"
        animate={{ y: [0, floatY, 0] }}
        transition={{ repeat: Infinity, duration: floatDuration, ease: 'easeInOut' }}
      >
        {/* Bubble */}
        <div
          className="relative flex items-center justify-center rounded-full select-none"
          style={{
            width: diam,
            height: diam,
            background: `radial-gradient(circle at 35% 35%,
              hsla(${hue},90%,80%,0.45) 0%,
              hsla(${hue},75%,55%,0.25) 45%,
              hsla(${hue},60%,35%,0.12) 100%)`,
            border: `1.5px solid hsla(${hue},80%,70%,0.4)`,
            boxShadow: `0 0 ${8 + Math.round(value * 16)}px hsla(${hue},80%,65%,${0.2 + value * 0.3}),
                        inset 0 1px 2px hsla(${hue},100%,95%,0.25)`,
            transition: 'box-shadow 0.3s',
          }}
        >
          {/* Glow pulse ring */}
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ border: `1px solid hsla(${hue},80%,70%,0.3)` }}
            animate={{ scale: [1, 1.14, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ repeat: Infinity, duration: 2.6 + index * 0.4, ease: 'easeInOut' }}
          />

          {/* Icon + pct stacked */}
          <div className="flex flex-col items-center leading-none gap-px select-none">
            <span style={{ fontSize: Math.max(12, Math.round(diam * 0.22)) }}>{icon}</span>
            <span
              className="font-body font-bold"
              style={{
                fontSize: Math.max(10, Math.min(14, Math.round(diam * 0.17))),
                color: `hsla(${hue},90%,92%,1)`,
                textShadow: `0 0 8px hsla(${hue},80%,60%,0.6)`,
              }}
            >
              {pct}%
            </span>
          </div>

          {/* Hover overlay */}
          <div
            role="tooltip"
            className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            style={{
              background: `hsla(${hue},60%,20%,0.75)`,
              backdropFilter: 'blur(4px)',
            }}
          >
            <span
              className="font-display font-bold text-white"
              style={{ fontSize: Math.max(10, Math.round(diam * 0.18)) }}
            >
              {pct}%
            </span>
          </div>
        </div>

        {/* Label below */}
        <span
          className="font-body text-[10px] font-medium tracking-wide"
          style={{ color: `hsla(${hue},70%,75%,0.9)` }}
        >
          {label}
        </span>
      </motion.div>
    </motion.div>
  )
}

// ─── Skeleton bubble ──────────────────────────────────────────────────────────

function SkeletonBubble({ index }: { index: number }) {
  const diam = 52 + (index % 3) * 10
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="rounded-full bg-white/6 animate-pulse"
        style={{ width: diam, height: diam }}
      />
      <div className="h-2 w-10 rounded-full bg-white/6 animate-pulse" />
    </div>
  )
}

// ─── Main vibe section ────────────────────────────────────────────────────────

function VibeMetricBubbles({
  metrics,
  isLoading,
  shouldAnimate,
}: {
  metrics: VibeMetrics | undefined
  isLoading: boolean
  /** When false, skip entrance animations (data was already in cache at mount) */
  shouldAnimate: boolean
}) {
  const MIN_SONGS = 15
  const analysedCount = metrics?.song_count_with_features ?? 0
  const hasSomeData =
    metrics !== undefined &&
    analysedCount >= MIN_SONGS &&
    Object.values(metrics.features).some((v) => v !== null)

  // Show placeholder when fewer than MIN_SONGS songs have been analysed
  if (!isLoading && !hasSomeData) {
    const remaining = Math.max(0, MIN_SONGS - analysedCount)
    return (
      <motion.section
        initial={shouldAnimate ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: shouldAnimate ? 0.2 : 0, duration: 0.34 }}
        className="mx-5 mb-5 shrink-0"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-body font-semibold text-white/50 text-xs uppercase tracking-widest">
            Vybe Profile
          </h2>
        </div>
        <div
          className="glass rounded-2xl border border-white/8 p-4 flex flex-col items-center gap-2"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
          }}
        >
          <p className="font-body text-white/40 text-sm text-center max-w-xs">
            {analysedCount === 0
              ? 'Songs are still being analysed. Your Vybe Profile will unlock once at least 15 songs are processed.'
              : `${analysedCount} of ${MIN_SONGS} songs analysed — ${remaining} more needed to unlock your Vybe Profile.`
            }
          </p>
          {analysedCount > 0 && (
            <div className="w-full max-w-[180px] h-1 rounded-full bg-white/8 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #A78BFA, #818CF8)' }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.round((analysedCount / MIN_SONGS) * 100)}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          )}
        </div>
      </motion.section>
    )
  }

  return (
    <motion.section
      initial={shouldAnimate ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: shouldAnimate ? 0.2 : 0, duration: 0.34 }}
      className="mx-5 mb-5 shrink-0"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-body font-semibold text-white/50 text-xs uppercase tracking-widest">
          Vibe Profile
        </h2>
        {!isLoading && analysedCount >= MIN_SONGS && (
          <span className="font-body text-white/25 text-[10px]">
            {analysedCount} songs analysed
          </span>
        )}
      </div>

      {/* Bubbles container — flex-wrap grid, no overlap */}
      <div
        className="glass rounded-2xl border border-white/8 p-5"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
        }}
      >
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 place-items-center">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonBubble key={i} index={i} />)
            : BUBBLE_DEFS.map((def, i) => {
                const raw = metrics?.features[def.featureKey] ?? null
                const value = raw !== null ? def.normalise(raw) : 0
                return <VibeBubble key={def.featureKey} {...def} value={value} index={i} animate={shouldAnimate} />
              })
          }
        </div>

        {/* Legend / caption */}
        {!isLoading && hasSomeData && (
          <p className="font-body text-white/20 text-[10px] text-center mt-4 leading-snug">
            Bubble size reflects how strongly each trait shapes your music taste.
          </p>
        )}
      </div>
    </motion.section>
  )
}

// ─── ETLab Verification Card ──────────────────────────────────────────────────

function ETLabVerificationCard({ shouldAnimate }: { shouldAnimate: boolean }) {
  const verifyEtlab = useAuthStore((s) => s.verifyEtlab)
  const [isOpen, setIsOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    setIsSubmitting(true)
    setError(null)
    try {
      await verifyEtlab(username.trim(), password.trim())
      // On success the store updates user.isEtlabVerified — card unmounts
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed. Please check your credentials.'
      setError(message)
      setIsSubmitting(false)
    }
  }

  return (
    <motion.section
      initial={shouldAnimate ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: shouldAnimate ? 0.16 : 0, duration: 0.34 }}
      className="mx-5 mb-4 shrink-0"
    >
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(167,139,250,0.07) 0%, rgba(139,92,246,0.04) 100%)',
          borderColor: 'rgba(167,139,250,0.2)',
        }}
      >
        {/* Header row */}
        <button
          id="etlab-verify-toggle"
          type="button"
          onClick={() => { setIsOpen((v) => !v); setError(null) }}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        >
          {/* Shield icon */}
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.25)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-body font-semibold text-white text-sm">Verify with ETLab</p>
            <p className="font-body text-white/40 text-xs mt-0.5">Prove you're an SCTCE student</p>
          </div>

          {/* Chevron */}
          <motion.svg
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </motion.svg>
        </button>

        {/* Expandable form */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="etlab-form"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <form
                onSubmit={(e) => void handleSubmit(e)}
                className="px-4 pb-4 flex flex-col gap-3"
              >
                <div
                  className="h-px w-full mb-1"
                  style={{ background: 'rgba(167,139,250,0.12)' }}
                />

                {/* Username */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="etlab-username" className="font-body text-[10px] uppercase tracking-[0.16em] text-white/35">
                    ETLab Username
                  </label>
                  <input
                    id="etlab-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. 21CS042"
                    autoComplete="username"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={isSubmitting}
                    className="w-full rounded-xl border px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-beat-violet/50 disabled:opacity-40"
                    style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}
                  />
                </div>

                {/* Password */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="etlab-password" className="font-body text-[10px] uppercase tracking-[0.16em] text-white/35">
                    ETLab Password
                  </label>
                  <input
                    id="etlab-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your ETLab password"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    className="w-full rounded-xl border px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-beat-violet/50 disabled:opacity-40"
                    style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}
                  />
                </div>

                {/* Error message */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-beat-rose/30 bg-beat-rose/10 px-3 py-2.5 font-body text-xs text-beat-rose"
                  >
                    {error}
                  </motion.div>
                )}

                <Button
                  type="submit"
                  size="md"
                  isLoading={isSubmitting}
                  disabled={!username.trim() || !password.trim()}
                  id="etlab-verify-submit"
                >
                  Verify my identity
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}

// ─── ETLab verified badge ─────────────────────────────────────────────────────

function ETLabBadge({ shouldAnimate }: { shouldAnimate: boolean }) {
  return (
    <motion.div
      initial={shouldAnimate ? { opacity: 0, scale: 0.85 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: shouldAnimate ? 0.14 : 0, type: 'spring', stiffness: 340, damping: 22 }}
      className="mx-5 mb-4 shrink-0"
    >
      <div
        className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
        style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="9 12 11 14 15 10" />
        </svg>
        <div>
          <p className="font-body font-semibold text-emerald-400 text-sm">ETLab Verified</p>
          <p className="font-body text-white/35 text-xs mt-0.5">Your SCTCE identity is confirmed</p>
        </div>
      </div>
    </motion.div>
  )
}


// ─── Page ──────────────────────────────────────────────────────────────────────

/**
 * Root cause of the navigation flicker: ProfilePage's child <motion.div> elements
 * previously ran unconditional entrance animations (initial={{ opacity: 0 }}) on
 * every mount. Combined with PageTransition's own fade-in this caused two animation
 * cycles: the page faded in, then each element re-animated from invisible once
 * isLoading flipped or data arrived — producing a visible "remount" flicker.
 *
 * Fix: mirror the pattern used by MyVibesPage — snapshot whether both query caches
 * are already populated at mount time and freeze that flag in a ref. When the data
 * was already cached, all child motion.* entrance animations are skipped (initial=false)
 * so only PageTransition's single fade runs.
 */
export function ProfilePage() {
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)
  const isSigningOut = useAuthStore((state) => state.isSigningOut)
  const queryClient = useQueryClient()

  const displayName = user?.name ?? 'You'
  const hue = getAvatarHue(displayName)

  // Snapshot whether BOTH caches are warm before the first render.
  // Freezing the value in a ref prevents later refetches from toggling animations.
  const wasPreloaded = useRef(
    (() => {
      const taste = queryClient.getQueryData<OnboardingState>(TASTE_QUERY_KEY)
      const vibe  = queryClient.getQueryData<VibeMetrics>(VIBE_METRICS_QUERY_KEY)
      return (
        Array.isArray(taste?.tasteSongs) &&
        taste.tasteSongs.length > 0 &&
        vibe !== undefined
      )
    })()
  )
  // When data was already cached, skip child entrance animations to avoid
  // the double-animation caused by PageTransition + per-element motion.
  const shouldAnimate = useShouldAnimateOnMount(!wasPreloaded.current)

  // ── Share the exact same cache key as MyVibesPage ───────────────────────────
  const { data: onboardingState, isLoading } = useQuery<OnboardingState>({
    queryKey: TASTE_QUERY_KEY,
    queryFn: () => api.get<OnboardingState>('/onboarding/state'),
    enabled: !!user,
  })

  // ── Vibe metrics (audio features) ──────────────────────────────────────────
  const { data: vibeMetrics, isLoading: isLoadingVibe } = useQuery<VibeMetrics>({
    queryKey: VIBE_METRICS_QUERY_KEY,
    queryFn: () => api.get<VibeMetrics>('/profile/vibe-metrics'),
    enabled: !!user,
    // Vibe data is slow-moving — 5-minute stale time is fine
    staleTime: 5 * 60 * 1000,
  })

  const { topArtists, artistCount } = useMemo(() => {
    if (!onboardingState) {
      return {
        topArtists: [] as string[],
        artistCount: undefined as number | undefined,
      }
    }

    const artistsByCountMap = onboardingState.tasteSongs
      .reduce<Map<string, number>>((acc, song) => {
        splitArtists(song.artist).forEach((artist) => {
          acc.set(artist, (acc.get(artist) ?? 0) + 1)
        })
        return acc
      }, new Map())

    const artistsByCount = [...artistsByCountMap
      .entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([artist]) => artist)

    return {
      topArtists: artistsByCount,
      artistCount: artistsByCountMap.size,
    }
  }, [onboardingState])

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28">
      {/* Avatar + identity */}
      <motion.div
        initial={shouldAnimate ? { opacity: 0, y: 16 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38 }}
        className="relative px-5 pt-8 pb-6 shrink-0 flex flex-col items-center"
      >
        <div className="relative mb-4">
          <div
            className="absolute inset-0 rounded-full blur-2xl opacity-40 scale-150"
            style={{ background: `hsla(${hue},80%,60%,0.5)` }}
            aria-hidden="true"
          />
          <div
            className="relative w-24 h-24 rounded-3xl flex items-center justify-center select-none"
            style={{
              background: `linear-gradient(135deg, hsla(${hue},70%,50%,0.35) 0%, hsla(${hue + 40},60%,40%,0.18) 100%)`,
              border: `1.5px solid hsla(${hue},80%,70%,0.35)`,
              boxShadow: `0 8px 32px hsla(${hue},70%,50%,0.25)`,
            }}
            aria-label="Profile avatar"
          >
            <span
              className="font-display font-black text-4xl"
              style={{ color: `hsla(${hue},90%,85%,1)` }}
            >
              {displayName[0]?.toUpperCase()}
            </span>
          </div>
        </div>

        <h1 className="font-display font-bold text-2xl text-white leading-tight text-center">
          {displayName}
        </h1>
        {user?.registerNumber && (
          <p className="font-body text-white/35 text-sm mt-1 tracking-wide">
            {user.registerNumber}
          </p>
        )}

        {/* Spotify badge */}
        <div
          className={[
            'mt-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-body font-medium',
            user?.hasSpotifyLinked
              ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400'
              : 'bg-white/5 border border-white/10 text-white/35',
          ].join(' ')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          {user?.hasSpotifyLinked ? 'Spotify linked' : 'Spotify not linked'}
        </div>
      </motion.div>

      {/* Stats strip */}
      <motion.div
        initial={shouldAnimate ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: shouldAnimate ? 0.08 : 0, duration: 0.32 }}
        className="mx-5 mb-4 shrink-0"
      >
        <div className="grid grid-cols-2 gap-2">
          {isLoading ? (
            <>
              <Sk.StatCard />
              <Sk.StatCard />
            </>
          ) : (
            [{ label: 'Songs',   value: onboardingState?.tasteSongCount },
             { label: 'Artists', value: artistCount },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="glass rounded-2xl border border-white/8 p-3 flex flex-col items-center gap-0.5"
              >
                <span className="font-display font-bold text-xl text-white">
                  {value ?? '—'}
                </span>
                <span className="font-body text-white/35 text-[10px]">{label}</span>
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* ── ETLab Verification ──────────────────────────────────────────────── */}
      {user?.isEtlabVerified
        ? <ETLabBadge shouldAnimate={shouldAnimate} />
        : <ETLabVerificationCard shouldAnimate={shouldAnimate} />
      }

      {/* ── Vibe Metric Bubbles ─────────────────────────────────────────────── */}
      <VibeMetricBubbles metrics={vibeMetrics} isLoading={isLoadingVibe} shouldAnimate={shouldAnimate} />

      {/* Top Artists */}
      {(isLoading || topArtists.length > 0) && (
        <motion.section
          initial={shouldAnimate ? { opacity: 0, y: 12 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: shouldAnimate ? 0.28 : 0, duration: 0.32 }}
          className="mx-5 mb-4 shrink-0"
        >
          <h2 className="font-body font-semibold text-white/50 text-xs uppercase tracking-widest mb-3">
            Top Artists
          </h2>
          {isLoading ? (
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: 5 }).map((_, i) => <Sk.ArtistPill key={i} index={i} />)}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topArtists.map((artist) => (
                <span
                  key={artist}
                  className="px-3 py-1.5 rounded-full glass border border-beat-violet/20 text-beat-lilac text-xs font-body font-medium"
                >
                  {artist}
                </span>
              ))}
            </div>
          )}
        </motion.section>
      )}

      {/* Sign out */}
      <motion.div
        initial={shouldAnimate ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: shouldAnimate ? 0.36 : 0, duration: 0.32 }}
        className="px-5 mb-10 shrink-0"
      >
        <button
          id="profile-sign-out-btn"
          onClick={() => void signOut()}
          disabled={isSigningOut}
          className="w-full flex items-center justify-center gap-2 mt-3 py-3 rounded-2xl
                     text-beat-rose/70 hover:text-beat-rose active:text-beat-rose active:bg-beat-rose/5 transition-colors font-body text-sm
                     disabled:opacity-40"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </button>
      </motion.div>
    </div>
  )
}
