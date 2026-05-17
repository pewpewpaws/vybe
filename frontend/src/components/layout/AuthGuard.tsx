import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

interface AuthGuardProps {
  children: ReactNode
}

/**
 * Protects authenticated routes.
 *
 * Uses a single combined selector to avoid over-rendering when unrelated
 * auth store fields (e.g. isLoading) change.
 *
 * - Not yet initialized → render nothing (avoids flash redirect to /login)
 * - Unauthenticated → redirect to /login with return path preserved
 * - Authenticated but onboarding incomplete → redirect to /onboarding
 * - Otherwise → render children
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  // Session still resolving — render nothing to avoid flash
  if (!isInitialized) {
    return null
  }

  // Not logged in — send to login, remember where they were going
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Logged in but hasn't set up music identity yet
  // Don't loop: allow /onboarding itself through
  if (!user.hasCompletedOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  // Return children directly — Fragment wrapper causes unnecessary wrapping
  return children as JSX.Element
}
