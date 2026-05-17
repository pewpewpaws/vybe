import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: ReactNode
  children: ReactNode
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BASE =
  'relative inline-flex items-center justify-center gap-2 font-body font-medium rounded-2xl transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beat-violet focus-visible:ring-offset-2 focus-visible:ring-offset-space-900 disabled:opacity-50 disabled:cursor-not-allowed select-none'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-beat-violet text-white hover:bg-beat-purple active:bg-beat-purple shadow-glow-sm hover:shadow-glow',
  ghost:
    'bg-transparent text-white/70 hover:text-white hover:bg-surface-hover',
  outline:
    'bg-transparent border border-surface-border text-white/80 hover:border-beat-violet/40 hover:text-white hover:bg-surface-hover',
  danger:
    'bg-beat-rose/10 border border-beat-rose/30 text-beat-rose hover:bg-beat-rose/20',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2.5 text-sm min-h-[44px]',
  md: 'px-5 py-3 text-base min-h-[44px]',
  lg: 'px-6 py-4 text-lg w-full min-h-[48px]',
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Button — the core interactive element.
 * Always disables and shows spinner during loading — never allows double-submit.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: disabled || isLoading ? 1 : 0.97 }}
      transition={{ duration: 0.1 }}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      {isLoading ? (
        <>
          <Spinner />
          <span>Loading…</span>
        </>
      ) : (
        <>
          {leftIcon}
          {children}
        </>
      )}
    </motion.button>
  )
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
