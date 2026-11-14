import { useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../api/client'
import { useApp } from '../store/useApp'
import { routeErrorMessage } from './routeUtils'

/** Errors caused by the chosen points: retrying the same request will not help. */
const FINAL = new Set(['OUT_OF_REGION', 'UNREACHABLE', 'BAD_REQUEST', 'NOT_FOUND'])

/**
 * Requests a route whenever both points exist, and again on mode change.
 * Only the latest request may write its result; older responses are dropped.
 * Returns whether the current error is worth retrying as is.
 */
export function useRouteRequest(retry: number) {
  const regionId = useApp((s) => s.activeRegionId)
  const from = useApp((s) => s.from)
  const to = useApp((s) => s.to)
  const mode = useApp((s) => s.mode)
  const seq = useRef(0)
  const [retryable, setRetryable] = useState(false)

  useEffect(() => {
    const id = ++seq.current
    const { setRouteResult, route, routeStatus } = useApp.getState()
    if (!regionId || !from || !to) {
      if (route || routeStatus !== 'idle') setRouteResult({ status: 'idle', route: null })
      return
    }
    setRouteResult({ status: 'loading' })
    api.route({ regionId, from, to, mode }).then(
      (r) => {
        if (id === seq.current) setRouteResult({ status: 'ready', route: r })
      },
      (e: unknown) => {
        if (id !== seq.current) return
        setRetryable(!(e instanceof ApiError && FINAL.has(e.code)))
        setRouteResult({ status: 'error', route: null, error: routeErrorMessage(e, mode) })
      },
    )
  }, [regionId, from, to, mode, retry])

  // Invalidate any in-flight request when the panel goes away.
  useEffect(
    () => () => {
      seq.current++
    },
    [],
  )

  return retryable
}
