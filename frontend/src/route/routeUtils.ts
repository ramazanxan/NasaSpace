import { ApiError } from '../api/client'
import type { TravelMode } from '../api/types'
import { MODE_LIMITS } from '../api/modes'
import { fmt } from '../ui/format'

export const POINT_LABEL = { from: 'А', to: 'Б' } as const

/** Russian plural for "сол": 1 сол, 2 сола, 5 солов; fractions take "сола". */
export function solWord(v: number): string {
  if (!Number.isInteger(v)) return 'сола'
  const n = Math.abs(v) % 100
  const n1 = n % 10
  if (n > 10 && n < 20) return 'солов'
  if (n1 === 1) return 'сол'
  if (n1 >= 2 && n1 <= 4) return 'сола'
  return 'солов'
}

export function modeHint(mode: TravelMode): string {
  const { maxSlope, metresPerSol } = MODE_LIMITS[mode]
  return `Уклон до ${maxSlope}°, до ${fmt.km(metresPerSol)} ${fmt.kmUnit(metresPerSol)} за сол`
}

/** Plain Russian message that says what to do next. */
export function routeErrorMessage(e: unknown, mode: TravelMode): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'OUT_OF_REGION':
        return 'Точка вне зоны: выберите место внутри района'
      case 'UNREACHABLE': {
        const reason = e.message.startsWith('Цель недостижима') ? e.message : `Цель недостижима. ${e.message}`
        const tip =
          mode === 'rover' ? 'Попробуйте режим «Астронавт» или другую точку' : 'Попробуйте выбрать другую точку'
        return `${reason}. ${tip}`
      }
      default:
        return e.message
    }
  }
  return 'Не удалось построить маршрут. Попробуйте ещё раз'
}

/** Resolve a design token to a concrete colour string for Cesium. */
export function tokenColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
