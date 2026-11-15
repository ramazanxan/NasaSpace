import { Ellipsoid, GeographicTilingScheme, UrlTemplateImageryProvider } from 'cesium'

/**
 * NASA Mars Trek tile layers (trek.nasa.gov). Every pixel on the map and every
 * height in the terrain comes from these public WMTS services.
 *
 * All layers share one geographic tiling: 2×1 tiles at level 0, row 0 in the north.
 */

const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ'
const tiles = (layer: string, ext: 'jpg' | 'png') => `${TREK}/${layer}/1.0.0/default/default028mm/{z}/{y}/{x}.${ext}`

export const marsTilingScheme = () => new GeographicTilingScheme({ ellipsoid: Ellipsoid.MARS })

export interface TrekLayer {
  title: string
  url: string
  maximumLevel: number
  tileSize?: number
  credit: string
}

export const TREK_LAYERS = {
  /** True-colour look: Viking Orbiter mosaic, 232 m/px. */
  viking: {
    title: 'Viking MDIM 2.1 colour mosaic',
    url: tiles('Mars_Viking_MDIM21_ClrMosaic_global_232m', 'jpg'),
    maximumLevel: 7,
    credit: 'NASA/JPL/USGS · Viking MDIM 2.1 colour mosaic, via Mars Trek',
  },
  /** Elevation in colour with hillshade, 200 m/px. */
  elevation: {
    title: 'MGS MOLA and Mars Express HRSC, colour hillshade blend',
    url: tiles('Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw', 'jpg'),
    maximumLevel: 8,
    credit: 'NASA/GSFC/DLR/FU Berlin · MOLA + HRSC colour hillshade blend, via Mars Trek',
  },
  /** Greyscale close-up detail, about 5 m/px, 512 px tiles. */
  ctx: {
    title: 'MRO CTX mosaic',
    url: 'https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 12,
    tileSize: 512,
    credit: 'NASA/JPL/MSSS · MRO CTX mosaic (Caltech Murray Lab), via Mars Trek',
  },
  dust: {
    title: 'MGS TES, global dust index',
    url: tiles('tes_ruffdust', 'png'),
    maximumLevel: 2,
    credit: 'NASA/JPL/ASU · MGS TES dust cover index (Ruff & Christensen 2002), via Mars Trek',
  },
  'thermal-inertia': {
    title: 'MGS TES, global thermal inertia',
    url: tiles('TES_Thermal_Inertia', 'png'),
    maximumLevel: 1,
    credit: 'NASA/JPL/ASU · MGS TES thermal inertia (Putzig et al. 2005), via Mars Trek',
  },
} satisfies Record<string, TrekLayer>

export type TrekLayerId = keyof typeof TREK_LAYERS

export function trekProvider(id: TrekLayerId) {
  const l: TrekLayer = TREK_LAYERS[id]
  return new UrlTemplateImageryProvider({
    url: l.url,
    tilingScheme: marsTilingScheme(),
    maximumLevel: l.maximumLevel,
    tileWidth: l.tileSize ?? 256,
    tileHeight: l.tileSize ?? 256,
    credit: l.credit,
  })
}

/** MGS MOLA global DEM as 8-bit grey tiles, about 1.4 km/px at its deepest level. */
export const MOLA_DEM = {
  url: (z: number, y: number, x: number) =>
    `${TREK}/mola128_mola64_merge_90Nto90S_SimpleC_clon0/1.0.0/default/default028mm/${z}/${y}/${x}.png`,
  maximumLevel: 5,
  /** Grey 0 and 255 map to these heights above the areoid, metres. */
  minHeight: -8201,
  maxHeight: 21229,
}
