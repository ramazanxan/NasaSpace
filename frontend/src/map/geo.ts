import type { BBox, LonLat } from '../api/types'

/** Mean Mars radius, metres (IAU 2015). */
export const MARS_RADIUS_M = 3_389_500

const RAD = Math.PI / 180

/** East–west metres per degree of longitude at a latitude. */
export function metresPerDegree(lat: number): number {
  return RAD * MARS_RADIUS_M * Math.cos(lat * RAD)
}

/** Great-circle distance on the Mars sphere, metres. */
export function distance(a: LonLat, b: LonLat): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLon = (b.lon - a.lon) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function inBBox(p: LonLat, [w, s, e, n]: BBox): boolean {
  return p.lon >= w && p.lon <= e && p.lat >= s && p.lat <= n
}

interface Grid {
  bbox: BBox
  width: number
  height: number
}

/** Fractional grid coordinates (col, row) of a point; row 0 is the north edge. */
export function toGrid(g: Grid, p: LonLat): { col: number; row: number } {
  const [w, s, e, n] = g.bbox
  return {
    col: ((p.lon - w) / (e - w)) * (g.width - 1),
    row: ((n - p.lat) / (n - s)) * (g.height - 1),
  }
}

export function fromGrid(g: Grid, col: number, row: number): LonLat {
  const [w, s, e, n] = g.bbox
  return {
    lon: w + (col / (g.width - 1)) * (e - w),
    lat: n - (row / (g.height - 1)) * (n - s),
  }
}

/** Bilinear sample of a row-major grid. Returns NaN outside the grid. */
export function sample(g: Grid, values: ArrayLike<number>, p: LonLat): number {
  const { col, row } = toGrid(g, p)
  if (col < 0 || row < 0 || col > g.width - 1 || row > g.height - 1) return Number.NaN
  const c0 = Math.min(g.width - 2, Math.floor(col))
  const r0 = Math.min(g.height - 2, Math.floor(row))
  const fc = col - c0
  const fr = row - r0
  const i = r0 * g.width + c0
  const a = values[i]
  const b = values[i + 1]
  const c = values[i + g.width]
  const d = values[i + g.width + 1]
  return a * (1 - fc) * (1 - fr) + b * fc * (1 - fr) + c * (1 - fc) * fr + d * fc * fr
}

export function formatCoord({ lon, lat }: LonLat): string {
  const ns = lat >= 0 ? 'с. ш.' : 'ю. ш.'
  const ew = lon >= 0 ? 'в. д.' : 'з. д.'
  return `${Math.abs(lat).toFixed(3)}° ${ns}, ${Math.abs(lon).toFixed(3)}° ${ew}`
}
