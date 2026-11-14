import { ImageryLayer, Rectangle, SingleTileImageryProvider } from 'cesium'
import { api } from '../api/client'
import type { LayerGrid, LayerKind } from '../api/types'
import { RAMPS, rampColor } from './ramps'

/**
 * Slope / hazard grids painted into a canvas, one pixel per sample, and
 * draped over the globe as a single imagery tile. Cesium scales the image
 * to the region rectangle, so the canvas stays small.
 */

interface Painted {
  grid: LayerGrid
  url: string
}

const cache = new Map<string, Promise<Painted>>()

function paint(grid: LayerGrid): string {
  const canvas = document.createElement('canvas')
  canvas.width = grid.width
  canvas.height = grid.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D недоступен')
  const img = ctx.createImageData(grid.width, grid.height)
  const stops = RAMPS[grid.kind]
  // Grid is row-major from the north-west corner, same as canvas pixels.
  for (let i = 0; i < grid.values.length; i++) {
    const [r, g, b, a] = rampColor(stops, grid.values[i])
    const o = i * 4
    img.data[o] = r
    img.data[o + 1] = g
    img.data[o + 2] = b
    img.data[o + 3] = a
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Fetch + paint once per region and kind; failed requests are not cached. */
export function loadOverlay(regionId: string, kind: LayerKind): Promise<Painted> {
  const key = `${regionId}:${kind}`
  let p = cache.get(key)
  if (!p) {
    p = api.layer(regionId, kind).then((grid) => ({ grid, url: paint(grid) }))
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

export function createOverlayLayer({ grid, url }: Painted, alpha: number): ImageryLayer {
  const [w, s, e, n] = grid.bbox
  // Ellipsoid.default is Mars (set in MarsViewer), so the provider needs no ellipsoid of its own.
  const provider = new SingleTileImageryProvider({
    url,
    tileWidth: grid.width,
    tileHeight: grid.height,
    rectangle: Rectangle.fromDegrees(w, s, e, n),
  })
  const layer = new ImageryLayer(provider, { alpha })
  return layer
}
