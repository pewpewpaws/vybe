import { useRef } from 'react'

/**
 * Captures whether this mount should play an entrance animation.
 * The value is frozen on first render so background refetches or
 * later re-renders do not accidentally retrigger mount motion.
 */
export function useShouldAnimateOnMount(shouldAnimate: boolean) {
  const shouldAnimateRef = useRef(shouldAnimate)
  return shouldAnimateRef.current
}
