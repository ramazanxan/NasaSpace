import { create } from 'zustand'
import type { LayerKind, LonLat, Place, Region, Route, TerrainGrid, TravelMode } from '../api/types'

/**
 * Global app state. One store, one slice per feature area.
 * Feature folders read and write only their own slice plus `region`.
 */

export type RouteStatus = 'idle' | 'loading' | 'ready' | 'error'
export type PickTarget = 'from' | 'to' | null

export interface LayerState {
  visible: boolean
  opacity: number
}

interface AppState {
  // region / map
  regions: Region[]
  activeRegionId: string | null
  terrain: Record<string, TerrainGrid>
  exaggeration: number
  setRegions: (r: Region[]) => void
  setActiveRegion: (id: string | null) => void
  putTerrain: (t: TerrainGrid) => void
  setExaggeration: (x: number) => void

  // place
  selectedPlace: Place | null
  selectPlace: (p: Place | null) => void

  // route
  from: LonLat | null
  to: LonLat | null
  mode: TravelMode
  pick: PickTarget
  route: Route | null
  routeStatus: RouteStatus
  routeError: string | null
  /** Index into route.points under the cursor in the elevation profile. */
  hoverIndex: number | null
  setPoint: (which: 'from' | 'to', p: LonLat | null) => void
  setMode: (m: TravelMode) => void
  setPick: (t: PickTarget) => void
  setRouteResult: (r: { status: RouteStatus; route?: Route | null; error?: string | null }) => void
  setHoverIndex: (i: number | null) => void
  clearRoute: () => void

  // layers
  layers: Record<LayerKind, LayerState>
  showTrails: boolean
  showRovers: boolean
  setLayer: (k: LayerKind, patch: Partial<LayerState>) => void
  setShowTrails: (v: boolean) => void
  setShowRovers: (v: boolean) => void

  // time
  sol: number
  hour: number
  setTime: (t: { sol?: number; hour?: number }) => void
}

export const useApp = create<AppState>((set) => ({
  regions: [],
  activeRegionId: null,
  terrain: {},
  exaggeration: 2,
  setRegions: (regions) => set({ regions }),
  setActiveRegion: (activeRegionId) =>
    set((s) =>
      s.activeRegionId === activeRegionId
        ? {}
        : { activeRegionId, from: null, to: null, route: null, routeStatus: 'idle', routeError: null, hoverIndex: null },
    ),
  putTerrain: (t) => set((s) => ({ terrain: { ...s.terrain, [t.regionId]: t } })),
  setExaggeration: (exaggeration) => set({ exaggeration }),

  selectedPlace: null,
  selectPlace: (selectedPlace) => set({ selectedPlace }),

  from: null,
  to: null,
  mode: 'rover',
  pick: null,
  route: null,
  routeStatus: 'idle',
  routeError: null,
  hoverIndex: null,
  setPoint: (which, p) => set({ [which]: p, pick: null } as Partial<AppState>),
  setMode: (mode) => set({ mode }),
  setPick: (pick) => set({ pick }),
  setRouteResult: ({ status, route, error }) =>
    set((s) => ({
      routeStatus: status,
      route: route === undefined ? s.route : route,
      routeError: error ?? null,
      hoverIndex: null,
    })),
  setHoverIndex: (hoverIndex) => set({ hoverIndex }),
  clearRoute: () => set({ from: null, to: null, route: null, routeStatus: 'idle', routeError: null, hoverIndex: null, pick: null }),

  layers: { slope: { visible: false, opacity: 0.6 }, hazard: { visible: false, opacity: 0.6 } },
  showTrails: false,
  showRovers: true,
  setLayer: (k, patch) => set((s) => ({ layers: { ...s.layers, [k]: { ...s.layers[k], ...patch } } })),
  setShowTrails: (showTrails) => set({ showTrails }),
  setShowRovers: (showRovers) => set({ showRovers }),

  sol: 120,
  hour: 13,
  setTime: (t) => set(t),
}))

export const useActiveRegion = () =>
  useApp((s) => s.regions.find((r) => r.id === s.activeRegionId) ?? null)
