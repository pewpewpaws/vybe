import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * cn — merge Tailwind classes safely, resolving conflicts.
 * Usage: cn('px-4', condition && 'bg-red-500', className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * formatMatchPercent — format a 0–1 similarity score as "87%"
 */
export function formatMatchPercent(score: number): string {
  return `${Math.round(score * 100)}%`
}
