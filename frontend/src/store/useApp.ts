import { create } from 'zustand'
import type {
  AnalysisLayerId,
  GridInfo,
  LayerCatalog,
  LonLat,
  Place,
  RoutePlan,
  TravelMode,
} from '../api/types'

/**
 * Global app state. One store, one slice per feature area.
 * Feature folders read what they need and write only their own slice.
 */

export type RouteStatus = 'idle' | 'loading' | 'ready' | 'error'
export type PickTarget = 'from' | 'to' | null
export type BackendStatus = 'unknown' | 'online' | 'offline'

/** 'natural' = Viking colour imagery, 'elevation' = MOLA + HRSC colour hillshade. */
export type Basemap = 'natural' | 'elevation'

/** Trek imagery overlays drawn straight from NASA tiles. */
export type TrekOverlayId = 'dust' | 'thermal-inertia'

export interface OverlayState {
  visible: boolean
  opacity: number
}

interface AppState {
  // backend
  backend: BackendStatus
  grid: GridInfo | null
  catalog: LayerCatalog | null
  setBackend: (p: { backend: BackendStatus; grid?: GridInfo | null; catalog?: LayerCatalog | null }) => void

  // map
  basemap: Basemap
  exaggeration: number
  setBasemap: (b: Basemap) => void
  setExaggeration: (x: number) => void

  // place
  /** A named place picked from search or the list. */
  selectedPlace: Place | null
  /** A bare point the user clicked on the map to inspect the surface there. */
  inspected: LonLat | null
  selectPlace: (p: Place | null) => void
  inspect: (p: LonLat | null) => void

  // route
  from: LonLat | null
  to: LonLat | null
  mode: TravelMode
  pick: PickTarget
  plan: RoutePlan | null
  routeStatus: RouteStatus
  routeError: string | null
  /** Index into plan.route.cells under the cursor in the elevation profile. */
  hoverIndex: number | null
  setPoint: (which: 'from' | 'to', p: LonLat | null) => void
  setMode: (m: TravelMode) => void
  setPick: (t: PickTarget) => void
  setRouteResult: (r: { status: RouteStatus; plan?: RoutePlan | null; error?: string | null }) => void
  setHoverIndex: (i: number | null) => void
  clearRoute: () => void

  // first-person drive along the route
  fpv: boolean
  setFpv: (v: boolean) => void

  // your own position on Mars and free walking from it
  me: LonLat | null
  /** True while the next map click sets your position. */
  pickMe: boolean
  walk: boolean
  setMe: (p: LonLat | null) => void
  setPickMe: (v: boolean) => void
  setWalk: (v: boolean) => void

  // layers
  trek: Record<TrekOverlayId, OverlayState>
  /** One backend analysis layer at a time, or none. */
  analysis: { id: AnalysisLayerId | null; opacity: number }
  showRovers: boolean
  showGridArea: boolean
  setTrek: (id: TrekOverlayId, patch: Partial<OverlayState>) => void
  setAnalysis: (patch: Partial<{ id: AnalysisLayerId | null; opacity: number }>) => void
  setShowRovers: (v: boolean) => void
  setShowGridArea: (v: boolean) => void

  // time
  sol: number
  /** Local solar hour 0..24; also the departure hour for routing. */
  hour: number
  setTime: (t: { sol?: number; hour?: number }) => void
}

export const useApp = create<AppState>((set) => ({
  backend: 'unknown',
  grid: null,
  catalog: null,
  setBackend: ({ backend, grid, catalog }) =>
    set((s) => ({
      backend,
      grid: grid === undefined ? s.grid : grid,
      catalog: catalog === undefined ? s.catalog : catalog,
    })),

  basemap: 'natural',
  exaggeration: 3,
  setBasemap: (basemap) => set({ basemap }),
  setExaggeration: (exaggeration) => set({ exaggeration }),

  selectedPlace: null,
  inspected: null,
  selectPlace: (selectedPlace) => set({ selectedPlace, inspected: null }),
  inspect: (inspected) => set({ inspected, selectedPlace: null }),

  from: null,
  to: null,
  mode: 'rover',
  pick: null,
  plan: null,
  routeStatus: 'idle',
  routeError: null,
  hoverIndex: null,
  setPoint: (which, p) => set({ [which]: p, pick: null } as Partial<AppState>),
  setMode: (mode) => set({ mode }),
  setPick: (pick) => set({ pick }),
  setRouteResult: ({ status, plan, error }) =>
    set((s) => ({
      routeStatus: status,
      plan: plan === undefined ? s.plan : plan,
      routeError: error ?? null,
      hoverIndex: null,
      fpv: status === 'ready' ? s.fpv : false,
    })),
  setHoverIndex: (hoverIndex) => set({ hoverIndex }),
  clearRoute: () =>
    set({ from: null, to: null, plan: null, routeStatus: 'idle', routeError: null, hoverIndex: null, pick: null, fpv: false }),

  fpv: false,
  setFpv: (fpv) => set({ fpv, walk: false }),

  me: null,
  pickMe: false,
  walk: false,
  setMe: (me) => set({ me, pickMe: false }),
  setPickMe: (pickMe) => set({ pickMe, pick: null }),
  setWalk: (walk) => set({ walk, fpv: false }),

  trek: {
    dust: { visible: false, opacity: 0.6 },
    'thermal-inertia': { visible: false, opacity: 0.6 },
  },
  analysis: { id: null, opacity: 0.7 },
  showRovers: true,
  showGridArea: true,
  setTrek: (id, patch) => set((s) => ({ trek: { ...s.trek, [id]: { ...s.trek[id], ...patch } } })),
  setAnalysis: (patch) => set((s) => ({ analysis: { ...s.analysis, ...patch } })),
  setShowRovers: (showRovers) => set({ showRovers }),
  setShowGridArea: (showGridArea) => set({ showGridArea }),

  sol: 120,
  hour: 13,
  setTime: (t) => set(t),
}))

/** The mobility profile for the current mode, once the backend has reported it. */
export const useProfile = () => useApp((s) => s.grid?.profiles.find((p) => p.id === s.mode) ?? null)
