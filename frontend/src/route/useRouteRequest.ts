import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { inBBox } from '../map/geo'
import { useApp } from '../store/useApp'
import { outsideGridError, routeErrorInfo, type RouteErrorInfo } from './routeUtils'

const HOUR_DEBOUNCE_MS = 300

/** The value after it has stopped changing for `ms`. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (Object.is(value, settled)) return
    const t = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(t)
  }, [value, settled, ms])
  return settled
}

/**
 * Plans a route whenever both points exist and the server is online, and again
 * on mode change and (debounced) departure-hour change. Each request aborts the
 * one before it, so only the latest answer reaches the store.
 * Returns whether the current error is worth retrying as is.
 */
export function useRouteRequest(retry: number) {
  const backend = useApp((s) => s.backend)
  const bbox = useApp((s) => s.grid?.bbox ?? null)
  const from = useApp((s) => s.from)
  const to = useApp((s) => s.to)
  const mode = useApp((s) => s.mode)
  const hour = useSettled(useApp((s) => s.hour), HOUR_DEBOUNCE_MS)
  const routeError = useApp((s) => s.routeError)
  const [lastError, setLastError] = useState<RouteErrorInfo | null>(null)

  useEffect(() => {
    const { setRouteResult, plan, routeStatus } = useApp.getState()
    if (!from || !to) {
      if (plan || routeStatus !== 'idle') setRouteResult({ status: 'idle', plan: null })
      return
    }
    if (backend !== 'online') return

    // Known to be outside the grid: say so without a round trip.
    if (bbox && (!inBBox(from, bbox) || !inBBox(to, bbox))) {
      setRouteResult({ status: 'error', plan: null, error: outsideGridError().message })
      return
    }

    const ctrl = new AbortController()
    setRouteResult({ status: 'loading' })
    api
      .plan(
        { start: from, goal: to, mode, departureHour: Math.round(hour * 100) / 100 },
        ctrl.signal,
      )
      .then(
        (plan) => {
          if (!ctrl.signal.aborted) setRouteResult({ status: 'ready', plan })
        },
        (e: unknown) => {
          if (ctrl.signal.aborted) return
          const info = routeErrorInfo(e)
          setLastError(info)
          setRouteResult({ status: 'error', plan: null, error: info.message })
        },
      )
    return () => ctrl.abort()
  }, [backend, bbox, from, to, mode, hour, retry])

  // The outside-grid check above never stores an info, and it is not retryable.
  return lastError != null && lastError.message === routeError && lastError.retryable
}
