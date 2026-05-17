import { useLayoutEffect, useRef, useState, useEffect } from 'react'
import { useOutlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { BottomNav } from './BottomNav'
import { PageTransition } from './PageTransition'
import { ToastContainer } from '@/components/ui/Toast'

/**
 * AppLayout — the authenticated app shell.
 *
 * Z-index contract (ascending):
 *   0  : ambient-bg (decorative, isolated stacking context)
 *   10 : main content
 *   30 : floating nav pill
 *   50 : modal backdrops
 *   51 : modal foregrounds
 *
 * ROOT CAUSE OF THE NAVIGATION FLICKER:
 * The previous pattern used `key={location.pathname}` on a `PageTransition`
 * wrapper around `<Outlet>`. Because React Router updates its context
 * synchronously on navigation, `<Outlet>` immediately renders the NEW page
 * inside the OLD (exiting) PageTransition. The result:
 *   1. New page appears inside the old wrapper → fades OUT (exit animation)
 *   2. New page appears inside the new wrapper → fades IN (enter animation)
 * The user sees the destination page appear twice — unmount/remount flicker.
 *
 * FIX: Use `useOutlet()` to get the current outlet element as a React node,
 * and hold a "display" snapshot that only updates AFTER the exit animation
 * completes. This ensures the OLD page's subtree actually exits, and the NEW
 * page's subtree only mounts once for its enter animation.
 */

const EXIT_MS = 140 // must match PageTransition exit duration (0.14 s)

export function AppLayout() {
  const outlet = useOutlet()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  // `displayKey` drives AnimatePresence. It only advances to the new pathname
  // after the exit animation window has elapsed, so the old outlet subtree is
  // what actually animates out — not the new page content.
  const [displayKey, setDisplayKey] = useState(location.pathname)
  const [displayOutlet, setDisplayOutlet] = useState(outlet)

  useEffect(() => {
    // Capture the new outlet immediately so it is ready to render after exit.
    const nextOutlet = outlet
    const nextKey = location.pathname

    if (nextKey === displayKey) {
      // Same route (e.g. search-param change) — update content without transition.
      setDisplayOutlet(nextOutlet)
      return
    }

    // Let the current page finish its exit animation, THEN swap content.
    const id = window.setTimeout(() => {
      setDisplayOutlet(nextOutlet)
      setDisplayKey(nextKey)
    }, EXIT_MS)

    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
    mainRef.current?.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="relative flex flex-col min-h-dvh bg-space-900 overflow-hidden">
      <div className="ambient-bg isolate" aria-hidden="true" />

      {/* Main content — pages manage their own scroll */}
      <main ref={mainRef} className="relative z-10 flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {/*
           * Key is `displayKey`, not `location.pathname`.
           * `displayKey` only changes after EXIT_MS, so the exiting wrapper
           * contains the OLD page content throughout its exit animation.
           * The new page only mounts once — for its single enter animation.
           */}
          <PageTransition key={displayKey}>
            {displayOutlet}
          </PageTransition>
        </AnimatePresence>
      </main>

      {/* Floating pill nav */}
      <BottomNav />

      {/* Global toast overlay — renders above everything */}
      <ToastContainer />
    </div>
  )
}
