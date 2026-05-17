import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface PageTransitionProps {
  children: ReactNode
}

/**
 * PageTransition — cross-page fade + subtle vertical shift.
 *
 * TIMING CONTRACT (must stay in sync with EXIT_MS in AppLayout.tsx):
 *   Exit  : 0.14 s  ← AppLayout waits this long before swapping outlet content
 *   Enter : 0.22 s  ← new page fades in after the old one has fully exited
 *
 * Using explicit `variants` lets Framer Motion apply the correct duration
 * for each direction rather than the single `transition` shorthand which
 * only applies to the enter phase.
 */

const variants = {
  initial: { opacity: 0, y: 8  },
  animate: { opacity: 1, y: 0  },
  exit:    { opacity: 0, y: -4 },
}

export function PageTransition({ children }: PageTransitionProps) {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{
        default: { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] },
        exit:    { duration: 0.14, ease: [0.4,  0,    1,    1   ] },
      }}
      className="h-full min-h-0"
    >
      {children}
    </motion.div>
  )
}
