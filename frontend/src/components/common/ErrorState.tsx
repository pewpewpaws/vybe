import { Button } from '@/components/ui/Button'

interface ErrorStateProps {
  error?: Error | null
  title?: string
  onRetry?: () => void
}

/**
 * ErrorState — always surface errors to the user. Never swallow silently.
 */
export function ErrorState({
  error,
  title = 'Something went wrong',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-beat-rose/10 border border-beat-rose/20 flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div>
        <p className="font-display font-semibold text-white/90">{title}</p>
        {error?.message && (
          <p className="text-sm text-white/40 mt-1">{error.message}</p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
