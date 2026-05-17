import { cn } from '@/lib/utils'

type BadgeVariant = 'violet' | 'rose' | 'amber' | 'neutral'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const VARIANTS: Record<BadgeVariant, string> = {
  violet: 'bg-beat-violet/15 text-beat-lilac border border-beat-violet/25',
  rose:   'bg-beat-rose/15 text-beat-rose border border-beat-rose/25',
  amber:  'bg-beat-amber/15 text-beat-amber border border-beat-amber/25',
  neutral:'bg-white/8 text-white/60 border border-white/10',
}

/**
 * Badge — small label chip for genres, artists, vibe tags, match %.
 */
export function Badge({ children, variant = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-body font-medium',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
