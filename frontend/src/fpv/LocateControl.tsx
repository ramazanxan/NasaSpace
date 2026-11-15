import { useEffect } from 'react'
import { Cartesian2, Cartesian3, Color, Ellipsoid, HeightReference, LabelStyle, VerticalOrigin } from 'cesium'
import { Footprints, LocateFixed, MapPin } from 'lucide-react'
import { flyToPoint } from '../map/camera'
import { useViewer } from '../map/viewerRef'
import { useApp } from '../store/useApp'
import { IconButton } from '../ui/primitives'

/**
 * "My location": there is no GPS on Mars, so you set where you stand once
 * (click the map, or "I am here" from a point), then fly back to yourself
 * and walk from there in first person.
 */
export function LocateControl() {
  const viewer = useViewer()
  const me = useApp((s) => s.me)
  const pickMe = useApp((s) => s.pickMe)
  const setPickMe = useApp((s) => s.setPickMe)
  const setWalk = useApp((s) => s.setWalk)

  useEffect(() => {
    if (!viewer) return
    viewer.scene.canvas.style.cursor = pickMe ? 'crosshair' : ''
    if (!pickMe) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPickMe(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewer, pickMe, setPickMe])

  return (
    <div className="float locate" role="group" aria-label="My location">
      <IconButton
        label={me ? 'Fly to my location' : 'Set my location on the map'}
        onClick={() => (me && viewer ? flyToPoint(viewer, me, 250_000) : setPickMe(true))}
      >
        <LocateFixed />
      </IconButton>
      <IconButton
        label="Set my location: click the map"
        aria-pressed={pickMe}
        className={pickMe ? 'is-on' : ''}
        onClick={() => setPickMe(!pickMe)}
      >
        <MapPin />
      </IconButton>
      <IconButton label={me ? 'Walk from my location in first person' : 'Set your location first'} disabled={!me} onClick={() => setWalk(true)}>
        <Footprints />
      </IconButton>
      {pickMe && <span className="locate__hint">Click the map where you are · Esc cancels</span>}
    </div>
  )
}

/** The "You" marker on the globe. */
export function MeOnMap() {
  const viewer = useViewer()
  const me = useApp((s) => s.me)
  const walking = useApp((s) => s.walk)

  useEffect(() => {
    if (!viewer || !me || walking) return
    const accent = Color.fromCssColorString('#8db8d9')
    const e = viewer.entities.add({
      id: 'me',
      position: Cartesian3.fromDegrees(me.lon, me.lat, 0, Ellipsoid.MARS),
      point: {
        pixelSize: 12,
        color: Color.WHITE,
        outlineColor: accent,
        outlineWidth: 5,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: 'You',
        font: '600 13px "Geologica", system-ui, sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.fromCssColorString('#14161a'),
        outlineWidth: 4,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -12),
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    viewer.scene.requestRender()
    return () => {
      if (viewer.isDestroyed()) return
      viewer.entities.remove(e)
      viewer.scene.requestRender()
    }
  }, [viewer, me, walking])

  return null
}
