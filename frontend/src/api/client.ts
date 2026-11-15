import type {
  AnalysisLayerId,
  ApiErrorBody,
  ApiErrorCode,
  CellInfo,
  GridInfo,
  LayerCatalog,
  LonLat,
  RoutePlan,
  RouteRequest,
  TravelMode,
} from './types'

/**
 * Single entry point for backend calls.
 *
 * The backend URL comes from VITE_API_URL; in development it defaults to the
 * Java server's local port. Without a backend the map, the Trek layers, search
 * and the sun readout still work — only routing and surface analysis need it.
 */

const configured = (import.meta.env.VITE_API_URL ?? '').trim()
const ROOT = (configured || (import.meta.env.DEV ? 'http://localhost:9090' : '')).replace(/\/+$/, '')
const BASE = ROOT ? `${ROOT}/api/v1` : ''

/** False when the build has no backend URL at all (static demo). */
export const backendConfigured = BASE !== ''

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const TIMEOUT_MS = 20_000
const OFFLINE_MESSAGE = 'Route server is offline. Start the backend and try again'

const KNOWN_CODES = new Set<ApiErrorCode>([
  'EMPTY_REQUEST',
  'INVALID_JSON',
  'MISSING_POINT',
  'INVALID_COORDINATES',
  'INVALID_PARAMETER',
  'POINT_OUTSIDE_GRID',
  'CELL_NOT_FOUND',
  'LAYER_NOT_FOUND',
  'RATE_LIMITED',
  'GRID_NOT_READY',
  'INTERNAL_ERROR',
])

async function http<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  if (!backendConfigured) throw new ApiError(0, 'OFFLINE', OFFLINE_MESSAGE)
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      signal,
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    })
  } catch (e) {
    // The caller cancelled: let it see the abort. Our own timeout becomes a readable error.
    if (init?.signal?.aborted) throw e
    if (timeout.aborted) throw new ApiError(0, 'OFFLINE', 'Route server did not answer in 20 seconds. Try again')
    throw new ApiError(0, 'OFFLINE', OFFLINE_MESSAGE)
  }
  if (!res.ok) {
    let body: Partial<ApiErrorBody> = {}
    try {
      body = (await res.json()) as ApiErrorBody
    } catch {
      // non-JSON error body
    }
    const code = body.error && KNOWN_CODES.has(body.error) ? body.error : 'INTERNAL_ERROR'
    const message =
      typeof body.message === 'string' && body.message ? body.message.slice(0, 300) : `Server error (${res.status})`
    throw new ApiError(res.status, code, message)
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new ApiError(res.status, 'INTERNAL_ERROR', 'Route server sent an unreadable answer')
  }
}

const q = (params: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()

export const api = {
  gridInfo: (signal?: AbortSignal): Promise<GridInfo> => http('/grid/info', { signal }),

  plan: (req: RouteRequest, signal?: AbortSignal): Promise<RoutePlan> =>
    http('/routes/plan', { method: 'POST', body: JSON.stringify(req), signal }),

  cellAt: (p: LonLat, hour: number, signal?: AbortSignal): Promise<CellInfo> =>
    http(`/cells/at?${q({ lon: p.lon, lat: p.lat, hour })}`, { signal }),

  layers: (signal?: AbortSignal): Promise<LayerCatalog> => http('/layers', { signal }),

  /** URL of a rendered analysis layer; hour is rounded to half hours so images cache well. */
  layerImageUrl: (id: AnalysisLayerId, opts: { mode: TravelMode; hour: number }): string =>
    `${BASE}/layers/${id}.png?${q({ mode: opts.mode, hour: Math.round(opts.hour * 2) / 2 })}`,
}
