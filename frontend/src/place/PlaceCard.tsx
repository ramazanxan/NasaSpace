import { useEffect } from 'react'
import { Cartesian3, Color, Ellipsoid, HeightReference } from 'cesium'
import { Flag, MapPin, X } from 'lucide-react'
import type { LonLat, Place } from '../api/types'
import { formatCoord } from '../map/geo'
import { useViewer } from '../map/viewerRef'
import { PLACE_KIND_LABEL } from '../search/goToPlace'
import { useApp } from '../store/useApp'
import { Button, IconButton, Stat } from '../ui/primitives'
import { fmt } from '../ui/format'
import './place.css'

const PLACE_MARKER_ID = 'place-marker'

const samePoint = (a: LonLat | null, b: LonLat) => !!a && a.lon === b.lon && a.lat === b.lat

/** Reads a colour token so the marker matches the chrome. */
function tokenColor(name: string, fallback: string): Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return Color.fromCssColorString(v || fallback)
}

/** Small accent dot on the ground under the selected place. */
function PlaceMarkerOnMap({ place }: { place: Place }) {
  const viewer = useViewer()

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return
    const entity = viewer.entities.add({
      id: PLACE_MARKER_ID,
      name: place.name,
      position: Cartesian3.fromDegrees(place.position.lon, place.position.lat, 0, Ellipsoid.MARS),
      point: {
        pixelSize: 10,
        color: tokenColor('--c-accent', '#8db8d9'),
        outlineColor: tokenColor('--c-ground', '#15171a'),
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    viewer.scene.requestRender()
    return () => {
      if (viewer.isDestroyed()) return
      viewer.entities.remove(entity)
      viewer.scene.requestRender()
    }
  }, [viewer, place])

  return null
}

export function PlaceCard() {
  const place = useApp((s) => s.selectedPlace)
  const from = useApp((s) => s.from)
  const to = useApp((s) => s.to)
  const setPoint = useApp((s) => s.setPoint)
  const selectPlace = useApp((s) => s.selectPlace)

  if (!place) return null

  const isFrom = samePoint(from, place.position)
  const isTo = samePoint(to, place.position)

  return (
    <article className="place" aria-labelledby="place-name" key={place.id}>
      <PlaceMarkerOnMap place={place} />

      <header className="place__head">
        <div className="place__title">
          <span className="place__kind">{PLACE_KIND_LABEL[place.kind]}</span>
          <h2 id="place-name" className="place__name">
            {place.name}
          </h2>
        </div>
        <IconButton label="Close card" onClick={() => selectPlace(null)}>
          <X size={16} strokeWidth={1.5} />
        </IconButton>
      </header>

      <p className="place__coord">{formatCoord(place.position)}</p>

      <div className="place__stats">
        <Stat label="Elevation" value={fmt.height(place.height)} unit="m" />
        <Stat label="Slope" value={`${fmt.deg(place.slope)}°`} />
      </div>

      {place.description && <p className="place__desc">{place.description}</p>}

      <div className="place__actions">
        <Button
          icon={<Flag size={16} strokeWidth={1.5} />}
          aria-pressed={isFrom}
          className="place__action"
          onClick={() => setPoint('from', place.position)}
        >
          From here
        </Button>
        <Button
          icon={<MapPin size={16} strokeWidth={1.5} />}
          aria-pressed={isTo}
          className="place__action"
          onClick={() => setPoint('to', place.position)}
        >
          To here
        </Button>
      </div>
    </article>
  )
}
