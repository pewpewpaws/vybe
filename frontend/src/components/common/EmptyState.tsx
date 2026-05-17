import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

/**
 * EmptyState — every list/collection must have one.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
      {icon && (
        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/8 flex items-center justify-center text-white/30">
          {icon}
        </div>
      )}
      <div>
        <p className="font-display font-semibold text-white/70">{title}</p>
        {description && (
          <p className="text-sm text-white/35 mt-1">{description}</p>
        )}
      </div>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
