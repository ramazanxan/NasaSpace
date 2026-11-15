import { BoundingSphere, Cartesian3, Ellipsoid, HeadingPitchRange, Math as CMath, type Viewer } from 'cesium'
import type { LonLat, Place } from '../api/types'

const MARS = Ellipsoid.MARS

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const seconds = (s: number) => (reducedMotion() ? 0 : s)

/** Whole-planet view centred on the hemisphere the route grid covers. */
export function flyHome(viewer: Viewer, duration = 2.2) {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(-85, 6, 13_500_000, MARS),
    orientation: { heading: 0, pitch: CMath.toRadians(-90), roll: 0 },
    duration: seconds(duration),
  })
}

/** Oblique view of a point from `range` metres away, so the relief reads at first glance. */
export function flyToPoint(viewer: Viewer, p: LonLat, range = 900_000, duration = 2.2) {
  const center = Cartesian3.fromDegrees(p.lon, p.lat, 0, MARS)
  viewer.camera.flyToBoundingSphere(new BoundingSphere(center, 1), {
    offset: new HeadingPitchRange(0, CMath.toRadians(-52), range),
    duration: seconds(duration),
  })
}

export function flyToPlace(viewer: Viewer, place: Place) {
  flyToPoint(viewer, place.position, place.viewRange ?? 700_000)
}

/**
 * Frame a set of points (a route). The side panels cover about half the
 * window, so the view is wider than a bare fit.
 */
export function flyToPoints(viewer: Viewer, points: LonLat[], duration = 1.8) {
  if (points.length < 2) return
  const sphere = BoundingSphere.fromPoints(points.map((p) => Cartesian3.fromDegrees(p.lon, p.lat, 0, MARS)))
  viewer.camera.flyToBoundingSphere(sphere, {
    offset: new HeadingPitchRange(0, CMath.toRadians(-62), Math.max(400_000, sphere.radius * 3.6)),
    duration: seconds(duration),
  })
}
