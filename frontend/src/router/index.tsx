import { Suspense, lazy, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { pageImports } from './preloadRoute'

const LoginPage = lazy(() => pageImports.login().then((module) => ({ default: module.LoginPage })))
const OnboardingPage = lazy(() => pageImports.onboarding().then((module) => ({ default: module.OnboardingPage })))
const DiscoveryPage = lazy(() => pageImports.discovery().then((module) => ({ default: module.DiscoveryPage })))
const MatchRequestsPage = lazy(() => pageImports.requests().then((module) => ({ default: module.MatchRequestsPage })))
const MatchProfilePage = lazy(() => pageImports.matchProfile().then((module) => ({ default: module.MatchProfilePage })))
const LeaderboardPage = lazy(() => pageImports.leaderboard().then((module) => ({ default: module.LeaderboardPage })))
const ProfilePage = lazy(() => pageImports.profile().then((module) => ({ default: module.ProfilePage })))
const MyVibesPage = lazy(() => pageImports.myVibes().then((module) => ({ default: module.MyVibesPage })))
const AddSongsPage = lazy(() => pageImports.addSongs().then((module) => ({ default: module.AddSongsPage })))
const ArtistPage = lazy(() => pageImports.artist().then((module) => ({ default: module.ArtistPage })))
const AlbumPage = lazy(() => pageImports.album().then((module) => ({ default: module.AlbumPage })))

/**
 * RouteFallback — Suspense skeleton shown while a lazy chunk loads.
 *
 * Root cause of the navigation flicker: with AnimatePresence mode="wait",
 * the new PageTransition mounts before the old one fully exits. If the
 * Suspense boundary suspends even briefly (concurrent render interruptible
 * tick), RouteFallback renders instantly and is visible inside the already-
 * fading-in wrapper — producing a "page title + shimmer" flash on every nav.
 *
 * Fix: delay RouteFallback's opacity via CSS animation-delay (~150 ms).
 * Preloaded chunks resolve before the delay expires — the fallback is never
 * seen. Genuinely slow loads still show it after the threshold.
 */

// Defined at module scope so it is never recreated on re-renders.
const HEADING_MAP: Array<{ match: (pathname: string) => boolean; title: string }> = [
  { match: (p) => p === '/login',                    title: 'Vyne' },
  { match: (p) => p === '/onboarding',               title: 'Add your vibe' },
  { match: (p) => p === '/discovery' || p === '/',   title: 'Discover' },
  { match: (p) => p === '/requests',                 title: 'Requests' },
  { match: (p) => p.startsWith('/match/'),           title: 'Match Profile' },
  { match: (p) => p === '/leaderboard',              title: 'Leaderboard' },
  { match: (p) => p === '/profile',                  title: 'Profile' },
  { match: (p) => p === '/my-vibes',                 title: 'My Vibes' },
  { match: (p) => p === '/add-songs',                title: 'Add Songs' },
  { match: (p) => p.startsWith('/artists/'),         title: 'Artist' },
  { match: (p) => p.startsWith('/albums/'),          title: 'Album' },
]

function RouteFallback() {
  const location = useLocation()
  const activeHeading = HEADING_MAP.find((entry) => entry.match(location.pathname)) ?? { title: 'Vyne' }

  return (
    /*
     * opacity-0 → animate-[fadeIn] with a 150 ms delay.
     * On preloaded routes the Suspense resolves before the delay fires,
     * so this element is never painted. Slow routes see it fade in gently.
     */
    <div
      className="min-h-dvh bg-space-900 px-5 pt-6"
      aria-hidden="true"
      style={{ opacity: 0, animation: 'routeFallbackReveal 0.01s ease forwards 150ms' }}
    >
      <div className="max-w-sm">
        <h1 className="font-display text-xl font-bold text-white">{activeHeading.title}</h1>
        <div className="mt-2 h-2.5 w-40 max-w-full shimmer rounded-full opacity-70" />
      </div>
    </div>
  )
}

function withSuspense(node: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>
}

/**
 * Route structure:
 *
 * /                     → redirect to /discovery (if authed) or /login
 * /login                → unauthenticated, full-screen immersive login
 * /onboarding           → post-login music identity setup
 * /discovery            → [auth] bubble vibe discovery feed  ← core screen
 * /requests             → [auth] incoming match requests
 * /match/:userId        → [auth] full match profile for an accepted match
 * /leaderboard          → [auth] campus vibe leaderboard
 */
export const router = createBrowserRouter([
  {
    // Public routes — no layout shell
    path: '/login',
    element: withSuspense(<LoginPage />),
  },
  {
    path: '/onboarding',
    element: (
      <AuthGuard>
        {withSuspense(<OnboardingPage />)}
      </AuthGuard>
    ),
  },

  // ─── Authenticated app shell ────────────────────────────────────────
  {
    path: '/',
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/discovery" replace />,
      },
      {
        path: 'discovery',
        element: withSuspense(<DiscoveryPage />),
      },
      {
        path: 'requests',
        element: withSuspense(<MatchRequestsPage />),
      },
      {
        path: 'match/:userId',
        element: withSuspense(<MatchProfilePage />),
      },
      {
        path: 'leaderboard',
        element: withSuspense(<LeaderboardPage />),
      },
      {
        path: 'profile',
        element: withSuspense(<ProfilePage />),
      },
      {
        path: 'my-vibes',
        element: withSuspense(<MyVibesPage />),
      },
      {
        path: 'add-songs',
        element: withSuspense(<AddSongsPage />),
      },
      {
        path: 'artists/:artistId',
        element: withSuspense(<ArtistPage />),
      },
      {
        path: 'albums/:albumId',
        element: withSuspense(<AlbumPage />),
      },
    ],
  },

  // Catch-all fallback
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
