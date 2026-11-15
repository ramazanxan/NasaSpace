import type { Place } from '../api/types'
import { flyToPlace } from '../map/camera'
import { getViewer } from '../map/viewerRef'
import { useApp } from '../store/useApp'

/** Select a named place and fly the camera to it. */
export function goToPlace(place: Place) {
  useApp.getState().selectPlace(place)
  const viewer = getViewer()
  if (viewer && !viewer.isDestroyed()) flyToPlace(viewer, place)
}

export const PLACE_KIND_LABEL: Record<Place['kind'], string> = {
  'landing-site': 'Landing site',
  crater: 'Crater',
  volcano: 'Volcano',
  canyon: 'Canyon',
  plain: 'Plain',
  feature: 'Landform',
}
