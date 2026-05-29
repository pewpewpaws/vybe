import { useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Loader } from '@/components/common/Loader'
import { loginCarouselRows } from '@/data/carouselTracks'
import { useImagePreloadGate } from '@/lib/useImagePreloadGate'
import { useAuthStore } from '@/store/authStore'

function BackdropTrackCard({
  image,
  name,
  artists,
}: {
  image: string
  name: string
  artists: string[]
}) {
  return (
    <div className="relative flex h-48 w-48 shrink-0 overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 shadow-[0_22px_70px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:h-56 sm:w-56">
      {image ? (
        <img src={image} alt={name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 bg-white/8" />
      )}

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.2),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.58))]" />

      <div className="relative z-10 mt-auto w-full p-3 sm:p-4">
        <div className="rounded-2xl border border-white/10 bg-black/55 p-2.5 backdrop-blur-sm sm:p-3">
          <p className="line-clamp-2 font-display text-xs font-bold leading-tight text-white sm:text-[13px]">{name || 'Unknown track'}</p>
          <p className="mt-1 line-clamp-2 font-body text-[10px] text-white/65 sm:text-[11px]">
            {artists.length > 0 ? artists.join(' • ') : 'Unknown artist'}
          </p>
        </div>
      </div>
    </div>
  )
}

function buildInfiniteRow(tracks: { id: string; image: string; name: string; artists: string[] }[]) {
  return [...tracks, ...tracks, ...tracks]
}

export function LoginPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [postLoginFlowActive, setPostLoginFlowActive] = useState(false)

  const location = useLocation()
  const startGoogleSignIn = useAuthStore((state) => state.startGoogleSignIn)
  const isLoading = useAuthStore((state) => state.isLoading)
  const isInitialized = useAuthStore((state) => state.isInitialized)
  const user = useAuthStore((state) => state.user)
  const [rowOne, rowTwo, rowThree] = loginCarouselRows.map(buildInfiniteRow)
  const backdropImageSources = useMemo(
    () => [...rowOne, ...rowTwo, ...rowThree].map((track) => track.image),
    [rowOne, rowTwo, rowThree],
  )
  const areBackdropImagesReady = useImagePreloadGate(backdropImageSources, true)

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/discovery'

  if (isInitialized && user && !postLoginFlowActive) {
    const destination = user.hasCompletedOnboarding ? from : '/onboarding'
    return <Navigate to={destination} replace />
  }

  if (!areBackdropImagesReady) {
    return <Loader />
  }

  async function handleGoogleSignIn() {
    setErrorMessage(null)
    setPostLoginFlowActive(true)

    try {
      await startGoogleSignIn(from)
    } catch (error) {
      setPostLoginFlowActive(false)
      const message = error instanceof Error ? error.message : 'Google sign-in failed'
      setErrorMessage(message)
    }
  }

  function handleEtlabSignIn() {
    alert("ETLab Login will be implemented later")
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-space-950">
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-space-950/55 via-space-950/80 to-space-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.18),transparent_40%),radial-gradient(circle_at_bottom,_rgba(244,63,94,0.08),transparent_35%)]" />

        <div className="absolute left-0 top-[12%] flex gap-4 animate-login-drift" style={{ width: 'max-content' }}>
          {rowOne.map((track, index) => (
            <BackdropTrackCard key={`backdrop-row-1-${track.id}-${index}`} {...track} />
          ))}
        </div>

        <div
          className="absolute left-0 top-[39%] flex gap-4"
          style={{
            width: 'max-content',
            animation: 'login-drift 40s linear infinite reverse',
          }}
        >
          {rowTwo.map((track, index) => (
            <BackdropTrackCard key={`backdrop-row-2-${track.id}-${index}`} {...track} />
          ))}
        </div>

        <div
          className="absolute left-0 top-[66%] flex gap-4"
          style={{
            width: 'max-content',
            animation: 'login-drift 48s linear infinite',
          }}
        >
          {rowThree.map((track, index) => (
            <BackdropTrackCard key={`backdrop-row-3-${track.id}-${index}`} {...track} />
          ))}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-20 flex w-full max-w-sm flex-col items-center gap-8 px-6"
      >
        <div className="text-center">
          <motion.h1
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="gradient-text font-display text-5xl font-extrabold tracking-tight"
          >
            Vyne
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-2 font-body text-base text-white/50"
          >
            Your campus, your vibe.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex w-full flex-col gap-3"
        >
          <div className="glass rounded-3xl border border-white/10 bg-[rgba(24,20,18,0.78)] p-4">
            <div className="mb-4 text-center">
              <p className="font-body text-sm font-medium text-white">Sign in to Vyne</p>
              <p className="mt-1 font-body text-xs text-white/40">
                Use Google or ETLab for account access.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full rounded-[1.6rem] border border-beat-violet/25 bg-beat-violet/12 px-5 py-4 text-left shadow-[0_16px_40px_rgba(139,92,246,0.12)] transition-colors hover:border-beat-lilac/35 hover:bg-beat-violet/18 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-3">
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
                  <path
                    fill="#4285F4"
                    d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.29h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.27-2.09 3.57-5.18 3.57-8.63z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.93l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.71-4.96H1.3v3.09A12 12 0 0 0 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.29 14.25A7.2 7.2 0 0 1 4.91 12c0-.78.13-1.53.38-2.25V6.66H1.3A12 12 0 0 0 0 12c0 1.94.46 3.78 1.3 5.34l3.99-3.09z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.79c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.94 1.17 15.24 0 12 0A12 12 0 0 0 1.3 6.66l3.99 3.09c.94-2.85 3.59-4.96 6.71-4.96z"
                  />
                </svg>
                <p className="font-body text-base font-medium text-white/90">
                  Continue with Google
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={handleEtlabSignIn}
              disabled={isLoading}
              className="mt-3 w-full rounded-[1.6rem] border border-beat-violet/25 bg-beat-violet/12 px-5 py-4 text-left shadow-[0_16px_40px_rgba(139,92,246,0.12)] transition-colors hover:border-beat-lilac/35 hover:bg-beat-violet/18 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/90">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                </svg>
                <p className="font-body text-base font-medium text-white/90">
                  Continue with ETLab
                </p>
              </div>
            </button>

            {errorMessage && <p className="mt-3 font-body text-xs text-beat-rose">{errorMessage}</p>}
          </div>

          <p className="text-center font-body text-xs text-white/30">
            Music identity setup follows Google sign-in
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}
