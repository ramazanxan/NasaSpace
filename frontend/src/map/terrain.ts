import { CustomHeightmapTerrainProvider } from 'cesium'
import { MOLA_DEM, marsTilingScheme } from './trek'

/**
 * Real Martian relief for the whole planet, built from the MGS MOLA global DEM
 * that Mars Trek publishes as 8-bit grey tiles.
 *
 * Cesium asks for a terrain tile (x, y, level); we fetch the matching DEM tile,
 * turn its grey values into metres and hand back a small heightmap. Past the
 * DEM's deepest level we keep reusing its last tile and interpolate inside it.
 */

const DEM_SIZE = 256
const TILE = 65 // samples per side handed to Cesium
const MAX_CACHED = 160

/** Decoded DEM tiles, most recently used last. A null entry is a tile that failed to load. */
const cache = new Map<string, Promise<Float32Array | null>>()

function remember(key: string, value: Promise<Float32Array | null>) {
  cache.set(key, value)
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string)
}

/**
 * The DEM has only 256 grey steps, about 115 m each, which would show as
 * terraces once exaggerated. Two light box blurs turn the steps into ramps.
 */
function soften(src: Float32Array): Float32Array {
  let a = src
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(a.length)
    for (let r = 0; r < DEM_SIZE; r++) {
      const r0 = Math.max(0, r - 1)
      const r1 = Math.min(DEM_SIZE - 1, r + 1)
      for (let c = 0; c < DEM_SIZE; c++) {
        const c0 = Math.max(0, c - 1)
        const c1 = Math.min(DEM_SIZE - 1, c + 1)
        b[r * DEM_SIZE + c] =
          (a[r0 * DEM_SIZE + c0] + a[r0 * DEM_SIZE + c] + a[r0 * DEM_SIZE + c1] +
            a[r * DEM_SIZE + c0] + a[r * DEM_SIZE + c] + a[r * DEM_SIZE + c1] +
            a[r1 * DEM_SIZE + c0] + a[r1 * DEM_SIZE + c] + a[r1 * DEM_SIZE + c1]) / 9
      }
    }
    a = b
  }
  return a
}

async function decode(z: number, y: number, x: number): Promise<Float32Array | null> {
  try {
    const res = await fetch(MOLA_DEM.url(z, y, x), { mode: 'cors' })
    if (!res.ok) return null
    const bitmap = await createImageBitmap(await res.blob())
    const canvas = new OffscreenCanvas(DEM_SIZE, DEM_SIZE)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, DEM_SIZE, DEM_SIZE)
    bitmap.close()
    const px = ctx.getImageData(0, 0, DEM_SIZE, DEM_SIZE).data
    const span = MOLA_DEM.maxHeight - MOLA_DEM.minHeight
    const heights = new Float32Array(DEM_SIZE * DEM_SIZE)
    for (let i = 0; i < heights.length; i++) {
      // Transparent pixels carry no measurement; treat them as the datum.
      heights[i] = px[i * 4 + 3] === 0 ? 0 : MOLA_DEM.minHeight + (px[i * 4] / 255) * span
    }
    return soften(heights)
  } catch {
    return null
  }
}

function demTile(z: number, y: number, x: number): Promise<Float32Array | null> {
  const key = `${z}/${y}/${x}`
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const loading = decode(z, y, x)
  remember(key, loading)
  return loading
}

function bilinear(h: Float32Array, col: number, row: number): number {
  const c = Math.min(DEM_SIZE - 1, Math.max(0, col))
  const r = Math.min(DEM_SIZE - 1, Math.max(0, row))
  const c0 = Math.min(DEM_SIZE - 2, Math.floor(c))
  const r0 = Math.min(DEM_SIZE - 2, Math.floor(r))
  const fc = c - c0
  const fr = r - r0
  const i = r0 * DEM_SIZE + c0
  return (
    h[i] * (1 - fc) * (1 - fr) + h[i + 1] * fc * (1 - fr) + h[i + DEM_SIZE] * (1 - fc) * fr + h[i + DEM_SIZE + 1] * fc * fr
  )
}

export function createMolaTerrainProvider() {
  return new CustomHeightmapTerrainProvider({
    width: TILE,
    height: TILE,
    tilingScheme: marsTilingScheme(),
    callback: async (x, y, level) => {
      // Deeper than the DEM goes: sample a window of the deepest ancestor tile.
      const up = Math.max(0, level - MOLA_DEM.maximumLevel)
      const scale = 2 ** up
      const src = await demTile(level - up, Math.floor(y / scale), Math.floor(x / scale))
      const out = new Float32Array(TILE * TILE)
      if (!src) return out
      const u0 = (x % scale) / scale
      const v0 = (y % scale) / scale
      const span = (DEM_SIZE - 1) / scale
      for (let r = 0; r < TILE; r++) {
        const row = v0 * (DEM_SIZE - 1) + (r / (TILE - 1)) * span
        for (let c = 0; c < TILE; c++) {
          const col = u0 * (DEM_SIZE - 1) + (c / (TILE - 1)) * span
          out[r * TILE + c] = bilinear(src, col, row)
        }
      }
      return out
    },
  })
}
