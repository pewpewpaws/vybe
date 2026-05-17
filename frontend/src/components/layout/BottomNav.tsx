import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { usePrefetchedNavigate } from '@/lib/usePrefetchedNavigate'
import { preloadRoute } from '@/router/preloadRoute'

interface NavItem {
  to: string
  label: string
  icon: (active: boolean) => JSX.Element
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/discovery',
    label: 'Discover',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    to: '/requests',
    label: 'Requests',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="22" y1="11" x2="16" y2="11" />
      </svg>
    ),
  },
  {
    to: '/my-vibes',
    label: 'Vibes',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
]

// Per-route accent colors — warm ember/stone palette, no purple carryover.
const ROUTE_ACCENTS: Record<string, { glow: string; active: string; pill: string }> = {
  '/discovery':  { glow: 'rgba(220,60,12,0.44)', active: '#dc3c0c', pill: 'rgba(220,60,12,0.16)' },
  '/requests':   { glow: 'rgba(227,169,112,0.38)', active: '#d3c0b2', pill: 'rgba(211,192,178,0.14)' },
  '/my-vibes':   { glow: 'rgba(171,94,54,0.42)', active: '#e3a970', pill: 'rgba(171,94,54,0.16)' },
  '/profile':    { glow: 'rgba(122,122,120,0.34)', active: '#e1e1e1', pill: 'rgba(225,225,225,0.10)' },
}

function getAccent(pathname: string) {
  for (const key of Object.keys(ROUTE_ACCENTS)) {
    if (pathname.startsWith(key)) return ROUTE_ACCENTS[key]
  }
  return ROUTE_ACCENTS['/discovery']
}

/**
 * BottomNav — always-visible floating glassmorphic pill.
 *
 * The pill's glow and active color respond to the current route,
 * giving each section its own personality. No show/hide animation.
 */
export function BottomNav() {
  const { pathname } = useLocation()
  const navigate = usePrefetchedNavigate()
  const accent = getAccent(pathname)

  return (
    <div
      className="fixed bottom-safe left-4 right-4 z-30 pointer-events-none"
      style={{ willChange: 'transform' }}
    >
      {/* Page-responsive ambient glow */}
      <motion.div
        aria-hidden="true"
        animate={{ background: `radial-gradient(ellipse at center, ${accent.glow} 0%, transparent 70%)` }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        className="absolute inset-0 rounded-full blur-xl opacity-40 scale-110 pointer-events-none"
      />

      {/* Pill shell */}
      <ul
        role="list"
        className="pointer-events-auto relative flex items-center w-full px-2 py-2 rounded-full
                   border border-white/10
                   bg-[rgba(20,16,14,0.72)] backdrop-blur-md
                   shadow-[0_8px_24px_rgba(0,0,0,0.28),0_0_0_0.5px_rgba(255,255,255,0.04)_inset]"
      >
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              aria-label={label}
              onMouseEnter={() => {
                void preloadRoute(to)
              }}
              onFocus={() => {
                void preloadRoute(to)
              }}
              onTouchStart={() => {
                void preloadRoute(to)
              }}
              onClick={(event) => {
                event.preventDefault()
                void navigate(to)
              }}
              className="relative flex flex-col items-center gap-0.5 w-full py-2 min-h-[44px] justify-center"
            >
              {({ isActive }) => (
                <>
                  {/* Sliding active background — sits behind icon + label */}
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-bg"
                      className="absolute inset-x-0 inset-y-0 rounded-full -z-10"
                      style={{ background: accent.pill }}
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}

                  {/* Icon */}
                  <motion.span
                    animate={{
                      color: isActive ? accent.active : 'rgba(255,255,255,0.42)',
                      scale: isActive ? 1.08 : 1,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                    className="flex items-center justify-center w-6 h-6"
                  >
                    {icon(isActive)}
                  </motion.span>

                  {/* Label */}
                  <motion.span
                    animate={{
                      color: isActive ? accent.active : 'rgba(255,255,255,0.32)',
                    }}
                    transition={{ duration: 0.2 }}
                    className={[
                      'text-[11px] font-body tracking-wide leading-none',
                      isActive ? 'font-semibold' : 'font-normal',
                    ].join(' ')}
                  >
                    {label}
                  </motion.span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
