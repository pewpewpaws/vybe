/**
 * LoadingSpinner — LEGACY SHIM
 *
 * Spinners have been replaced app-wide with content-aware skeleton shimmer.
 * This file is kept only for any external consumers that haven't migrated yet.
 *
 * Prefer:  import { Sk } from '@/components/ui/Skeleton'
 *          <Sk.Box /> / <Sk.Line /> / <Sk.SongRow /> / etc.
 */

export { Sk } from '@/components/ui/Skeleton'

import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }

/** @deprecated Use <Sk.Box />, <Sk.SongRow /> etc. from '@/components/ui/Skeleton' */
export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <motion.svg
      className={cn('text-beat-violet', SIZES[size], className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </motion.svg>
  )
}
