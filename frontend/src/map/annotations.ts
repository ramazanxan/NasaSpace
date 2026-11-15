import { useEffect } from 'react'
import {
  Cartesian2,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  Ellipsoid,
  HeightReference,
  HorizontalOrigin,
  LabelStyle,
  NearFarScalar,
  PolylineDashMaterialProperty,
  VerticalOrigin,
  type Entity,
  type Viewer,
} from 'cesium'
import { PLACES } from '../api/places'
import type { BBox } from '../api/types'

export const PLACE_ENTITY_PREFIX = 'place:'

const TEXT = Color.fromCssColorString('#ece8e1')
const HALO = Color.fromCssColorString('#14161a').withAlpha(0.85)
const FONT = '500 13px "Geologica", system-ui, sans-serif'

/** Names of the featured places on the globe. Clicking one opens it. */
export function usePlaceLabels(viewer: Viewer | null) {
  useEffect(() => {
    if (!viewer) return
    const added: Entity[] = PLACES.filter((p) => p.featured).map((p) =>
      viewer.entities.add({
        id: `${PLACE_ENTITY_PREFIX}${p.id}`,
        name: p.name,
        position: Cartesian3.fromDegrees(p.position.lon, p.position.lat, 0, Ellipsoid.MARS),
        point: {
          pixelSize: 5,
          color: TEXT,
          outlineColor: HALO,
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(1_500_000, 40_000_000),
        },
        label: {
          text: p.name,
          font: FONT,
          fillColor: TEXT,
          outlineColor: HALO,
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: HorizontalOrigin.LEFT,
          verticalOrigin: VerticalOrigin.CENTER,
          pixelOffset: new Cartesian2(9, 0),
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          // Labels are for the overview; up close they would sit on top of the terrain.
          distanceDisplayCondition: new DistanceDisplayCondition(1_500_000, 40_000_000),
          scaleByDistance: new NearFarScalar(3_000_000, 1, 25_000_000, 0.8),
        },
      }),
    )
    viewer.scene.requestRender()
    return () => {
      if (viewer.isDestroyed()) return
      added.forEach((e) => viewer.entities.remove(e))
      viewer.scene.requestRender()
    }
  }, [viewer])
}

/** Dashed frame around the area the backend's hex grid covers: routes exist only inside it. */
export function useGridArea(viewer: Viewer | null, bbox: BBox | null) {
  useEffect(() => {
    if (!viewer || !bbox) return
    const [w, s, e, n] = bbox
    // Meridians are drawn pole to pole in steps so the lines follow the sphere.
    const meridian = (lon: number) => {
      const pts: number[] = []
      for (let lat = Math.max(-88, s); lat <= Math.min(88, n); lat += 4) pts.push(lon, lat)
      return Cartesian3.fromDegreesArray(pts, Ellipsoid.MARS)
    }
    const material = new PolylineDashMaterialProperty({ color: TEXT.withAlpha(0.45), dashLength: 14 })
    const added = [w, e].map((lon, i) =>
      viewer.entities.add({
        id: `grid-area:${i}`,
        polyline: { positions: meridian(lon), width: 1.25, material, clampToGround: true },
      }),
    )
    viewer.scene.requestRender()
    return () => {
      if (viewer.isDestroyed()) return
      added.forEach((x) => viewer.entities.remove(x))
      viewer.scene.requestRender()
    }
  }, [viewer, bbox])
}
