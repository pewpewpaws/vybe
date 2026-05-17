import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/services/api'

export interface AuthUser {
  id: string
  name: string
  email: string
  registerNumber: string | null
  avatarUrl: string | null
  isEtlabVerified: boolean
  hasCompletedOnboarding: boolean
  hasSpotifyLinked: boolean
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  isSigningOut: boolean
  isInitialized: boolean
  initialize: () => Promise<() => void>
  startGoogleSignIn: (nextPath?: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  completeOnboarding: () => Promise<void>
  verifyEtlab: (username: string, password: string) => Promise<void>
}

interface BackendProfile {
  id: string
  name: string
  email: string
  registerNumber: string | null
  avatarUrl: string | null
  etlabVerified: boolean
  onboardingCompleted: boolean
  spotifyConnected: boolean
}

interface BackendAuthSessionResponse {
  authenticated: boolean
  profile: BackendProfile | null
}

interface OAuthStartResponse {
  authorizationUrl: string
  state: string
}

function mapBackendProfile(profile: BackendProfile): AuthUser {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    registerNumber: profile.registerNumber,
    avatarUrl: profile.avatarUrl,
    isEtlabVerified: profile.etlabVerified,
    hasCompletedOnboarding: profile.onboardingCompleted,
    hasSpotifyLinked: profile.spotifyConnected,
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      isSigningOut: false,
      // Persist middleware rehydrates synchronously before any useEffect.
      // If a user is already in localStorage, we consider auth "initialized"
      // immediately — AuthGuard never needs to flash null, no double-mount.
      // For genuinely fresh sessions (no localStorage), initialize() sets this.
      isInitialized: false,

      initialize: async () => {
        // If persist already gave us a user, we optimistically mark initialized
        // and do a background session-validity check.
        const alreadyHasUser = !!get().user
        if (alreadyHasUser) {
          set({ isInitialized: true, isLoading: false })
        } else {
          set({ isLoading: true })
        }

        try {
          const session = await api.get<BackendAuthSessionResponse>('/auth/session', { skipAuth: true })
          set({
            user: session.profile ? mapBackendProfile(session.profile) : null,
            token: null,
            isLoading: false,
            isInitialized: true,
          })
        } catch {
          // Network failure: if we had a cached user, keep them (offline-tolerant)
          // If we had no user, clear out properly
          set((s) => ({
            user: alreadyHasUser ? s.user : null,
            token: null,
            isLoading: false,
            isInitialized: true,
          }))
        }

        return () => {}  // cleanup noop
      },

      startGoogleSignIn: async (nextPath = '/') => {
        set({ isLoading: true })

        try {
          const session = await api.get<OAuthStartResponse>(
            `/auth/google/start?next_path=${encodeURIComponent(nextPath)}`,
            { skipAuth: true },
          )
          window.location.assign(session.authorizationUrl)
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      signOut: async () => {
        set({ isSigningOut: true })
        try {
          await api.post('/auth/logout', {})
        } catch {
          // Clear client auth state even if the server session is already gone.
        }

        set({
          user: null,
          token: null,
          isLoading: false,
          isSigningOut: false,
          isInitialized: true,
        })
      },

      refreshProfile: async () => {
        set({ isLoading: true })

        try {
          const profile = await api.get<BackendProfile>('/profile/me')

          set({
            user: mapBackendProfile(profile),
            isLoading: false,
          })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      completeOnboarding: async () => {
        await api.post('/onboarding/complete', {})
        set((state) => ({
          user: state.user
            ? { ...state.user, hasCompletedOnboarding: true }
            : null,
          isLoading: false,
        }))
      },

      verifyEtlab: async (username: string, password: string) => {
        const profile = await api.post<BackendProfile>('/verify/etlab', {
          username,
          password,
        })
        set((state) => ({
          user: state.user ? mapBackendProfile(profile) : null,
        }))
      },
    }),
    {
      name: 'vyne-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }),
      // Called synchronously once localStorage rehydration completes.
      // If a user was found in storage, mark initialized immediately —
      // AuthGuard won't flash null or cause a remount cycle.
      onRehydrateStorage: () => (state) => {
        if (state?.user) {
          state.isInitialized = true
          state.isLoading = false
        }
      },
    },
  ),
)

export const useIsAuthenticated = () => useAuthStore((state) => state.user !== null)
export const useCurrentUser = () => useAuthStore((state) => state.user)
