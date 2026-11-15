import { ApiError } from '../api/client'
import type { BlockedBy, MobilityProfile, RiskLevel, RouteCell, RoutePlan, TravelMode } from '../api/types'
import { fmt } from '../ui/format'

export const POINT_LABEL = { from: 'A', to: 'B' } as const

export const MODE_NAME: Record<TravelMode, string> = { rover: 'the rover', astronaut: 'astronauts' }

export const RISK_LABEL: Record<RiskLevel, string> = { LOW: 'Low', MODERATE: 'Moderate', HIGH: 'High' }

/** A number the backend may have left out or sent as null. */
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** English plural for "sol": 1 sol, 2 sols, 2.3 sols. */
export function solWord(v: number): string {
  return v === 1 ? 'sol' : 'sols'
}

/** Local solar time as 24-hour hh:mm. */
export function formatHour(hour: number): string {
  let h = Math.floor(hour)
  let m = Math.round((hour - h) * 60)
  if (m === 60) {
    h += 1
    m = 0
  }
  return `${String(((h % 24) + 24) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Whole degrees Celsius with a true minus sign, no unit. */
export function formatTemp(c: number): string {
  const r = Math.round(c)
  return `${r < 0 ? '−' : ''}${Math.abs(r)}`
}

export const formatDust = (v: number) => v.toFixed(2)

/** Plain word for a TES dust index; the astronaut limit (0.7) is where "heavy" starts. */
export function dustWord(v: number): string {
  return v >= 0.7 ? 'heavy' : v >= 0.4 ? 'moderate' : 'low'
}

/** One-line summary of what the current mode can handle, from the backend profile. */
export function profileHint(p: MobilityProfile): string {
  const parts = [`Slopes to ${fmt.deg(p.maxSlopeDeg)}°`]
  if (p.maxDustIndex != null) parts.push(`dust to ${formatDust(p.maxDustIndex)}`)
  parts.push(`ground above ${formatTemp(p.minSurfaceTempC)} °C`)
  parts.push(`${fmt.km(p.metersPerSol)} ${fmt.kmUnit(p.metersPerSol)} per sol`)
  return parts.join(', ')
}

const OUTSIDE_GRID = 'Point is outside the route grid (western hemisphere for now). Pick a spot inside the dashed frame'

export interface RouteErrorInfo {
  message: string
  /** Sending the same request again may work. */
  retryable: boolean
}

/** Plain English message that says what happened and what to do next. */
export function routeErrorInfo(e: unknown): RouteErrorInfo {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'POINT_OUTSIDE_GRID':
        return { message: OUTSIDE_GRID, retryable: false }
      case 'RATE_LIMITED':
        return { message: 'Too many route requests. Wait a moment and try again', retryable: true }
      case 'GRID_NOT_READY':
        return { message: 'The route server is still loading its grid. Try again in a moment', retryable: true }
      case 'OFFLINE':
        return { message: e.message, retryable: true }
      default:
        if (e.status >= 500) return { message: 'The route server failed to plan this route. Try again', retryable: true }
        return { message: e.message, retryable: false }
    }
  }
  return { message: 'Could not plan the route. Try again', retryable: true }
}

export const outsideGridError = (): RouteErrorInfo => ({ message: OUTSIDE_GRID, retryable: false })

/** Why there is no route, and what to change. */
export function noRouteMessage(plan: RoutePlan, profile: MobilityProfile | null): string {
  const mode = plan.mode ?? 'rover'
  const who = MODE_NAME[mode]
  const other = mode === 'rover' ? 'Astronaut' : 'Rover'
  const at = formatHour(num(plan.departureHour) ?? 12)
  if (plan.reason === 'START_BLOCKED' || plan.reason === 'GOAL_BLOCKED') {
    const start = plan.reason === 'START_BLOCKED'
    const place = start ? 'Start' : 'Destination'
    const move = `Move point ${start ? 'A' : 'B'}`
    const by: BlockedBy | null = plan.blockedBy ?? null
    switch (by) {
      case 'DUST':
        return `${place} is in heavy dust, closed to ${who}. ${move} or switch to ${other}`
      case 'COLD': {
        const limit = profile ? ` (below ${formatTemp(profile.minSurfaceTempC)} °C)` : ''
        return `${place} is too cold for ${who} at ${at}${limit}. Try a departure closer to midday or ${move.toLowerCase()}`
      }
      case 'SLOPE': {
        const limit = profile ? ` (over ${fmt.deg(profile.maxSlopeDeg)}° with margin)` : ''
        return `${place} is too steep for ${who}${limit}. ${move}${mode === 'rover' ? ' or switch to Astronaut' : ''}`
      }
      case 'NO_DATA':
        return `There is no slope data at the ${start ? 'start' : 'destination'}. ${move} a little`
      default:
        return `${place} is not passable for ${who}. ${move}`
    }
  }
  return 'No passable path between A and B for this mode and hour. Try other points, the other mode or another departure time'
}

/** Cell index ranges [first, last] where the route is HIGH risk. */
export function highRiskRuns(cells: RouteCell[]): [number, number][] {
  const runs: [number, number][] = []
  let start = -1
  cells.forEach((c, i) => {
    if (c.riskLevel === 'HIGH') {
      if (start < 0) start = i
    } else if (start >= 0) {
      runs.push([start, i - 1])
      start = -1
    }
  })
  if (start >= 0) runs.push([start, cells.length - 1])
  return runs
}

/** Resolve a design token to a concrete colour string for Cesium. */
export function tokenColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
