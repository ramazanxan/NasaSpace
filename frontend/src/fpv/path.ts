import type { RouteCell } from '../api/types'
import { MARS_RADIUS_M } from '../map/geo'

/**
 * The route resampled into a dense polyline for driving: points every ~4 km,
 * each with its interpolated MOLA elevation and the index of the cell it lies in.
 * Built once per route, so the per-frame work is a binary search and a lerp.
 */

export interface PathPoint {
  lon: number
  lat: number
  /** MOLA elevation, metres, before vertical exaggeration. */
  h: number
  /** Distance from the start, metres. */
  s: number
  /** Index into route.cells of the nearest cell. */
  cell: number
}

const RAD = Math.PI / 180
const STEP_M = 4000

function gc(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const dLat = (bLat - aLat) * RAD
  const dLon = (bLon - aLon) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Centripetal-ish smoothing: Catmull-Rom through the cell centres, so the drive has no hard corners. */
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

export function buildPath(cells: RouteCell[]): PathPoint[] {
  const out: PathPoint[] = []
  if (!cells.length) return out
  const elev = (c: RouteCell, fallback: number) => (typeof c.elevationM === 'number' ? c.elevationM : fallback)
  let lastH = elev(cells[0], 0)
  let s = 0
  for (let k = 0; k < cells.length - 1; k++) {
    const a = cells[Math.max(0, k - 1)]
    const b = cells[k]
    const c = cells[k + 1]
    const d = cells[Math.min(cells.length - 1, k + 2)]
    const hb = elev(b, lastH)
    const hc = elev(c, hb)
    lastH = hc
    const len = gc(b.lon, b.lat, c.lon, c.lat)
    const n = Math.max(1, Math.ceil(len / STEP_M))
    for (let i = 0; i < n; i++) {
      const t = i / n
      const lon = catmull(a.lon, b.lon, c.lon, d.lon, t)
      const lat = catmull(a.lat, b.lat, c.lat, d.lat, t)
      if (out.length) {
        const p = out[out.length - 1]
        s += gc(p.lon, p.lat, lon, lat)
      }
      out.push({ lon, lat, h: hb + (hc - hb) * t, s, cell: t < 0.5 ? k : k + 1 })
    }
  }
  const last = cells[cells.length - 1]
  const p = out[out.length - 1]
  s += p ? gc(p.lon, p.lat, last.lon, last.lat) : 0
  out.push({ lon: last.lon, lat: last.lat, h: elev(last, lastH), s, cell: cells.length - 1 })
  return out
}

/** Position on the path at distance s (clamped), interpolated between samples. */
export function at(path: PathPoint[], s: number): PathPoint {
  const total = path[path.length - 1].s
  const x = Math.min(total, Math.max(0, s))
  let lo = 0
  let hi = path.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (path[mid].s <= x) lo = mid
    else hi = mid
  }
  const a = path[lo]
  const b = path[hi]
  const t = b.s > a.s ? (x - a.s) / (b.s - a.s) : 0
  return {
    lon: a.lon + (b.lon - a.lon) * t,
    lat: a.lat + (b.lat - a.lat) * t,
    h: a.h + (b.h - a.h) * t,
    s: x,
    cell: t < 0.5 ? a.cell : b.cell,
  }
}

/** Compass bearing from a to b, degrees clockwise from north. */
export function bearing(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const φ1 = a.lat * RAD
  const φ2 = b.lat * RAD
  const Δλ = (b.lon - a.lon) * RAD
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) / RAD) + 360) % 360
}

/** Shortest signed difference between two angles in degrees. */
export function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}
