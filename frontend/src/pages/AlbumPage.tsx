import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/services/api'
import { TASTE_QUERY_KEY } from '@/lib/queryKeys'
import { useImagePreloadGate } from '@/lib/useImagePreloadGate'
import { ExplicitBadge } from '@/components/common/ExplicitBadge'
import { useToast } from '@/components/ui/Toast'

interface AlbumTrack {
  id: string
  spotifyTrackId: string
  isrc?: string | null
  title: string
  artist: string
  album?: string | null
  albumArt: string | null
  explicit?: boolean
  durationMs?: number | null
}

interface AlbumDetail {
  id: string
  title: string
  artist: string
  image: string | null
  bannerImage?: string | null
  spotifyUrl?: string | null
  releaseDate?: string | null
  genres: string[]
  label?: string | null
  tracks: AlbumTrack[]
}

interface OnboardingState {
  tasteSongs: Array<{ spotifyTrackId?: string | null }>
  tasteSongCount: number
  spotifyConnected: boolean
  onboardingCompleted: boolean
}

function formatDuration(durationMs?: number | null) {
  if (!durationMs) return null
  const totalSeconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function AlbumPage() {
  const { albumId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: album, isLoading } = useQuery<AlbumDetail>({
    queryKey: ['spotify-album', albumId],
    queryFn: () => api.get<AlbumDetail>(`/spotify/albums/${albumId}`),
    enabled: Boolean(albumId),
  })

  const { data: onboardingState } = useQuery<OnboardingState>({
    queryKey: TASTE_QUERY_KEY,
    queryFn: () => api.get<OnboardingState>('/onboarding/state'),
  })

  const existingTrackIds = useMemo(
    () => new Set(
      (onboardingState?.tasteSongs ?? [])
        .flatMap((song) => (song.spotifyTrackId ? [song.spotifyTrackId] : [])),
    ),
    [onboardingState?.tasteSongs],
  )

  const addMutation = useMutation({
    mutationFn: (song: AlbumTrack) =>
      api.post('/onboarding/songs', {
        song,
        source: 'manual',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TASTE_QUERY_KEY })
    },
    onError: () => {
      toast('Could not add this song right now.', 'error')
    },
  })

  const heroImage = album?.bannerImage ?? album?.image ?? null
  const albumImageSources = useMemo(
    () => album
      ? [
          heroImage,
          album.image,
          ...album.tracks.map((song) => song.albumArt),
        ]
      : [],
    [album, heroImage],
  )
  const areAlbumImagesReady = useImagePreloadGate(
    albumImageSources,
    Boolean(album) && !isLoading,
  )
  const showSkeleton = isLoading || !album || !areAlbumImagesReady

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28">
      {showSkeleton ? (
        <div className="pt-0">
          <div className="relative overflow-hidden bg-space-800 min-h-[18rem] rounded-b-[2rem]">
            <div className="absolute inset-0 shimmer" />
            <div className="absolute left-5 top-6 z-10 h-11 w-11 rounded-full shimmer" />
            <div className="absolute right-5 top-6 z-10 h-11 w-11 rounded-full shimmer" />
            <div className="relative flex min-h-[18rem] flex-col justify-end px-5 pb-5 pt-20">
              <div className="flex items-end gap-4">
                <div className="h-24 w-24 rounded-3xl shimmer shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="h-8 w-44 shimmer rounded-full" />
                  <div className="mt-3 h-4 w-32 shimmer rounded-full opacity-80" />
                  <div className="mt-3 h-3 w-28 shimmer rounded-full opacity-60" />
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 mt-6">
            <div className="h-6 w-20 shimmer rounded-full mb-3" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 p-3 rounded-2xl glass border border-white/6">
                  <div className="h-12 w-12 rounded-xl shimmer shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="h-4 w-36 shimmer rounded-full" />
                    <div className="mt-2 h-3 w-24 shimmer rounded-full opacity-70" />
                  </div>
                  <div className="h-11 w-16 rounded-full shimmer shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <section className="pt-0">
            <div className="relative overflow-hidden bg-space-800 min-h-[18rem] rounded-b-[2rem]">
              {heroImage ? (
                <img
                  src={heroImage}
                  alt={album.title}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-space-950 via-space-950/65 to-space-950/15" />
              <button
                onClick={() => navigate(-1)}
                className="absolute left-5 top-6 z-10 w-11 h-11 rounded-full border border-white/10 bg-space-950/55 backdrop-blur-xl flex items-center justify-center text-white/75 hover:text-white active:bg-space-900/80 transition-colors shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                aria-label="Back"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              {album.spotifyUrl ? (
                <a
                  href={album.spotifyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute right-5 top-6 z-10 w-11 h-11 rounded-full border border-white/10 bg-space-950/35 backdrop-blur-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-space-900/55 transition-colors shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
                  aria-label="Open album in Spotify"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0Zm5.505 17.307a.747.747 0 0 1-1.028.246c-2.814-1.719-6.354-2.109-10.521-1.158a.748.748 0 0 1-.333-1.458c4.56-1.04 8.463-.597 11.635 1.341a.748.748 0 0 1 .247 1.03Zm1.468-3.266a.935.935 0 0 1-1.287.308c-3.221-1.98-8.13-2.554-11.94-1.397a.935.935 0 1 1-.542-1.79c4.35-1.319 9.76-.682 13.462 1.593a.935.935 0 0 1 .307 1.286Zm.126-3.4C15.242 8.35 8.871 8.136 5.385 9.204a1.122 1.122 0 1 1-.656-2.146c4.01-1.224 11.06-.986 15.546 1.852a1.122 1.122 0 1 1-1.176 1.731Z" />
                  </svg>
                </a>
              ) : null}

              <div className="relative flex min-h-[18rem] flex-col justify-end px-5 pb-5 pt-20">
                <div className="flex items-end gap-4">
                  <div className="w-24 h-24 rounded-3xl overflow-hidden bg-space-700/80 border border-white/10 shrink-0">
                    {album.image ? <img src={album.image} alt={album.title} className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0">
                    <h1 className="font-display text-3xl font-bold text-white">{album.title}</h1>
                    <p className="mt-1 text-white/55 text-sm">{album.artist}</p>
                    <p className="mt-2 text-white/40 text-xs">
                      {album.releaseDate ? new Date(album.releaseDate).getFullYear() : null}
                      {album.label ? ` • ${album.label}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="px-5 mt-6">
            <h2 className="font-display text-lg font-bold text-white mb-3">Tracks</h2>
            <div className="flex flex-col gap-2">
              {album.tracks.map((song) => {
                const alreadyAdded = existingTrackIds.has(song.spotifyTrackId)
                const isAdding = addMutation.isPending && addMutation.variables?.spotifyTrackId === song.spotifyTrackId
                const duration = formatDuration(song.durationMs)

                return (
                  <div key={song.id} className="flex items-center gap-3 p-3 rounded-2xl glass border border-white/6">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-space-700 shrink-0">
                      {song.albumArt ? <img src={song.albumArt} alt={song.title} className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-white text-sm font-medium line-clamp-1">{song.title}</p>
                        {song.explicit && <ExplicitBadge />}
                      </div>
                      <p className="text-white/40 text-xs line-clamp-1 mt-0.5">
                        {song.artist}
                        {duration ? ` • ${duration}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (alreadyAdded || isAdding) return
                        addMutation.mutate(song)
                      }}
                      disabled={alreadyAdded || isAdding}
                      className={[
                        'min-w-[3.5rem] h-11 px-3 rounded-xl flex items-center justify-center shrink-0 transition-all text-xs font-semibold',
                        alreadyAdded
                          ? 'bg-white/8 border border-white/10 text-white/45 cursor-default'
                          : 'bg-beat-violet/20 border border-beat-violet/30 text-beat-lilac hover:bg-beat-violet/35',
                      ].join(' ')}
                    >
                      {isAdding ? (
                        <div className="w-3.5 h-3.5 border border-beat-lilac border-t-transparent rounded-full animate-spin" />
                      ) : alreadyAdded ? (
                        'Added'
                      ) : (
                        'Add'
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
