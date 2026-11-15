/**
 * Contract between the frontend and the Java backend (docs/CONTRACT-v1.md).
 *
 * Conventions
 * - Coordinates are degrees on the Mars ellipsoid, longitude east-positive in [-180, 180].
 * - Heights are metres relative to the MOLA areoid. Distances are metres, slopes degrees.
 * - A null number means the backend has no data for that cell.
 * - Every value originates from NASA Mars Trek layers; see GridInfo.dataSources.
 */

export interface LonLat {
  lon: number
  lat: number
}

/** West, south, east, north in degrees. */
export type BBox = [number, number, number, number]

export type TravelMode = 'rover' | 'astronaut'
export type Algorithm = 'astar' | 'dijkstra'
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH'
export type BlockedBy = 'SLOPE' | 'DUST' | 'COLD' | 'NO_DATA'

// ---------- GET /grid/info ----------

export interface MobilityProfile {
  id: TravelMode
  label: string
  maxSlopeDeg: number
  slopeSigmaMargin: number
  /** Cells dustier than this are closed to the profile; null = dust never blocks. */
  maxDustIndex: number | null
  minSurfaceTempC: number
  metersPerSol: number
}

export interface DataSource {
  id: string
  title: string
  trekLayer: string
  note: string
}

export interface GridInfo {
  ready: boolean
  cellCount: number
  /** Area the hex grid covers. Routes exist only inside it. */
  bbox: BBox
  hexEdgeMeters: number
  layers: { slope: boolean; elevation: boolean; dust: boolean; thermalInertia: boolean }
  profiles: MobilityProfile[]
  dataSources: DataSource[]
  modelNotes: string[]
}

// ---------- POST /routes/plan ----------

export interface RouteRequest {
  start: LonLat
  goal: LonLat
  mode: TravelMode
  /** Local solar time of departure, 0..24. */
  departureHour: number
  algorithm?: Algorithm
  includeVisited?: boolean
}

/** One hex cell of the route, in travel order. */
export interface RouteCell extends LonLat {
  cellId: string
  distanceFromStartM: number
  elevationM: number | null
  slopeMeanDeg: number | null
  slopeWithMarginDeg: number | null
  /** 0 = dust-free, 1 = heavily dust-covered. */
  dustIndex: number | null
  /** J m⁻² K⁻¹ s⁻½, approximate. */
  thermalInertia: number | null
  surfaceTempC: number | null
  /** Multiplier the cost model applies to distance when entering this cell (≥ 1). */
  costFactor: number | null
  riskLevel: RiskLevel
}

export interface RouteMetrics {
  distanceMeters: number
  weightedCostMeters: number
  maxSlopeWithMarginDeg: number
  averageSlopeDeg: number
  riskLevel: RiskLevel
  cellCount: number
  maxAllowedSlopeDeg: number
  ascentMeters: number | null
  descentMeters: number | null
  travelSols: number
  maxDustIndex: number | null
  minSurfaceTempC: number | null
  maxSurfaceTempC: number | null
  expandedCells: number
}

export interface RoutePlan {
  status: 'OK' | 'NO_ROUTE'
  reason: 'START_BLOCKED' | 'GOAL_BLOCKED' | 'NO_CONNECTION' | null
  blockedBy: BlockedBy | null
  message: string | null
  startCellId: string
  goalCellId: string
  mode: TravelMode
  departureHour: number
  algorithm: Algorithm
  route: {
    geometry: { type: 'LineString'; coordinates: [number, number][] }
    cellIds: string[]
    cells: RouteCell[]
  } | null
  metrics: RouteMetrics | null
  /** Cells in the order the search expanded them; only when includeVisited was set. */
  visited?: [number, number][]
  warnings: string[]
}

// ---------- GET /cells/at ----------

export interface CellInfo {
  cellId: string
  center: LonLat
  elevationM: number | null
  slopeMeanDeg: number | null
  slopeStdevDeg: number | null
  slopeWithMarginDeg: number | null
  dustIndex: number | null
  thermalInertia: number | null
  surfaceTempC: number | null
  hour: number
  profiles: Record<TravelMode, { passable: boolean; blockedBy: BlockedBy | null; costFactor: number | null }>
}

// ---------- GET /layers ----------

export type AnalysisLayerId = 'risk' | 'slope' | 'dust' | 'thermal-inertia' | 'temperature' | 'elevation'

export interface LegendStop {
  value: number
  color: string
  label: string
}

export interface AnalysisLayer {
  id: AnalysisLayerId
  title: string
  unit: string
  description: string
  howToRead: string
  source: string
  timeDependent: boolean
  modeDependent: boolean
  stops: LegendStop[]
}

export interface LayerCatalog {
  /** Extent of every /layers/{id}.png image. */
  bbox: BBox
  layers: AnalysisLayer[]
}

// ---------- errors ----------

export type ApiErrorCode =
  | 'EMPTY_REQUEST'
  | 'INVALID_JSON'
  | 'MISSING_POINT'
  | 'INVALID_COORDINATES'
  | 'INVALID_PARAMETER'
  | 'POINT_OUTSIDE_GRID'
  | 'CELL_NOT_FOUND'
  | 'LAYER_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'GRID_NOT_READY'
  | 'INTERNAL_ERROR'
  /** Client-side: the backend could not be reached at all. */
  | 'OFFLINE'

export interface ApiErrorBody {
  error: ApiErrorCode
  message: string
}

// ---------- client-side data (not from the backend) ----------

export type PlaceKind = 'landing-site' | 'crater' | 'volcano' | 'canyon' | 'plain' | 'feature'

/** A named location from the IAU gazetteer / mission records, bundled with the app. */
export interface Place {
  id: string
  name: string
  kind: PlaceKind
  position: LonLat
  description: string
  /** Shown in the "Places" list and labelled on the globe. */
  featured?: boolean
  /** Camera distance when flying to the place, metres. */
  viewRange?: number
}

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
