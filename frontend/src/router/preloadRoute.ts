const pageImports = {
  login: () => import('@/pages/LoginPage'),
  onboarding: () => import('@/pages/OnboardingPage'),
  discovery: () => import('@/pages/DiscoveryPage'),
  requests: () => import('@/pages/MatchRequestsPage'),
  matchProfile: () => import('@/pages/MatchProfilePage'),
  leaderboard: () => import('@/pages/LeaderboardPage'),
  profile: () => import('@/pages/ProfilePage'),
  myVibes: () => import('@/pages/MyVibesPage'),
  addSongs: () => import('@/pages/AddSongsPage'),
  artist: () => import('@/pages/ArtistPage'),
  album: () => import('@/pages/AlbumPage'),
}

export { pageImports }

export function preloadRoute(pathname: string) {
  if (pathname.startsWith('/match/')) {
    return pageImports.matchProfile()
  }
  if (pathname.startsWith('/artists/')) {
    return pageImports.artist()
  }
  if (pathname.startsWith('/albums/')) {
    return pageImports.album()
  }

  const loaderMap: Record<string, () => Promise<unknown>> = {
    '/': pageImports.discovery,
    '/login': pageImports.login,
    '/onboarding': pageImports.onboarding,
    '/discovery': pageImports.discovery,
    '/requests': pageImports.requests,
    '/leaderboard': pageImports.leaderboard,
    '/profile': pageImports.profile,
    '/my-vibes': pageImports.myVibes,
    '/add-songs': pageImports.addSongs,
  }

  return loaderMap[pathname]?.() ?? Promise.resolve()
}
