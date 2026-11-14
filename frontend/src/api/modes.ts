import type { TravelMode } from './types'

/**
 * Movement limits per travel mode. Shared by the UI hint and the mock router;
 * the Java backend must use the same numbers (see docs/API.md).
 */
export const MODE_LIMITS: Record<TravelMode, { maxSlope: number; metresPerSol: number }> = {
  rover: { maxSlope: 20, metresPerSol: 150 },
  astronaut: { maxSlope: 30, metresPerSol: 6000 },
}
