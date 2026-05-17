import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface LoadingStateProps {
  message?: string
}

/**
 * LoadingState — full-area loading placeholder.
 * Shown ONLY when there is no cached data to display.
 */
export function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/40">
      <LoadingSpinner size="lg" />
      <p className="text-sm font-body">{message}</p>
    </div>
  )
}
