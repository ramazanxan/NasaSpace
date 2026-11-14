import { CustomHeightmapTerrainProvider, Ellipsoid, GeographicTilingScheme, Math as CMath } from 'cesium'
import type { Region, TerrainGrid } from '../api/types'
import { sample } from './geo'

/**
 * Builds a Cesium terrain provider from the region grids we have loaded.
 *
 * Only a handful of regions carry relief; the rest of Mars stays a smooth
 * imagery sphere. Inside a region the surface shows height relative to the
 * region's base height, faded to zero near the edges so the patch blends
 * into the sphere instead of standing on a cliff.
 */

const TILE = 32
const EDGE_FADE = 0.08 // share of the region width used to blend into the sphere

export const marsTilingScheme = () => new GeographicTilingScheme({ ellipsoid: Ellipsoid.MARS })

function edgeMask(t: TerrainGrid, lon: number, lat: number): number {
  const [w, s, e, n] = t.bbox
  const u = Math.min(lon - w, e - lon) / (e - w)
  const v = Math.min(lat - s, n - lat) / (n - s)
  const k = Math.min(u, v) / EDGE_FADE
  if (k >= 1) return 1
  return k * k * (3 - 2 * k)
}

/** Height shown on the globe for a real height inside a region. */
export function displayHeight(region: Pick<Region, 'baseHeight'>, h: number): number {
  return h - region.baseHeight
}

export function createTerrainProvider(grids: { grid: TerrainGrid; region: Region }[]) {
  const tiling = marsTilingScheme()

  return new CustomHeightmapTerrainProvider({
    width: TILE,
    height: TILE,
    tilingScheme: tiling,
    callback: (x, y, level) => {
      const out = new Float32Array(TILE * TILE)
      if (!grids.length) return out
      const rect = tiling.tileXYToRectangle(x, y, level)
      const w = CMath.toDegrees(rect.west)
      const e = CMath.toDegrees(rect.east)
      const s = CMath.toDegrees(rect.south)
      const n = CMath.toDegrees(rect.north)

      const hits = grids.filter(({ grid }) => {
        const [gw, gs, ge, gn] = grid.bbox
        return gw < e && ge > w && gs < n && gn > s
      })
      if (!hits.length) return out

      for (let r = 0; r < TILE; r++) {
        const lat = n - (r / (TILE - 1)) * (n - s)
        for (let c = 0; c < TILE; c++) {
          const lon = w + (c / (TILE - 1)) * (e - w)
          for (const { grid, region } of hits) {
            const h = sample(grid, grid.heights, { lon, lat })
            if (!Number.isNaN(h)) {
              out[r * TILE + c] = displayHeight(region, h) * edgeMask(grid, lon, lat)
              break
            }
          }
        }
      }
      return out
    },
  })
}
