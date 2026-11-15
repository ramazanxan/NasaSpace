import { useEffect, useRef } from 'react'
import { GitCompareArrows, Play, RotateCcw, X } from 'lucide-react'
import { api } from '../api/client'
import type { RoutePlan, RouteRequest } from '../api/types'
import { Button, IconButton, Notice } from '../ui/primitives'
import { fmt } from '../ui/format'
import { ALGORITHM_LABEL, useCompare, type Algorithm, type CompareResult } from './compareStore'
import { num, routeErrorInfo } from './routeUtils'

const ALGORITHMS: Algorithm[] = ['astar', 'dijkstra']

function toResult(p: RoutePlan): CompareResult {
  const visited = Array.isArray(p.visited) ? p.visited : []
  return {
    visited,
    expanded: num(p.metrics?.expandedCells) ?? visited.length,
    length: p.status === 'OK' ? num(p.metrics?.distanceMeters) : null,
  }
}

function compareNote(a: CompareResult, d: CompareResult): string {
  const ratio = d.expanded / Math.max(a.expanded, 1)
  const cells =
    ratio >= 1.05 ? `A* expanded ${fmt.deg(ratio)}× fewer cells` : 'Both expanded about the same number of cells'
  const la = a.length
  const ld = d.length
  if (la == null || ld == null) return cells
  const same = Math.abs(la - ld) <= Math.max(1, ld * 0.01)
  return same
    ? `${cells}, same path length`
    : `${cells}. Path length: ${fmt.km(la)} ${fmt.kmUnit(la)} and ${fmt.km(ld)} ${fmt.kmUnit(ld)}`
}

/** A* vs Dijkstra: how many grid cells each one expands to find the same route. */
export function RouteCompare({ req }: { req: RouteRequest }) {
  const { status, error, results, playing, reset, set, play, start } = useCompare()
  const { start: from, goal: to, mode, departureHour } = req
  const ctrl = useRef<AbortController | null>(null)

  // Any change to the request makes old results meaningless.
  useEffect(
    () => () => {
      ctrl.current?.abort()
      reset()
    },
    [from, to, mode, departureHour, reset],
  )

  const run = async () => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    const token = start()
    const current = () => useCompare.getState().runId === token && !c.signal.aborted
    try {
      const [a, d] = await Promise.all(
        ALGORITHMS.map((algorithm) =>
          api.plan({ start: from, goal: to, mode, departureHour, algorithm, includeVisited: true }, c.signal),
        ),
      )
      if (!current()) return // reset or rerun while in flight
      set({ status: 'ready', results: { astar: toResult(a), dijkstra: toResult(d) } })
      play('astar')
    } catch (e) {
      if (current()) set({ status: 'error', error: routeErrorInfo(e).message })
    }
  }

  if (status === 'idle' || status === 'loading') {
    return (
      <Button
        variant="ghost"
        className="route-compare__trigger"
        icon={<GitCompareArrows size={16} strokeWidth={1.5} aria-hidden />}
        onClick={run}
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'Running both algorithms…' : 'Compare A* and Dijkstra'}
      </Button>
    )
  }

  if (status === 'error') {
    return (
      <div className="route-compare">
        <Notice tone="error">{error}</Notice>
        <Button variant="ghost" onClick={run} icon={<RotateCcw size={16} strokeWidth={1.5} aria-hidden />}>
          Retry
        </Button>
      </div>
    )
  }

  const a = results.astar
  const d = results.dijkstra
  const max = Math.max(a?.expanded ?? 0, d?.expanded ?? 0, 1)
  return (
    <section className="route-compare" aria-label="Algorithm comparison">
      <div className="route-compare__head">
        <span className="section__title">Cells expanded</span>
        <IconButton label="Hide comparison" onClick={reset}>
          <X size={16} strokeWidth={1.5} aria-hidden />
        </IconButton>
      </div>
      <ul className="route-compare__list">
        {ALGORITHMS.map((alg) => {
          const r = results[alg]
          const n = r?.expanded ?? 0
          return (
            <li key={alg} className="route-compare__row" data-active={playing === alg || undefined}>
              <span className="route-compare__name">{ALGORITHM_LABEL[alg]}</span>
              <span className="route-compare__bar" aria-hidden>
                <span style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="route-compare__count">{fmt.int(n)}</span>
              <IconButton
                label={`Replay search: ${ALGORITHM_LABEL[alg]}`}
                aria-pressed={playing === alg}
                disabled={!r?.visited.length}
                onClick={() => play(alg)}
              >
                <Play size={16} strokeWidth={1.5} aria-hidden />
              </IconButton>
            </li>
          )
        })}
      </ul>
      {a && d && a.expanded > 0 && d.expanded > 0 && <p className="route-compare__note">{compareNote(a, d)}</p>}
    </section>
  )
}
