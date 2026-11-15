import { useEffect } from 'react'
import { api, backendConfigured } from '../api/client'
import { useApp } from './useApp'

const RETRY_MS = 15_000

/**
 * Asks the backend what it has (grid, profiles, analysis layers) at start-up,
 * and keeps asking while it is unreachable, so the app comes alive as soon as
 * the Java server does.
 */
export function useBackendBoot() {
  useEffect(() => {
    const { setBackend } = useApp.getState()
    if (!backendConfigured) {
      setBackend({ backend: 'offline' })
      return
    }
    const ctrl = new AbortController()
    let timer = 0
    const attempt = async () => {
      try {
        const [grid, catalog] = await Promise.all([api.gridInfo(ctrl.signal), api.layers(ctrl.signal)])
        if (ctrl.signal.aborted) return
        if (!grid.ready) throw new Error('grid still loading')
        setBackend({ backend: 'online', grid, catalog })
      } catch {
        if (ctrl.signal.aborted) return
        setBackend({ backend: 'offline' })
        timer = window.setTimeout(attempt, RETRY_MS)
      }
    }
    void attempt()
    return () => {
      ctrl.abort()
      window.clearTimeout(timer)
    }
  }, [])
}
