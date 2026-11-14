import { useEffect } from 'react'
import {
  Cartesian3,
  Color,
  DirectionalLight,
  Ellipsoid,
  Math as CMath,
  Matrix4,
  Transforms,
  type Light,
  type Scene,
} from 'cesium'
import type { LonLat, SunState } from '../api/types'
import { useViewer } from '../map/viewerRef'

/** Lowest sun used for shading, so a night scene stays readable instead of going black. */
const MIN_ELEVATION = 4
const LIGHT = Color.fromCssColorString('#fff1de')

/** Direction the light travels (sun → ground), in Earth-fixed (here Mars-fixed) coordinates. */
function lightDirection(center: LonLat, sun: SunState): Cartesian3 {
  const el = CMath.toRadians(Math.max(MIN_ELEVATION, sun.elevation))
  const az = CMath.toRadians(sun.azimuth)
  // East-north-up vector pointing at the sun.
  const toSun = new Cartesian3(Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el))
  const enu = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(center.lon, center.lat, 0, Ellipsoid.MARS), Ellipsoid.MARS)
  const fixed = Matrix4.multiplyByPointAsVector(enu, toSun, new Cartesian3())
  return Cartesian3.normalize(Cartesian3.negate(fixed, fixed), fixed)
}

/** Scene mutations live outside the hook body: the viewer is shared, not React state. */
function setLighting(scene: Scene, on: boolean, light: Light) {
  scene.globe.enableLighting = on
  scene.light = light
  scene.requestRender()
}

/**
 * Light the active region from the timeline's sun. Off outside a region:
 * the overview globe keeps flat, even lighting.
 */
export function useSunLighting(center: LonLat | null, sun: SunState | null) {
  const viewer = useViewer()
  const active = viewer !== null && center !== null

  useEffect(() => {
    if (!viewer || !active) return
    const { scene } = viewer
    const prevLight = scene.light
    const prevLighting = scene.globe.enableLighting
    setLighting(scene, true, prevLight)
    return () => {
      if (!viewer.isDestroyed()) setLighting(scene, prevLighting, prevLight)
    }
  }, [viewer, active])

  useEffect(() => {
    if (!viewer || !center || !sun || viewer.isDestroyed()) return
    // Dimmer light when the sun is low or down; never fully dark.
    const intensity = sun.elevation <= 0 ? 0.55 : Math.min(2, 0.9 + sun.elevation / 40)
    setLighting(viewer.scene, true, new DirectionalLight({ direction: lightDirection(center, sun), color: LIGHT, intensity }))
  }, [viewer, center, sun])
}
