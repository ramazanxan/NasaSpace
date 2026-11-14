import { useEffect } from 'react'
import {
  Cartesian2,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  Ellipsoid,
  HorizontalOrigin,
  LabelStyle,
  VerticalOrigin,
  type Entity,
  type Viewer,
} from 'cesium'
import type { Region } from '../api/types'

export const REGION_ENTITY_PREFIX = 'region:'

const LINE = Color.fromCssColorString('#e8e4dc').withAlpha(0.55)
const LINE_ACTIVE = Color.fromCssColorString('#8db8d9').withAlpha(0.9)

/** Thin frames + names for each modelled region. Clicking one opens it. */
export function useRegionOutlines(viewer: Viewer | null, regions: Region[], activeId: string | null) {
  useEffect(() => {
    if (!viewer || !regions.length) return
    const added: Entity[] = []
    for (const r of regions) {
      const [w, s, e, n] = r.bbox
      const active = r.id === activeId
      added.push(
        viewer.entities.add({
          id: `${REGION_ENTITY_PREFIX}${r.id}`,
          name: r.name,
          polyline: {
            positions: Cartesian3.fromDegreesArray([w, s, e, s, e, n, w, n, w, s], Ellipsoid.MARS),
            width: active ? 1.5 : 1,
            material: active ? LINE_ACTIVE : LINE,
            clampToGround: true,
          },
        }),
        viewer.entities.add({
          id: `${REGION_ENTITY_PREFIX}${r.id}:label`,
          position: Cartesian3.fromDegrees(w, n, 0, Ellipsoid.MARS),
          label: {
            text: r.name,
            font: '500 13px "Geologica", system-ui, sans-serif',
            fillColor: Color.fromCssColorString('#ece8e1'),
            outlineColor: Color.fromCssColorString('#14161a').withAlpha(0.8),
            outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            horizontalOrigin: HorizontalOrigin.LEFT,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(0, -6),
            // Labels are for the overview; inside a region they would cover the terrain.
            distanceDisplayCondition: new DistanceDisplayCondition(400_000, 40_000_000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      )
    }
    viewer.scene.requestRender()
    return () => {
      if (viewer.isDestroyed()) return
      added.forEach((e) => viewer.entities.remove(e))
      viewer.scene.requestRender()
    }
  }, [viewer, regions, activeId])
}
