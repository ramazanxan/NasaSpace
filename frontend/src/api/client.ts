import type {
  ApiErrorBody,
  ApiErrorCode,
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
} from './types'
import { mockApi } from './mock'
import { MockApiError } from './mock/errors'

/**
 * Single entry point for backend calls. With VITE_API_URL empty the app
 * runs entirely on in-browser mocks, so the frontend never waits for the backend.
 */

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
export const usingMocks = BASE === ''

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function http<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'INTERNAL', 'Сервер маршрутов не отвечает. Проверьте, что бэкенд запущен')
  }
  if (!res.ok) {
    let body: Partial<ApiErrorBody> = {}
    try {
      body = (await res.json()) as ApiErrorBody
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, body.code ?? 'INTERNAL', body.message ?? `Ошибка сервера (${res.status})`)
  }
  return (await res.json()) as T
}

async function viaMock<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof MockApiError) throw new ApiError(e.status, e.code, e.message)
    throw e
  }
}

const q = (params: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()

export const api = {
  regions: (): Promise<Region[]> => (usingMocks ? viaMock(mockApi.regions) : http('/regions')),

  terrain: (regionId: string): Promise<TerrainGrid> =>
    usingMocks ? viaMock(() => mockApi.terrain(regionId)) : http(`/terrain/${encodeURIComponent(regionId)}`),

  layer: (regionId: string, kind: LayerKind): Promise<LayerGrid> =>
    usingMocks
      ? viaMock(() => mockApi.layer(regionId, kind))
      : http(`/layers/${encodeURIComponent(regionId)}/${kind}`),

  places: (text: string, signal?: AbortSignal): Promise<Place[]> =>
    usingMocks ? viaMock(() => mockApi.places(text)) : http(`/places?${q({ q: text, limit: 8 })}`, { signal }),

  route: (req: RouteRequest): Promise<Route> =>
    usingMocks ? viaMock(() => mockApi.route(req)) : http('/route', { method: 'POST', body: JSON.stringify(req) }),

  routeDebug: (req: RouteRequest, algorithm: 'astar' | 'dijkstra'): Promise<RouteDebug> =>
    usingMocks
      ? viaMock(() => mockApi.routeDebug(req, algorithm))
      : http(`/route/debug?${q({ algorithm })}`, { method: 'POST', body: JSON.stringify(req) }),

  trails: (regionId: string): Promise<Trail[]> =>
    usingMocks ? viaMock(() => mockApi.trails(regionId)) : http(`/trails?${q({ regionId })}`),

  sun: (p: LonLat, sol: number, hour: number): Promise<SunState> =>
    usingMocks
      ? viaMock(() => mockApi.sun(p, sol, hour))
      : http(`/sun?${q({ lon: p.lon, lat: p.lat, sol, hour })}`),
}
