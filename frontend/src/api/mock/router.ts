import type { LonLat, Route, RouteDebug, RouteRequest, TerrainGrid, TravelMode } from '../types'
import { distance, fromGrid, inBBox, toGrid } from '../../map/geo'
import { slopeGrid } from './terrain'
import { MockApiError } from './errors'

/**
 * Stand-in for the Java router: A* (or Dijkstra) over the terrain grid.
 * The backend owns the real algorithm; this one exists so the UI can be
 * built and demoed before the backend is ready.
 */

export const MODE_LIMITS: Record<TravelMode, { maxSlope: number; metresPerSol: number }> = {
  rover: { maxSlope: 20, metresPerSol: 150 },
  astronaut: { maxSlope: 30, metresPerSol: 6000 },
}

const STEP = 2 // search every 2nd sample: 129×129 nodes for a 257 grid

class MinHeap {
  private items: { k: number; p: number }[] = []
  get size() {
    return this.items.length
  }
  push(k: number, p: number) {
    const a = this.items
    a.push({ k, p })
    let i = a.length - 1
    while (i > 0) {
      const j = (i - 1) >> 1
      if (a[j].p <= a[i].p) break
      ;[a[i], a[j]] = [a[j], a[i]]
      i = j
    }
  }
  pop(): number {
    const a = this.items
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l].p < a[m].p) m = l
        if (r < a.length && a[r].p < a[m].p) m = r
        if (m === i) break
        ;[a[i], a[m]] = [a[m], a[i]]
        i = m
      }
    }
    return top.k
  }
}

export function searchRoute(t: TerrainGrid, req: RouteRequest, algorithm: 'astar' | 'dijkstra' = 'astar'): RouteDebug {
  if (!inBBox(req.from, t.bbox) || !inBBox(req.to, t.bbox)) {
    throw new MockApiError(422, 'OUT_OF_REGION', 'Точка вне зоны: выберите место внутри района')
  }
  const { maxSlope, metresPerSol } = MODE_LIMITS[req.mode]
  const slopes = slopeGrid(t)
  const W = Math.floor((t.width - 1) / STEP) + 1
  const H = Math.floor((t.height - 1) / STEP) + 1
  const cellSize = t.resolution * STEP

  const node = (p: LonLat) => {
    const { col, row } = toGrid(t, p)
    return Math.round(row / STEP) * W + Math.round(col / STEP)
  }
  const h = (i: number) => t.heights[Math.floor(i / W) * STEP * t.width + (i % W) * STEP]
  const s = (i: number) => slopes[Math.floor(i / W) * STEP * t.width + (i % W) * STEP]

  const start = node(req.from)
  const goal = node(req.to)
  if (s(start) > maxSlope || s(goal) > maxSlope) {
    throw new MockApiError(422, 'UNREACHABLE', `Точка слишком крутая: больше ${maxSlope}° для этого режима`)
  }

  const gx = goal % W
  const gy = Math.floor(goal / W)
  const heuristic = (i: number) =>
    algorithm === 'astar' ? Math.hypot((i % W) - gx, Math.floor(i / W) - gy) * cellSize : 0

  const cost = new Float64Array(W * H).fill(Infinity)
  const prev = new Int32Array(W * H).fill(-1)
  const closed = new Uint8Array(W * H)
  const heap = new MinHeap()
  const visited: [number, number][] = []
  cost[start] = 0
  heap.push(start, heuristic(start))

  while (heap.size) {
    const cur = heap.pop()
    if (closed[cur]) continue
    closed[cur] = 1
    const cc = cur % W
    const cr = Math.floor(cur / W)
    const ll = fromGrid(t, cc * STEP, cr * STEP)
    visited.push([ll.lon, ll.lat])
    if (cur === goal) break
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nc = cc + dx
        const nr = cr + dy
        if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue
        const nb = nr * W + nc
        if (closed[nb] || s(nb) > maxSlope) continue
        const run = Math.hypot(dx, dy) * cellSize
        const rise = h(nb) - h(cur)
        const grade = Math.abs(rise) / run
        // Climbing costs more than flat ground; steep descents are penalised too.
        const step = Math.hypot(run, rise) * (1 + 6 * grade * grade) + Math.max(0, rise) * 2
        const next = cost[cur] + step
        if (next < cost[nb]) {
          cost[nb] = next
          prev[nb] = cur
          heap.push(nb, next + heuristic(nb))
        }
      }
    }
  }

  if (prev[goal] === -1 && goal !== start) {
    return { algorithm, visited, route: null }
  }

  const ids: number[] = []
  for (let i = goal; i !== -1; i = prev[i]) ids.push(i)
  ids.reverse()

  let dist = 0
  let ascent = 0
  let descent = 0
  let maxS = 0
  const points = ids.map((id, k) => {
    const ll = fromGrid(t, (id % W) * STEP, Math.floor(id / W) * STEP)
    if (k > 0) {
      const prevId = ids[k - 1]
      const p0 = fromGrid(t, (prevId % W) * STEP, Math.floor(prevId / W) * STEP)
      dist += distance(p0, ll)
      const dh = h(id) - h(prevId)
      if (dh > 0) ascent += dh
      else descent -= dh
    }
    maxS = Math.max(maxS, s(id))
    return { ...ll, height: h(id), distance: Math.round(dist), slope: Math.round(s(id) * 10) / 10 }
  })
  points[0] = { ...points[0], ...req.from }
  points[points.length - 1] = { ...points[points.length - 1], ...req.to }

  const route: Route = {
    regionId: req.regionId,
    mode: req.mode,
    points,
    stats: {
      length: Math.round(dist),
      ascent: Math.round(ascent),
      descent: Math.round(descent),
      maxSlope: Math.round(maxS * 10) / 10,
      sols: Math.round((dist / metresPerSol) * 10) / 10,
    },
  }
  return { algorithm, visited, route }
}
