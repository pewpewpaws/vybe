import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface CardProps {
  children: ReactNode
  className?: string
  /** Adds hover state (glass-hover) — use for interactive cards */
  interactive?: boolean
  onClick?: () => void
}

/**
 * Card — glassy surface container.
 *
 * The foundational layout element for match cards, profile previews,
 * leaderboard entries, etc. Uses the glass utility class from index.css.
 */
export function Card({ children, className, interactive = false, onClick }: CardProps) {
  if (interactive) {
    return (
      <motion.div
        whileHover={{ y: -2, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        onClick={onClick}
        className={cn('glass glass-hover rounded-3xl cursor-pointer', className)}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div className={cn('glass rounded-3xl', className)}>
      {children}
    </div>
  )
}
