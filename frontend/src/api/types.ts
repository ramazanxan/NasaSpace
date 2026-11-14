/**
 * API contract between the frontend and the Java backend.
 *
 * This file is the source of truth until the backend publishes its Swagger.
 * After that, run `npm run api:types` to regenerate `schema.gen.ts` from the
 * backend's OpenAPI and keep these names as aliases over the generated types.
 *
 * Conventions
 * - Coordinates are planetocentric degrees on the Mars ellipsoid,
 *   longitude east-positive in [-180, 180].
 * - Heights are metres relative to the MOLA areoid (Mars "sea level").
 * - Distances are metres, slopes are degrees, durations are sols.
 */

export interface LonLat {
  lon: number
  lat: number
}

/** West, south, east, north in degrees. */
export type BBox = [number, number, number, number]

/** One of the 5–6 terrain patches we model. The rest of Mars is imagery only. */
export interface Region {
  id: string
  name: string
  /** One-line plain description shown in the region list. */
  summary: string
  bbox: BBox
  /** Point the camera flies to when the region is opened. */
  center: LonLat
  /** Typical floor height, used to place the terrain patch on the globe. */
  baseHeight: number
}

/**
 * GET /terrain/{regionId}
 * Regular height grid covering `bbox`, row-major from the north-west corner.
 * heights.length === width * height.
 */
export interface TerrainGrid {
  regionId: string
  bbox: BBox
  width: number
  height: number
  heights: number[]
  /** Ground distance between neighbouring samples, metres. */
  resolution: number
}

export type LayerKind = 'slope' | 'hazard'

/**
 * GET /layers/{regionId}/{kind}
 * Same grid layout as TerrainGrid. Slope is in degrees, hazard is 0..1.
 */
export interface LayerGrid {
  regionId: string
  kind: LayerKind
  bbox: BBox
  width: number
  height: number
  values: number[]
}

export type PlaceKind = 'landing-site' | 'crater' | 'mountain' | 'canyon' | 'plain' | 'feature'

/** GET /places?q=&limit= */
export interface Place {
  id: string
  name: string
  kind: PlaceKind
  regionId: string
  position: LonLat
  height: number
  slope: number
  description: string
}

export type TravelMode = 'rover' | 'astronaut'

/** POST /route */
export interface RouteRequest {
  regionId: string
  from: LonLat
  to: LonLat
  mode: TravelMode
}

export interface RoutePoint extends LonLat {
  height: number
  /** Distance from the start along the route, metres. */
  distance: number
  slope: number
}

export interface RouteStats {
  length: number
  ascent: number
  descent: number
  maxSlope: number
  sols: number
}

export interface Route {
  regionId: string
  mode: TravelMode
  points: RoutePoint[]
  stats: RouteStats
}

/** Error body for every non-2xx response. */
export type ApiErrorCode =
  | 'OUT_OF_REGION'
  | 'UNREACHABLE'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL'

export interface ApiErrorBody {
  code: ApiErrorCode
  message: string
}

/** POST /route/debug — same request, plus search internals for the A* vs Dijkstra replay. */
export interface RouteDebug {
  algorithm: 'astar' | 'dijkstra'
  /** Grid cells in the order they were expanded, as [lon, lat] pairs. */
  visited: [number, number][]
  route: Route | null
}

/** GET /trails?regionId= — the road graph edges as polylines. */
export interface Trail {
  id: string
  regionId: string
  name: string
  points: LonLat[]
}

/** GET /sun?lon=&lat=&sol=&hour= */
export interface SunState {
  sol: number
  /** Local mean solar time, hours 0..24. */
  lmst: number
  /** Degrees above the horizon, negative at night. */
  elevation: number
  /** Degrees clockwise from north. */
  azimuth: number
  /** Hours until sunset, null when the sun is down. */
  hoursToSunset: number | null
}
