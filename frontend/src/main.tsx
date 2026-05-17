import { useEffect, useState, type ComponentType } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'
import { loginCarouselRows } from '@/data/carouselTracks'
import { Loader } from './components/common/Loader'
import { preloadImages } from './lib/useImagePreloadGate'
import { configureApiToken } from './services/api'
import { useAuthStore } from './store/authStore'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // 2 min before a cached result is considered stale
      staleTime: 2 * 60 * 1000,
      // Keep unused data in cache for 5 min
      gcTime: 5 * 60 * 1000,
      // Prevents the double-fetch that fires when the window gains focus on load
      refetchOnWindowFocus: false,
      throwOnError: false,
    },
    mutations: {
      throwOnError: false,
    },
  },
})

type BootOverlayStage = 'loading' | 'welcome' | 'ready'

/**
 * Module-level guard — the boot sequence must run exactly once.
 *
 * Root cause of the splash-on-navigation bug: if the async boot useEffect
 * fires a second time (React concurrent mode can re-invoke effects in some
 * edge cases, or HMR re-mounts the tree), `bootOverlayStage` resets to
 * 'loading' and the full-screen Loader re-appears over an already-rendered
 * page, creating the impression of a reload.
 *
 * The flag lives at module scope (not in state/ref) so it survives any
 * React re-render or remount of BootRoot and can never be reset to false
 * by navigation or state updates.
 */
let hasBootRun = false

function BootRoot() {
  const [AppComponent, setAppComponent] = useState<ComponentType | null>(null)
  const [bootOverlayStage, setBootOverlayStage] = useState<BootOverlayStage>('loading')
  const [welcomeName, setWelcomeName] = useState<string | null>(null)

  useEffect(() => {
    // Guard: only run the boot sequence once, ever.
    // If this effect fires again (concurrent-mode re-invoke, HMR re-mount, etc.)
    // skip it so bootOverlayStage never resets to 'loading' during navigation.
    if (hasBootRun) return
    hasBootRun = true

    let cancelled = false
    const hadHydratedUser = Boolean(useAuthStore.getState().user)

    void (async () => {
      configureApiToken(() => useAuthStore.getState().token)

      try {
        await useAuthStore.getState().initialize()
      } catch (error) {
        console.error('Failed to initialize auth session', error)
      }

      try {
        const initialPath = window.location.pathname
        const [{ default: App }, { preloadRoute }] = await Promise.all([
          import('./App'),
          import('./router/preloadRoute'),
        ])
        const bootTasks: Promise<unknown>[] = [preloadRoute(initialPath)]

        if (initialPath === '/login') {
          bootTasks.push(
            preloadImages(
              loginCarouselRows.flatMap((row) => row.map((track) => track.image)),
            ),
          )
        }

        await Promise.all(bootTasks)

        if (!cancelled) {
          const currentUser = useAuthStore.getState().user
          setAppComponent(() => App)
          if (hadHydratedUser && currentUser) {
            setWelcomeName(currentUser.name)
            setBootOverlayStage('welcome')
          } else {
            setBootOverlayStage('ready')
          }
        }
      } catch (error) {
        console.error('Failed to bootstrap app', error)
      }
    })()

    return () => {
      cancelled = true
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    if (bootOverlayStage !== 'welcome') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setBootOverlayStage('ready')
    }, 1100)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [bootOverlayStage])

  useEffect(() => {
    document.body.style.overflow = bootOverlayStage === 'ready' ? '' : 'hidden'

    return () => {
      document.body.style.overflow = ''
    }
  }, [bootOverlayStage])

  const ActiveApp = AppComponent

  return (
    <QueryClientProvider client={queryClient}>
      {ActiveApp ? <ActiveApp /> : null}

      <AnimatePresence mode="wait">
        {bootOverlayStage !== 'ready' ? (
          <Loader
            key="boot-loader"
            mode={bootOverlayStage}
            welcomeName={welcomeName}
          />
        ) : null}
      </AnimatePresence>
    </QueryClientProvider>
  )
}

const root = ReactDOM.createRoot(document.getElementById('root')!)

root.render(<BootRoot />)
