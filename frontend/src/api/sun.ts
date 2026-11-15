import type { LonLat, SunState } from './types'

/**
 * Position of the Sun in the Martian sky for a sol of the Mars year and a
 * local solar hour. Simplified from Allison & McEwen (2000), "A post-Pathfinder
 * evaluation of areocentric solar coordinates": good to about a degree, which
 * is plenty for a planning readout.
 */
export function sunState(p: LonLat, sol: number, hour: number): SunState {
  const rad = Math.PI / 180
  const M = ((19.387 + (sol / 668.6) * 360) % 360) * rad
  const ls = ((270.389 + (sol / 668.6) * 360 + 10.691 * Math.sin(M) + 0.623 * Math.sin(2 * M)) % 360) * rad
  const dec = Math.asin(0.42565 * Math.sin(ls)) + 0.25 * rad * Math.sin(ls)
  const lat = p.lat * rad
  const ha = (hour - 12) * 15 * rad
  const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha))
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha))
  const cosH0 = -Math.tan(lat) * Math.tan(dec)
  const sunset = cosH0 <= -1 ? 24 : cosH0 >= 1 ? 12 : 12 + Math.acos(cosH0) / rad / 15
  return {
    sol,
    lmst: hour,
    elevation: Math.round((el / rad) * 10) / 10,
    azimuth: Math.round(((az / rad + 360) % 360) * 10) / 10,
    hoursToSunset: el > 0 ? Math.round(Math.max(0, sunset - hour) * 10) / 10 : null,
  }
}
