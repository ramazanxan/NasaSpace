import type { Viewer } from 'cesium'
import type { Place } from '../api/types'
import { flyToPoint } from '../map/camera'
import { getViewer } from '../map/viewerRef'
import { useApp } from '../store/useApp'

/**
 * Opening a place from another region starts the region fly in MarsViewer.
 * We wait for that flight to end and then hop to the place, so the two
 * flights never fight. A timeout covers the case when moveEnd never fires.
 */

const REGION_FLY_TIMEOUT_MS = 6000
let cancelPending: (() => void) | null = null

function afterNextFlight(viewer: Viewer, run: () => void) {
  let started = false
  const camera = viewer.camera
  const offStart = camera.moveStart.addEventListener(() => {
    started = true
  })
  const offEnd = camera.moveEnd.addEventListener(() => {
    if (!started) return
    done()
    run()
  })
  const timer = window.setTimeout(() => {
    done()
    run()
  }, REGION_FLY_TIMEOUT_MS)
  function done() {
    offStart()
    offEnd()
    window.clearTimeout(timer)
    if (cancelPending === done) cancelPending = null
  }
  cancelPending = done
}

export function goToPlace(place: Place) {
  cancelPending?.()
  const s = useApp.getState()
  const needsRegionFly = s.activeRegionId !== place.regionId
  s.setActiveRegion(place.regionId)
  s.selectPlace(place)

  const viewer = getViewer()
  if (!viewer || viewer.isDestroyed()) return
  const hop = () => {
    if (viewer.isDestroyed() || useApp.getState().selectedPlace?.id !== place.id) return
    flyToPoint(viewer, place.position)
  }
  if (needsRegionFly) afterNextFlight(viewer, hop)
  else hop()
}

export const PLACE_KIND_LABEL: Record<Place['kind'], string> = {
  'landing-site': 'Место посадки',
  crater: 'Кратер',
  mountain: 'Гора',
  canyon: 'Каньон',
  plain: 'Равнина',
  feature: 'Форма рельефа',
}
