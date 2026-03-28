import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatScore(score: number | null): string {
  if (score === null) return '-'
  if (score === 0) return 'E'
  return score > 0 ? `+${score}` : `${score}`
}

export function getPlatformUrl() {
  return import.meta.env.VITE_PLATFORM_URL || 'https://mnsfantasy.com'
}

export function generateJoinCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}
