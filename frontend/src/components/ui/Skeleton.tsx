import { cn } from '@/lib/utils'

// ─── Base shimmer ──────────────────────────────────────────────────────────
// All primitives delegate here so the shimmer CSS class is applied uniformly.
function Base({ className }: { className: string }) {
  return <div className={cn('shimmer', className)} aria-hidden="true" />
}

// ─── Primitives ───────────────────────────────────────────────────────────

/** Rectangular block — use for avatar art, card surfaces, thumbnails */
function Box({ className }: { className?: string }) {
  return <Base className={cn('rounded-xl', className)} />
}

/** Short horizontal bar — use for text lines.
 *  `width` accepts any Tailwind width class (e.g. "w-2/3", "w-24").  */
function Line({
  width = 'w-full',
  height = 'h-3',
  className,
}: {
  width?: string
  height?: string
  className?: string
}) {
  return <Base className={cn('rounded-full', width, height, className)} />
}

/** Circular shape — avatars, bubble nodes */
function Circle({ size = 'w-12 h-12', className }: { size?: string; className?: string }) {
  return <Base className={cn('rounded-full', size, className)} />
}

// ─── Content-aware composites ─────────────────────────────────────────────

/**
 * SongRow — mirrors the exact layout of a song list item:
 *   [album art 44×44] [title 2/3] [artist 1/3]
 */
export function SongRowSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-2xl',
        'bg-white/[0.03] border border-white/[0.04]',
        className,
      )}
      aria-hidden="true"
    >
      {/* Album art */}
      <Box className="w-11 h-11 shrink-0" />

      {/* Text lines */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <Line width="w-2/3" height="h-3" />
        <Line width="w-1/3" height="h-2.5" />
      </div>
    </div>
  )
}

/**
 * StatCard — mirrors the 3-up stat strip on ProfilePage:
 *   [large number] [small label]
 */
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'glass rounded-2xl border border-white/8 p-3 flex flex-col items-center gap-2',
        className,
      )}
      aria-hidden="true"
    >
      <Line width="w-7" height="h-5" />
      <Line width="w-10" height="h-2" />
    </div>
  )
}

/**
 * ArtistPill — mirrors the rounded pill chips in the Top Artists row.
 * Widths cycle through three sizes to avoid a too-uniform look.
 */
export function ArtistPillSkeleton({ index = 0, className }: { index?: number; className?: string }) {
  const widths = ['w-20', 'w-28', 'w-16', 'w-24', 'w-18']
  return (
    <Base
      className={cn(
        'h-7 rounded-full',
        widths[index % widths.length],
        className,
      )}
    />
  )
}

/**
 * SourceLabel — mirrors the small source badge + count header above a song group.
 */
export function SourceLabelSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 mb-3', className)} aria-hidden="true">
      <Base className="h-5 w-16 rounded-full" />
      <Base className="h-4 w-10 rounded-full" />
    </div>
  )
}

/**
 * PlaylistRow — mirrors the selection card used in Onboarding:
 *   [image 48×48] [title line]
 */
export function PlaylistRowSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 p-0 h-16 rounded-2xl animate-shimmer-fast overflow-hidden',
        'bg-white/[0.03] border border-white/[0.04]',
        className,
      )}
      aria-hidden="true"
    >
      <Box className="w-16 h-16 shrink-0 rounded-none" />
      <div className="flex-1 min-w-0">
        <Line width="w-3/4" height="h-3" />
      </div>
      <div className="w-5 h-5 shrink-0 mr-4" /> {/* space for tick */}
    </div>
  )
}

/**
 * BubbleRing — mirrors the orbital candidate bubbles on DiscoveryPage.
 */
export function BubbleRingSkeleton({
  count = 5,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={cn('absolute inset-0 pointer-events-none', className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const distance = 90 + (i % 3) * 40
        const angle = (i * 137.5 * Math.PI) / 180
        const x = Math.cos(angle) * distance
        const y = Math.sin(angle) * distance
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              // Stagger the shimmer phase per bubble so they don't all sweep at once
              animationDelay: `${i * 0.22}s`,
            }}
          >
            <Circle
              size="w-12 h-12"
              className="border border-white/8"
              // override border-radius via the `shimmer` class already sets border-radius: inherit
            />
          </div>
        )
      })}
    </div>
  )
}

// ─── Named export for convenient destructuring ─────────────────────────────
// Usage: import { Sk } from '@/components/ui/Skeleton'
// Then: <Sk.Line width="w-1/2" /> or <Sk.SongRow />
export const Sk = {
  Box,
  Line,
  Circle,
  SongRow: SongRowSkeleton,
  StatCard: StatCardSkeleton,
  ArtistPill: ArtistPillSkeleton,
  SourceLabel: SourceLabelSkeleton,
  PlaylistRow: PlaylistRowSkeleton,
  BubbleRing: BubbleRingSkeleton,
}
