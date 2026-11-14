import { useSyncExternalStore } from 'react'
import type { Viewer } from 'cesium'
import type { LonLat } from '../api/types'

/**
 * The one Cesium viewer, shared by feature folders without prop drilling.
 * Features add their own entities/primitives and must remove them on unmount.
 */

let viewer: Viewer | null = null
const listeners = new Set<() => void>()

export function setViewer(v: Viewer | null) {
  viewer = v
  listeners.forEach((l) => l())
}

export function getViewer(): Viewer | null {
  return viewer
}

/** React hook: the viewer once it exists, otherwise null. */
export function useViewer(): Viewer | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => viewer,
  )
}

export interface MapPointerEvent {
  /** Ground position under the pointer, null when it misses the planet. */
  position: LonLat | null
  /** `id` of the entity under the pointer, if any. */
  entityId: string | null
}

type Handler = (e: MapPointerEvent) => void
const clickHandlers = new Set<Handler>()
const moveHandlers = new Set<Handler>()

/** Subscribe to clicks on the map. Returns an unsubscribe function. */
export function onMapClick(h: Handler): () => void {
  clickHandlers.add(h)
  return () => clickHandlers.delete(h)
}

/** Subscribe to pointer moves over the map (throttled to animation frames). */
export function onMapMove(h: Handler): () => void {
  moveHandlers.add(h)
  return () => moveHandlers.delete(h)
}

export function emitClick(e: MapPointerEvent) {
  clickHandlers.forEach((h) => h(e))
}

export function emitMove(e: MapPointerEvent) {
  moveHandlers.forEach((h) => h(e))
}
