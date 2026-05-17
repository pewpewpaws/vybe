import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { api } from '@/services/api'
import { TASTE_QUERY_KEY } from '@/lib/queryKeys'
import { useImagePreloadGate } from '@/lib/useImagePreloadGate'
import { ExplicitBadge } from '@/components/common/ExplicitBadge'
import { useToast } from '@/components/ui/Toast'
import { usePrefetchedNavigate } from '@/lib/usePrefetchedNavigate'

function titleCaseTag(tag: string) {
  return tag.replace(/\b\w/g, (char) => char.toUpperCase())
}

function truncateAtWord(text: string, maxLength: number) {
  if (text.length <= maxLength) return text
  const candidate = text.slice(0, maxLength)
  const lastSpace = candidate.lastIndexOf(' ')
  const safeSlice = lastSpace > maxLength * 0.6 ? candidate.slice(0, lastSpace) : candidate
  return `${safeSlice.trimEnd()}...`
}

interface ArtistTrack {
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

interface ArtistAlbum {
  id: string
  title: string
  artist: string
  image: string | null
  releaseDate?: string | null
  totalTracks?: number | null
}

interface ArtistDetail {
  id: string
  name: string
  image: string | null
  bannerImage?: string | null
  spotifyUrl?: string | null
  genres: string[]
  followers?: number | null
  popularity?: number | null
  about?: string | null
  tags: string[]
  lastfmUrl?: string | null
  topTracks: ArtistTrack[]
  albums: ArtistAlbum[]
}

interface SimilarArtist {
  id?: string | null
  name: string
  image?: string | null
  genres?: string[]
  followers?: number | null
  popularity?: number | null
  match?: string | number | null
  url?: string | null
}

interface OnboardingState {
  tasteSongs: Array<{ spotifyTrackId?: string | null }>
  tasteSongCount: number
  spotifyConnected: boolean
  onboardingCompleted: boolean
}

export function ArtistPage() {
  const { artistId = '' } = useParams()
  const navigate = usePrefetchedNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [aboutExpanded, setAboutExpanded] = useState(false)

  const { data: artist, isLoading } = useQuery<ArtistDetail>({
    queryKey: ['spotify-artist', artistId],
    queryFn: () => api.get<ArtistDetail>(`/spotify/artists/${artistId}`),
    enabled: Boolean(artistId),
  })

  const { data: onboardingState } = useQuery<OnboardingState>({
    queryKey: TASTE_QUERY_KEY,
    queryFn: () => api.get<OnboardingState>('/onboarding/state'),
  })

  const { data: similarArtistsData, isLoading: isSimilarLoading } = useQuery<{ items: SimilarArtist[] }>({
    queryKey: ['spotify-artist-similar', artistId],
    queryFn: () => api.get<{ items: SimilarArtist[] }>(`/spotify/artists/${artistId}/similar`),
    enabled: Boolean(artistId),
    staleTime: 10 * 60 * 1000,
  })

  const existingTrackIds = useMemo(
    () => new Set(
      (onboardingState?.tasteSongs ?? [])
        .flatMap((song) => (song.spotifyTrackId ? [song.spotifyTrackId] : [])),
    ),
    [onboardingState?.tasteSongs],
  )

  const addMutation = useMutation({
    mutationFn: (song: ArtistTrack) =>
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

  const heroImage = artist?.bannerImage ?? artist?.image ?? null
  const similarArtists = similarArtistsData?.items ?? []
  const aboutText = artist?.about?.trim() ?? ''
  const needsAboutToggle = aboutText.length > 140
  const visibleAboutText = !needsAboutToggle || aboutExpanded
    ? aboutText
    : truncateAtWord(aboutText, 140)
  const artistImageSources = useMemo(
    () => artist
      ? [
          heroImage,
          artist.image,
          ...artist.topTracks.map((song) => song.albumArt),
          ...artist.albums.map((album) => album.image),
          ...similarArtists.map((similar) => similar.image),
        ]
      : [],
    [artist, heroImage, similarArtists],
  )
  const areArtistImagesReady = useImagePreloadGate(
    artistImageSources,
    Boolean(artist) && !isLoading && !isSimilarLoading,
  )
  const showSkeleton = isLoading || !artist || !areArtistImagesReady

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
                  <div className="h-8 w-40 shimmer rounded-full" />
                  <div className="mt-3 h-4 w-32 shimmer rounded-full opacity-80" />
                  <div className="mt-3 h-3 w-36 shimmer rounded-full opacity-60" />
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 mt-6">
            <div className="rounded-3xl glass border border-white/6 p-4">
              <div className="h-6 w-20 shimmer rounded-full" />
              <div className="mt-4 h-3 w-full shimmer rounded-full opacity-80" />
              <div className="mt-2 h-3 w-[92%] shimmer rounded-full opacity-70" />
              <div className="mt-2 h-3 w-[80%] shimmer rounded-full opacity-60" />
              <div className="mt-4 flex flex-wrap gap-2">
                <div className="h-8 w-20 shimmer rounded-full" />
                <div className="h-8 w-24 shimmer rounded-full" />
                <div className="h-8 w-16 shimmer rounded-full" />
              </div>
            </div>
          </div>

          <div className="px-5 mt-6">
            <div className="h-6 w-24 shimmer rounded-full mb-3" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 p-3 rounded-2xl glass border border-white/6">
                  <div className="h-12 w-12 rounded-xl shimmer shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="h-4 w-40 shimmer rounded-full" />
                    <div className="mt-2 h-3 w-28 shimmer rounded-full opacity-70" />
                  </div>
                  <div className="h-11 w-16 rounded-full shimmer shrink-0" />
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 mt-6">
            <div className="h-6 w-20 shimmer rounded-full mb-3" />
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="rounded-2xl glass border border-white/6 p-3">
                      <div className="aspect-square rounded-xl shimmer" />
                  <div className="mt-2 h-4 w-24 shimmer rounded-full" />
                  <div className="mt-2 h-3 w-16 shimmer rounded-full opacity-70" />
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
                  alt={artist.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-space-950 via-space-950/65 to-space-950/15" />
              <button
                onClick={() => navigate('/add-songs')}
                className="absolute left-5 top-6 z-10 w-11 h-11 rounded-full border border-white/10 bg-space-950/55 backdrop-blur-xl flex items-center justify-center text-white/75 hover:text-white active:bg-space-900/80 transition-colors shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                aria-label="Back"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              {artist.spotifyUrl ? (
                <a
                  href={artist.spotifyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute right-5 top-6 z-10 w-11 h-11 rounded-full border border-white/10 bg-space-950/35 backdrop-blur-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-space-900/55 transition-colors shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
                  aria-label="Open artist in Spotify"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0Zm5.505 17.307a.747.747 0 0 1-1.028.246c-2.814-1.719-6.354-2.109-10.521-1.158a.748.748 0 0 1-.333-1.458c4.56-1.04 8.463-.597 11.635 1.341a.748.748 0 0 1 .247 1.03Zm1.468-3.266a.935.935 0 0 1-1.287.308c-3.221-1.98-8.13-2.554-11.94-1.397a.935.935 0 1 1-.542-1.79c4.35-1.319 9.76-.682 13.462 1.593a.935.935 0 0 1 .307 1.286Zm.126-3.4C15.242 8.35 8.871 8.136 5.385 9.204a1.122 1.122 0 1 1-.656-2.146c4.01-1.224 11.06-.986 15.546 1.852a1.122 1.122 0 1 1-1.176 1.731Z" />
                  </svg>
                </a>
              ) : null}

              <div className="relative flex min-h-[18rem] flex-col justify-end px-5 pb-5 pt-20">
                <div className="flex items-end gap-4">
                  <div className="w-24 h-24 rounded-3xl overflow-hidden bg-space-700/80 border border-white/10 shrink-0">
                    {artist.image ? <img src={artist.image} alt={artist.name} className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0">
                    <h1 className="font-display text-3xl font-bold text-white">{artist.name}</h1>
                    <p className="mt-1 text-white/55 text-sm">{artist.genres.slice(0, 3).join(' • ') || 'Artist'}</p>
                    <p className="mt-2 text-white/40 text-xs">
                      {artist.followers ? `${artist.followers.toLocaleString()} followers` : null}
                      {artist.popularity ? ` • Popularity ${artist.popularity}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {(artist.about || artist.tags.length > 0 || artist.lastfmUrl) && (
            <section className="px-5 mt-6">
              <div className="rounded-3xl glass border border-white/6 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="font-display text-lg font-bold text-white">About</h2>
                  {artist.lastfmUrl ? (
                    <a
                      href={artist.lastfmUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-semibold text-white/45 hover:text-white transition-colors"
                    >
                      Last.fm
                    </a>
                  ) : null}
                </div>
                {artist.about ? (
                  <>
                    <motion.div
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <motion.p
                        layout
                        transition={{ duration: 0.24, ease: 'easeInOut' }}
                        className="text-sm leading-6 text-white/68"
                      >
                        {visibleAboutText}
                      </motion.p>
                    </motion.div>
                    {needsAboutToggle ? (
                      <button
                        type="button"
                        onClick={() => setAboutExpanded((current) => !current)}
                        className="mt-3 text-xs font-semibold text-white/60 hover:text-white transition-colors"
                      >
                        {aboutExpanded ? 'Read less' : 'Read more'}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm leading-6 text-white/45">No artist bio available yet.</p>
                )}
                {artist.tags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {artist.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-[11px] font-semibold text-white/65"
                      >
                        {titleCaseTag(tag)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          )}

          <section className="px-5 mt-6">
            <h2 className="font-display text-lg font-bold text-white mb-3">Top Songs</h2>
            <div className="flex flex-col gap-2">
              {artist.topTracks.map((song) => {
                const alreadyAdded = existingTrackIds.has(song.spotifyTrackId)
                const isAdding = addMutation.isPending && addMutation.variables?.spotifyTrackId === song.spotifyTrackId

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
                      <p className="text-white/40 text-xs line-clamp-1 mt-0.5">{song.album ?? song.artist}</p>
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

          <section className="px-5 mt-6">
            <h2 className="font-display text-lg font-bold text-white mb-3">Albums</h2>
            <div className="grid grid-cols-2 gap-3">
              {artist.albums.map((album) => (
                <button
                  key={album.id}
                  onClick={() => navigate(`/albums/${album.id}`)}
                  className="rounded-2xl glass border border-white/6 p-3 text-left"
                >
                  <div className="aspect-square rounded-xl overflow-hidden bg-space-700">
                    {album.image ? <img src={album.image} alt={album.title} className="w-full h-full object-cover" /> : null}
                  </div>
                  <p className="mt-2 text-white text-sm font-medium line-clamp-2">{album.title}</p>
                  <p className="text-white/40 text-xs mt-1 line-clamp-1">
                    {album.releaseDate ? new Date(album.releaseDate).getFullYear() : album.artist}
                  </p>
                </button>
              ))}
            </div>
          </section>

          {isSimilarLoading ? (
            <section className="mt-6">
              <div className="px-5">
                <div className="h-6 w-28 shimmer rounded-full mb-3" />
              </div>
              <div className="overflow-x-auto no-scrollbar px-5">
                <div className="flex gap-3 pb-1">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="w-[13.5rem] shrink-0 rounded-2xl glass border border-white/6 p-3">
                      <div className="aspect-[4/3] rounded-xl shimmer" />
                      <div className="mt-2 h-4 w-24 shimmer rounded-full" />
                      <div className="mt-2 h-3 w-20 shimmer rounded-full opacity-70" />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : similarArtists.length > 0 ? (
            <section className="mt-6">
              <div className="px-5">
                <h2 className="font-display text-lg font-bold text-white mb-3">Similar Artists</h2>
              </div>
              <div className="overflow-x-auto no-scrollbar px-5">
                <div className="flex gap-3 pb-1 snap-x snap-mandatory">
                  {similarArtists.map((similar, index) => (
                    <button
                      key={`${similar.id ?? similar.name}-${index}`}
                      type="button"
                      onClick={() => {
                        if (similar.id) navigate(`/artists/${similar.id}`)
                      }}
                      className="w-[13.5rem] shrink-0 snap-start rounded-2xl glass border border-white/6 p-3 text-left disabled:cursor-default"
                      disabled={!similar.id}
                    >
                      <div className="aspect-[4/3] rounded-xl overflow-hidden bg-space-800/80">
                        {similar.image ? <img src={similar.image} alt={similar.name} className="h-full w-full object-cover" /> : null}
                      </div>
                      <p className="mt-2 text-white text-sm font-medium line-clamp-1">{similar.name}</p>
                      <p className="mt-1 text-white/40 text-xs line-clamp-2">
                        {similar.genres && similar.genres.length > 0
                          ? similar.genres.join(' • ')
                          : typeof similar.match === 'string' || typeof similar.match === 'number'
                          ? `${Math.round(Number(similar.match) * 100)}% match`
                          : 'Similar artist'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
