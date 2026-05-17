import { AnimatePresence, motion } from 'framer-motion'

type LoaderMode = 'loading' | 'welcome'

interface LoaderProps {
  mode?: LoaderMode
  welcomeName?: string | null
}

export function Loader({ mode = 'loading', welcomeName = null }: LoaderProps) {
  const isWelcome = mode === 'welcome'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-space-950"
      aria-label={isWelcome ? 'Welcome back' : 'Loading'}
      role="status"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.16),transparent_38%),radial-gradient(circle_at_bottom,_rgba(244,63,94,0.08),transparent_32%)]" />

      <div className="relative flex flex-col items-center gap-5 px-6 text-center">
        <div className="loader-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {isWelcome ? (
            <motion.div
              key="loader-welcome"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-2"
            >
              <p className="text-sm uppercase tracking-[0.24em] text-white/45">
                Welcome Back
              </p>
              <h1 className="font-display text-4xl font-extrabold tracking-tight text-white">
                {welcomeName ?? 'Vyne User'}
              </h1>
            </motion.div>
          ) : (
            <motion.div
              key="loader-loading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45, delay: 0.05 }}
              className="flex flex-col items-center gap-2"
            >
              <h1 className="gradient-text font-display text-4xl font-extrabold tracking-tight">
                Vyne
              </h1>
              <p className="text-sm text-white/45">
                Tuning your vibe
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
