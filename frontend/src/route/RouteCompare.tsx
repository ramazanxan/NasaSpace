import { useEffect } from 'react'
import { GitCompareArrows, Play, RotateCcw, X } from 'lucide-react'
import { api } from '../api/client'
import type { RouteRequest } from '../api/types'
import { Button, IconButton, Notice } from '../ui/primitives'
import { fmt } from '../ui/format'
import { ALGORITHM_LABEL, useCompare, type Algorithm } from './compareStore'
import { routeErrorMessage } from './routeUtils'

const ALGORITHMS: Algorithm[] = ['astar', 'dijkstra']

function compareNote(astar: number, dijkstra: number, la?: number | null, ld?: number | null): string {
  const ratio = dijkstra / astar
  const cells = ratio >= 1.05 ? `A* просмотрел в ${fmt.deg(ratio)} раза меньше клеток` : 'Оба просмотрели почти столько же клеток'
  if (la == null || ld == null) return cells
  const same = Math.abs(la - ld) <= Math.max(1, ld * 0.01)
  return same ? `${cells}, путь той же длины` : `${cells}. Длина пути: ${fmt.km(la)} и ${fmt.km(ld)} ${fmt.kmUnit(ld)}`
}

/** A* vs Dijkstra: how many grid cells each one expands to find the same route. */
export function RouteCompare({ req }: { req: RouteRequest }) {
  const { status, error, results, playing, reset, set, play } = useCompare()
  const { regionId, from, to, mode } = req

  // Any change to the request makes old results meaningless.
  useEffect(() => reset, [regionId, from, to, mode, reset])

  const run = async () => {
    set({ status: 'loading', error: null, results: {}, playing: null })
    const r = { regionId, from, to, mode }
    try {
      const [a, d] = await Promise.all(ALGORITHMS.map((alg) => api.routeDebug(r, alg)))
      const s = useCompare.getState()
      if (s.status !== 'loading') return // reset while in flight
      set({
        status: 'ready',
        results: {
          astar: { visited: a.visited, length: a.route?.stats.length ?? null },
          dijkstra: { visited: d.visited, length: d.route?.stats.length ?? null },
        },
      })
      play('astar')
    } catch (e) {
      if (useCompare.getState().status === 'loading') set({ status: 'error', error: routeErrorMessage(e, mode) })
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
        {status === 'loading' ? 'Считаем оба алгоритма…' : 'Сравнить A* и Дейкстру'}
      </Button>
    )
  }

  if (status === 'error') {
    return (
      <div className="route-compare">
        <Notice tone="error">{error}</Notice>
        <Button variant="ghost" onClick={run} icon={<RotateCcw size={16} strokeWidth={1.5} aria-hidden />}>
          Повторить
        </Button>
      </div>
    )
  }

  const astar = results.astar?.visited.length ?? 0
  const dijkstra = results.dijkstra?.visited.length ?? 0
  return (
    <section className="route-compare" aria-label="Сравнение алгоритмов">
      <div className="route-compare__head">
        <span className="section__title">Просмотрено клеток сетки</span>
        <IconButton label="Скрыть сравнение" onClick={reset}>
          <X size={16} strokeWidth={1.5} aria-hidden />
        </IconButton>
      </div>
      <ul className="route-compare__list">
        {ALGORITHMS.map((alg) => {
          const n = results[alg]?.visited.length ?? 0
          const max = Math.max(astar, dijkstra, 1)
          return (
            <li key={alg} className="route-compare__row" data-active={playing === alg || undefined}>
              <span className="route-compare__name">{ALGORITHM_LABEL[alg]}</span>
              <span className="route-compare__bar" aria-hidden>
                <span style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="route-compare__count">{fmt.int(n)}</span>
              <IconButton
                label={`Показать поиск: ${ALGORITHM_LABEL[alg]}`}
                aria-pressed={playing === alg}
                onClick={() => play(alg)}
              >
                <Play size={16} strokeWidth={1.5} aria-hidden />
              </IconButton>
            </li>
          )
        })}
      </ul>
      {astar > 0 && dijkstra > 0 && <p className="route-compare__note">{compareNote(astar, dijkstra, results.astar?.length, results.dijkstra?.length)}</p>}
    </section>
  )
}
