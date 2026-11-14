import { ApiError } from '../api/client'
import type { TravelMode } from '../api/types'
import { MODE_LIMITS } from '../api/modes'
import { fmt } from '../ui/format'

export const POINT_LABEL = { from: 'A', to: 'B' } as const

/** English plural for "sol": 1 sol, 2 sols, 2.3 sols. */
export function solWord(v: number): string {
  return v === 1 ? 'sol' : 'sols'
}

export function modeHint(mode: TravelMode): string {
  const { maxSlope, metresPerSol } = MODE_LIMITS[mode]
  return `Slope up to ${maxSlope}°, up to ${fmt.km(metresPerSol)} ${fmt.kmUnit(metresPerSol)} per sol`
}

/** Plain English message that says what to do next. */
export function routeErrorMessage(e: unknown, mode: TravelMode): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'OUT_OF_REGION':
        return 'Point is outside the region: pick a spot inside it'
      case 'UNREACHABLE': {
        const reason = e.message.startsWith('Target unreachable') ? e.message : `Target unreachable. ${e.message}`
        const tip =
          mode === 'rover' ? 'Try Astronaut mode or a different point' : 'Try picking a different point'
        return `${reason}. ${tip}`
      }
      default:
        return e.message
    }
  }
  return 'Could not plan the route. Try again'
}

/** Resolve a design token to a concrete colour string for Cesium. */
export function tokenColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
