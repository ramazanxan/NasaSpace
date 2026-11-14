import { useEffect, useRef } from 'react'
import { Color, PolylineDashMaterialProperty, Cartesian3, Ellipsoid, type Entity, type ImageryLayer } from 'cesium'
import { api } from '../api/client'
import type { LayerKind } from '../api/types'
import { useViewer } from '../map/viewerRef'
import { useApp } from '../store/useApp'
import { createOverlayLayer, loadOverlay } from './overlay'
import { ROVERS, roverEntity } from './rovers'

const TRAIL = Color.fromCssColorString('#ece8e1').withAlpha(0.6)

/** Slope / hazard imagery for the active region, alpha bound to the store. */
function useOverlay(kind: LayerKind) {
  const viewer = useViewer()
  const regionId = useApp((s) => s.activeRegionId)
  const visible = useApp((s) => s.layers[kind].visible)
  const opacity = useApp((s) => s.layers[kind].opacity)
  const layerRef = useRef<ImageryLayer | null>(null)

  useEffect(() => {
    if (!viewer || !regionId || !visible) return
    let cancelled = false
    loadOverlay(regionId, kind).then(
      (painted) => {
        if (cancelled || viewer.isDestroyed()) return
        const layer = createOverlayLayer(painted, useApp.getState().layers[kind].opacity)
        viewer.imageryLayers.add(layer)
        layerRef.current = layer
        viewer.scene.requestRender()
      },
      (e) => console.error(`layer ${kind}`, e),
    )
    return () => {
      cancelled = true
      const layer = layerRef.current
      layerRef.current = null
      if (layer && !viewer.isDestroyed()) {
        viewer.imageryLayers.remove(layer, true)
        viewer.scene.requestRender()
      }
    }
  }, [viewer, regionId, visible, kind])

  useEffect(() => {
    const layer = layerRef.current
    if (!viewer || !layer) return
    layer.alpha = opacity
    viewer.scene.requestRender()
  }, [viewer, opacity])
}

function useTrails() {
  const viewer = useViewer()
  const regionId = useApp((s) => s.activeRegionId)
  const show = useApp((s) => s.showTrails)

  useEffect(() => {
    if (!viewer || !regionId || !show) return
    let cancelled = false
    const added: Entity[] = []
    api.trails(regionId).then(
      (trails) => {
        if (cancelled || viewer.isDestroyed()) return
        for (const t of trails) {
          added.push(
            viewer.entities.add({
              id: `trail:${t.id}`,
              name: t.name,
              polyline: {
                positions: Cartesian3.fromDegreesArray(
                  t.points.flatMap((p) => [p.lon, p.lat]),
                  Ellipsoid.MARS,
                ),
                width: 1.5,
                clampToGround: true,
                material: new PolylineDashMaterialProperty({ color: TRAIL, gapColor: Color.TRANSPARENT, dashLength: 12 }),
              },
            }),
          )
        }
        viewer.scene.requestRender()
      },
      (e) => console.error('trails', e),
    )
    return () => {
      cancelled = true
      if (viewer.isDestroyed()) return
      added.forEach((e) => viewer.entities.remove(e))
      viewer.scene.requestRender()
    }
  }, [viewer, regionId, show])
}

function useRovers() {
  const viewer = useViewer()
  const show = useApp((s) => s.showRovers)

  useEffect(() => {
    if (!viewer || !show) return
    const added = ROVERS.map((r) => viewer.entities.add(roverEntity(r)))
    viewer.scene.requestRender()
    return () => {
      if (viewer.isDestroyed()) return
      added.forEach((e) => viewer.entities.remove(e))
      viewer.scene.requestRender()
    }
  }, [viewer, show])
}

/** Map side of the layers feature. Renders nothing in the DOM. */
export function LayersOnMap() {
  useOverlay('slope')
  useOverlay('hazard')
  useTrails()
  useRovers()
  return null
}
