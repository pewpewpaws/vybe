import { useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { create } from 'zustand'

// ─── Store ─────────────────────────────────────────────────────────────────────

export type ToastVariant = 'error' | 'success' | 'info'

interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastStore {
  toasts: Toast[]
  push: (message: string, variant?: ToastVariant) => void
  dismiss: (id: string) => void
}

let _idCounter = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, variant = 'info') => {
    const id = `toast-${++_idCounter}`
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }))
    // Auto-dismiss after 4 s
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

// ─── Convenience hook ─────────────────────────────────────────────────────────

export function useToast() {
  const push = useToastStore((s) => s.push)
  return useCallback(
    (message: string, variant?: ToastVariant) => push(message, variant),
    [push],
  )
}

// ─── Variant config ───────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<ToastVariant, { bar: string; icon: JSX.Element }> = {
  error: {
    bar: 'bg-beat-rose',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-beat-rose mt-0.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  success: {
    bar: 'bg-emerald-400',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-emerald-400 mt-0.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  info: {
    bar: 'bg-beat-violet',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-beat-lilac mt-0.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
}

// ─── Single toast card ────────────────────────────────────────────────────────

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const { bar, icon } = VARIANT_STYLES[toast.variant]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className="relative overflow-hidden flex items-start gap-2.5 px-4 py-3 rounded-2xl
                 bg-[rgba(24,20,18,0.9)] border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.26)]
                 backdrop-blur-md max-w-sm w-full"
    >
      {/* Colour accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${bar} rounded-l-2xl`} />

      {icon}

      <p className="text-white/80 text-xs font-body leading-relaxed flex-1 pr-6">
        {toast.message}
      </p>

      <button
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-white/25 hover:text-white/60 transition-colors"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </motion.div>
  )
}

// ─── Container — mount once at app root ──────────────────────────────────────

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4 w-full"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto w-full flex justify-center">
            <ToastCard toast={t} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}
