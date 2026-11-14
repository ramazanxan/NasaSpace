import type { LayerGrid, LayerKind, TerrainGrid } from '../types'
import { MARS_RADIUS_M, metresPerDegree } from '../../map/geo'
import type { MockRegion } from './regions'

/**
 * Synthetic relief for each region until the backend sends real grids.
 * Deterministic: the same region always produces the same terrain, so
 * routes and screenshots are reproducible.
 */

const GRID = 257

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const s = (t: number) => t * t * (3 - 2 * t)
  const a = hash(xi, yi, seed)
  const b = hash(xi + 1, yi, seed)
  const c = hash(xi, yi + 1, seed)
  const d = hash(xi + 1, yi + 1, seed)
  const u = s(xf)
  const v = s(yf)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < octaves; i++) {
    sum += amp * (valueNoise(x * freq, y * freq, seed + i * 17) * 2 - 1)
    freq *= 2
    amp *= 0.5
  }
  return sum
}

/** Bowl with a raised rim, r normalised so the rim is at r = 1. */
function crater(r: number): number {
  if (r < 1) return r * r - 1 // floor at -1, rim at 0
  return Math.exp(-((r - 1) * (r - 1)) / 0.04) * 0.35 // rim crest falling off outside
}

function smallCraters(u: number, v: number, seed: number, count: number, maxR: number): number {
  let h = 0
  for (let i = 0; i < count; i++) {
    const cx = hash(i, 1, seed)
    const cy = hash(i, 2, seed)
    const cr = maxR * (0.25 + 0.75 * hash(i, 3, seed) ** 2)
    const r = Math.hypot(u - cx, v - cy) / cr
    if (r < 1.6) h += crater(r) * cr
  }
  return h
}

function shapeHeight(region: MockRegion, u: number, v: number): number {
  const seed = region.id.length * 101 + region.id.charCodeAt(0)
  const n = fbm(u * 6, v * 6, seed)
  const x = u - 0.5
  const y = v - 0.5
  const r = Math.hypot(x, y)

  switch (region.shape) {
    case 'crater-delta': {
      // Jezero: 45 km crater, delta fan spilling in from the west.
      const bowl = crater(r / 0.36)
      const fanAngle = Math.atan2(y, x + 0.24)
      const fanR = Math.hypot(x + 0.24, y + 0.02)
      const fan = fanR < 0.14 && Math.abs(fanAngle) < 1.1 ? (0.14 - fanR) * 2.6 : 0
      return bowl * 0.8 + fan + n * 0.12 + smallCraters(u, v, seed, 24, 0.035)
    }
    case 'crater-mound': {
      // Gale: wide crater with Mount Sharp rising off-centre.
      const bowl = crater(r / 0.44) * 0.35
      const mr = Math.hypot(x - 0.06, (y - 0.03) * 1.2)
      const mound = Math.max(0, 1 - mr / 0.24) ** 1.6 * 0.95
      return bowl + mound + n * 0.05 + smallCraters(u, v, seed, 18, 0.03) * 0.3
    }
    case 'shield-caldera': {
      // Olympus summit: gentle shield with nested collapse pits.
      const shield = 0.35 - r * 0.6
      const pits =
        crater(Math.hypot(x, y) / 0.16) * 0.45 +
        crater(Math.hypot(x + 0.1, y - 0.07) / 0.09) * 0.25 +
        crater(Math.hypot(x - 0.12, y + 0.05) / 0.07) * 0.2
      return shield + pits + n * 0.04
    }
    case 'canyon': {
      // Melas: east–west trough with steep walls and landslides.
      const wall = 1 / (1 + Math.exp(-(Math.abs(y + n * 0.06) - 0.2) * 34))
      const slides = Math.max(0, fbm(u * 14, v * 3, seed + 5)) * 0.15
      return wall - 1 + slides + n * 0.05
    }
    case 'plain-cones': {
      let cones = 0
      for (let i = 0; i < 40; i++) {
        const cr = Math.hypot(u - hash(i, 4, seed), v - hash(i, 5, seed))
        if (cr < 0.025) cones += (0.025 - cr) * 22
      }
      return cones + n * 0.4
    }
    case 'plain':
      return n * 0.5 + smallCraters(u, v, seed, 30, 0.02) * 2
  }
}

const terrainCache = new Map<string, TerrainGrid>()

export function mockTerrain(region: MockRegion): TerrainGrid {
  const cached = terrainCache.get(region.id)
  if (cached) return cached
  const [w, s, e, n] = region.bbox
  const heights = new Array<number>(GRID * GRID)
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const u = col / (GRID - 1)
      const v = row / (GRID - 1)
      heights[row * GRID + col] = Math.round(region.baseHeight + shapeHeight(region, u, v) * region.relief)
    }
  }
  const latMid = (s + n) / 2
  const resolution = ((e - w) / (GRID - 1)) * metresPerDegree(latMid)
  const grid: TerrainGrid = { regionId: region.id, bbox: region.bbox, width: GRID, height: GRID, heights, resolution }
  terrainCache.set(region.id, grid)
  return grid
}

/** Slope in degrees at every sample, from central differences. */
export function slopeGrid(t: TerrainGrid): number[] {
  const { width: W, height: H, heights } = t
  const [w, s, e, n] = t.bbox
  const dx = ((e - w) / (W - 1)) * metresPerDegree((s + n) / 2)
  const dy = ((n - s) / (H - 1)) * ((Math.PI / 180) * MARS_RADIUS_M)
  const out = new Array<number>(W * H)
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const l = heights[r * W + Math.max(0, c - 1)]
      const rt = heights[r * W + Math.min(W - 1, c + 1)]
      const up = heights[Math.max(0, r - 1) * W + c]
      const dn = heights[Math.min(H - 1, r + 1) * W + c]
      const gx = (rt - l) / (2 * dx)
      const gy = (dn - up) / (2 * dy)
      out[r * W + c] = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI
    }
  }
  return out
}

export function mockLayer(region: MockRegion, kind: LayerKind): LayerGrid {
  const t = mockTerrain(region)
  const slope = slopeGrid(t)
  const seed = region.id.charCodeAt(1)
  const values =
    kind === 'slope'
      ? slope.map((v) => Math.round(v * 10) / 10)
      : slope.map((v, i) => {
          const u = (i % t.width) / t.width
          const w = Math.floor(i / t.width) / t.height
          const rocks = Math.max(0, fbm(u * 20, w * 20, seed, 3))
          return Math.min(1, Math.round((v / 30 + rocks * 0.9) * 100) / 100)
        })
  return { regionId: region.id, kind, bbox: t.bbox, width: t.width, height: t.height, values }
}
