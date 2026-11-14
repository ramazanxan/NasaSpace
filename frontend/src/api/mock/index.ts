import type {
  LayerGrid,
  LayerKind,
  LonLat,
  Place,
  Region,
  Route,
  RouteDebug,
  RouteRequest,
  SunState,
  TerrainGrid,
  Trail,
} from '../types'
import { sample } from '../../map/geo'
import { MockApiError } from './errors'
import { MOCK_PLACE_SEEDS, MOCK_REGIONS, type MockRegion } from './regions'
import { searchRoute } from './router'
import { mockLayer, mockTerrain, slopeGrid } from './terrain'

/** In-browser implementation of the backend API, used when VITE_API_URL is empty. */

const latency = (ms = 120) => new Promise((r) => setTimeout(r, ms + Math.random() * ms))

function region(id: string): MockRegion {
  const r = MOCK_REGIONS.find((x) => x.id === id)
  if (!r) throw new MockApiError(404, 'NOT_FOUND', `Район ${id} не найден`)
  return r
}

let places: Place[] | null = null
function allPlaces(): Place[] {
  if (places) return places
  places = MOCK_PLACE_SEEDS.map((seed) => {
    const t = mockTerrain(region(seed.regionId))
    const slopes = slopeGrid(t)
    return {
      ...seed,
      height: Math.round(sample(t, t.heights, seed.position)),
      slope: Math.round(sample(t, slopes, seed.position) * 10) / 10,
    }
  })
  return places
}

function toPublicRegion({ shape: _s, relief: _r, ...r }: MockRegion): Region {
  return r
}

function sunState(p: LonLat, sol: number, hour: number): SunState {
  const rad = Math.PI / 180
  // Areocentric solar longitude from the mean anomaly (Allison & McEwen 2000, simplified).
  const M = ((19.387 + (sol / 668.6) * 360) % 360) * rad
  const ls = ((270.389 + (sol / 668.6) * 360 + 10.691 * Math.sin(M) + 0.623 * Math.sin(2 * M)) % 360) * rad
  const dec = Math.asin(0.42565 * Math.sin(ls)) + 0.25 * rad * Math.sin(ls)
  const lat = p.lat * rad
  const ha = (hour - 12) * 15 * rad
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)
  const el = Math.asin(sinEl)
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha))
  const cosH0 = -Math.tan(lat) * Math.tan(dec)
  const sunset = cosH0 <= -1 ? 24 : cosH0 >= 1 ? 12 : 12 + Math.acos(cosH0) / rad / 15
  const up = el > 0
  return {
    sol,
    lmst: hour,
    elevation: Math.round((el / rad) * 10) / 10,
    azimuth: Math.round((((az / rad) + 360) % 360) * 10) / 10,
    hoursToSunset: up ? Math.round(Math.max(0, sunset - hour) * 10) / 10 : null,
  }
}

const trailCache = new Map<string, Trail[]>()

export const mockApi = {
  async regions(): Promise<Region[]> {
    await latency(60)
    return MOCK_REGIONS.map(toPublicRegion)
  },

  async terrain(regionId: string): Promise<TerrainGrid> {
    await latency()
    return mockTerrain(region(regionId))
  },

  async layer(regionId: string, kind: LayerKind): Promise<LayerGrid> {
    await latency()
    return mockLayer(region(regionId), kind)
  },

  async places(q: string, limit = 8): Promise<Place[]> {
    await latency(80)
    const needle = q.trim().toLowerCase()
    const list = allPlaces()
    if (!needle) return list.slice(0, limit)
    return list
      .filter((p) => p.name.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle))
      .slice(0, limit)
  },

  async route(req: RouteRequest): Promise<Route> {
    await latency(250)
    const res = searchRoute(mockTerrain(region(req.regionId)), req)
    if (!res.route) throw new MockApiError(422, 'UNREACHABLE', 'Цель недостижима: путь перекрыт слишком крутыми склонами')
    return res.route
  },

  async routeDebug(req: RouteRequest, algorithm: 'astar' | 'dijkstra'): Promise<RouteDebug> {
    await latency(250)
    return searchRoute(mockTerrain(region(req.regionId)), req, algorithm)
  },

  async trails(regionId: string): Promise<Trail[]> {
    await latency()
    const cached = trailCache.get(regionId)
    if (cached) return cached
    const r = region(regionId)
    const t = mockTerrain(r)
    const [w, s, e, n] = r.bbox
    const at = (u: number, v: number): LonLat => ({ lon: w + (e - w) * u, lat: n - (n - s) * v })
    const legs: [LonLat, LonLat][] = [
      [at(0.15, 0.5), at(0.85, 0.5)],
      [at(0.5, 0.12), at(0.5, 0.88)],
      [at(0.2, 0.2), at(0.8, 0.8)],
    ]
    const trails: Trail[] = []
    legs.forEach(([a, b], i) => {
      try {
        const res = searchRoute(t, { regionId, from: a, to: b, mode: 'astronaut' })
        if (res.route) {
          trails.push({ id: `${regionId}-t${i}`, regionId, name: `Тропа ${i + 1}`, points: res.route.points.map(({ lon, lat }) => ({ lon, lat })) })
        }
      } catch {
        // a leg that starts on a cliff is simply skipped
      }
    })
    trailCache.set(regionId, trails)
    return trails
  },

  async sun(p: LonLat, sol: number, hour: number): Promise<SunState> {
    await latency(40)
    return sunState(p, sol, hour)
  },
}
