import { BoundingSphere, Cartesian3, Ellipsoid, HeadingPitchRange, Math as CMath, type Viewer } from 'cesium'
import type { LonLat, Region } from '../api/types'
import { distance } from './geo'

const MARS = Ellipsoid.MARS

export function flyHome(viewer: Viewer, duration = 2.2) {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(105, 8, 13_500_000, MARS),
    orientation: { heading: 0, pitch: CMath.toRadians(-90), roll: 0 },
    duration,
  })
}

/** Oblique view over a region so the relief reads at first glance. */
export function flyToRegion(viewer: Viewer, region: Region, duration = 2.6) {
  const [w, s, e, n] = region.bbox
  const diag = distance({ lon: w, lat: s }, { lon: e, lat: n })
  const center = Cartesian3.fromDegrees(region.center.lon, region.center.lat, 0, MARS)
  viewer.camera.flyToBoundingSphere(new BoundingSphere(center, diag / 2), {
    offset: new HeadingPitchRange(0, CMath.toRadians(-38), diag * 0.95),
    duration,
  })
}

/** Smooth hop to a point inside the current region, keeping the current heading. */
export function flyToPoint(viewer: Viewer, p: LonLat, range = 9000, duration = 1.8) {
  const center = Cartesian3.fromDegrees(p.lon, p.lat, 0, MARS)
  viewer.camera.flyToBoundingSphere(new BoundingSphere(center, 1), {
    offset: new HeadingPitchRange(viewer.camera.heading, CMath.toRadians(-40), range),
    duration,
  })
}
