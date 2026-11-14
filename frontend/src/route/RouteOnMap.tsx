import { useEffect, useRef } from 'react'
import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  Ellipsoid,
  HeadingPitchRange,
  HeightReference,
  LabelStyle,
  Math as CMath,
  PointPrimitiveCollection,
  PolylineDashMaterialProperty,
  VerticalOrigin,
  type Entity,
  type PointPrimitive,
  type Viewer,
} from 'cesium'
import type { LonLat } from '../api/types'
import { sample } from '../map/geo'
import { displayHeight } from '../map/terrain'
import { onMapClick, useViewer } from '../map/viewerRef'
import { useApp } from '../store/useApp'
import { useCompare } from './compareStore'
import { POINT_LABEL, prefersReducedMotion, tokenColor } from './routeUtils'

const MARS = Ellipsoid.MARS
const REPLAY_MS = 2600

const at = (p: LonLat, h = 0) => Cartesian3.fromDegrees(p.lon, p.lat, h, MARS)

function palette() {
  return {
    accent: Color.fromCssColorString(tokenColor('--c-accent', '#8db8d9')),
    accentInk: Color.fromCssColorString(tokenColor('--c-accent-ink', '#10202c')),
    ground: Color.fromCssColorString(tokenColor('--c-ground', '#15171a')),
    text: Color.fromCssColorString(tokenColor('--c-text', '#ece8e1')),
    text3: Color.fromCssColorString(tokenColor('--c-text-3', '#74767a')),
  }
}

function useClickToPick() {
  useEffect(
    () =>
      onMapClick(({ position }) => {
        const { pick, activeRegionId, setPoint } = useApp.getState()
        if (!pick || !activeRegionId || !position) return
        setPoint(pick, position)
      }),
    [],
  )
}

function usePickCursor(viewer: Viewer | null) {
  const pick = useApp((s) => s.pick)
  const active = useApp((s) => s.activeRegionId)
  useEffect(() => {
    if (!viewer || !pick || !active) return
    const canvas = viewer.canvas
    canvas.style.setProperty('cursor', 'crosshair')
    return () => {
      canvas.style.removeProperty('cursor')
    }
  }, [viewer, pick, active])
}

function useMarkers(viewer: Viewer | null) {
  const from = useApp((s) => s.from)
  const to = useApp((s) => s.to)
  useEffect(() => {
    if (!viewer) return
    const c = palette()
    const added: Entity[] = []
    for (const [which, p] of [
      ['from', from],
      ['to', to],
    ] as const) {
      if (!p) continue
      added.push(
        viewer.entities.add({
          id: `route:${which}`,
          position: at(p),
          point: {
            pixelSize: 12,
            color: c.accentInk,
            outlineColor: c.accent,
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: POINT_LABEL[which],
            font: '600 13px "Geologica", system-ui, sans-serif',
            fillColor: c.text,
            outlineColor: c.ground.withAlpha(0.85),
            outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(0, -10),
            heightReference: HeightReference.CLAMP_TO_GROUND,
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
  }, [viewer, from, to])
}

function useRouteLine(viewer: Viewer | null) {
  const route = useApp((s) => s.route)
  const status = useApp((s) => s.routeStatus)
  const from = useApp((s) => s.from)
  const to = useApp((s) => s.to)

  useEffect(() => {
    if (!viewer) return
    const c = palette()
    const added: Entity[] = []
    const stale = status === 'loading'
    if (route && status !== 'error') {
      const positions = route.points.map((p) => at(p))
      added.push(
        viewer.entities.add({
          id: 'route:underlay',
          polyline: {
            positions,
            width: 7,
            material: c.ground.withAlpha(stale ? 0.3 : 0.7),
            clampToGround: true,
            zIndex: 0,
          },
        }),
        viewer.entities.add({
          id: 'route:line',
          polyline: {
            positions,
            width: 4,
            material: c.accent.withAlpha(stale ? 0.45 : 1),
            clampToGround: true,
            zIndex: 1,
          },
        }),
      )
    } else if (from && to) {
      // No route yet (or none possible): a faint straight hint between the points.
      added.push(
        viewer.entities.add({
          id: 'route:draft',
          polyline: {
            positions: [at(from), at(to)],
            width: 1.5,
            material: new PolylineDashMaterialProperty({ color: c.text.withAlpha(0.6), dashLength: 12 }),
            clampToGround: true,
            zIndex: 0,
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
  }, [viewer, route, status, from, to])

  // Frame a freshly arrived route.
  useEffect(() => {
    if (!viewer || !route || route.points.length < 2) return
    const sphere = BoundingSphere.fromPoints(route.points.map((p) => at(p)))
    // Side panels cover ~half the width, so frame wider than the bare fit.
    const range = Math.max(5000, sphere.radius * 3.8)
    viewer.camera.flyToBoundingSphere(sphere, {
      offset: new HeadingPitchRange(viewer.camera.heading, CMath.toRadians(-48), range),
      duration: prefersReducedMotion() ? 0 : 1.6,
    })
    viewer.scene.requestRender()
  }, [viewer, route])
}

function useHoverMarker(viewer: Viewer | null) {
  const route = useApp((s) => s.route)
  const hoverIndex = useApp((s) => s.hoverIndex)
  const marker = useRef<Entity | null>(null)

  useEffect(() => {
    if (!viewer || !route) return
    const c = palette()
    const m = viewer.entities.add({
      id: 'route:hover',
      show: false,
      position: new ConstantPositionProperty(at(route.points[0])),
      point: {
        pixelSize: 9,
        color: c.text,
        outlineColor: c.ground,
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    marker.current = m
    return () => {
      marker.current = null
      if (viewer.isDestroyed()) return
      viewer.entities.remove(m)
      viewer.scene.requestRender()
    }
  }, [viewer, route])

  useEffect(() => {
    const m = marker.current
    if (!viewer || !m || !route) return
    const p = hoverIndex == null ? undefined : route.points[hoverIndex]
    if (p) (m.position as ConstantPositionProperty).setValue(at(p))
    m.show = !!p
    viewer.scene.requestRender()
  }, [viewer, route, hoverIndex])
}

/** Replays the cells an algorithm expanded, in the order it expanded them. */
function useSearchReplay(viewer: Viewer | null) {
  const playing = useCompare((s) => s.playing)
  const playId = useCompare((s) => s.playId)
  const results = useCompare((s) => s.results)

  useEffect(() => {
    const visited = playing ? results[playing]?.visited : undefined
    if (!viewer || !visited?.length) return
    const { terrain, regions, activeRegionId, exaggeration } = useApp.getState()
    const grid = activeRegionId ? terrain[activeRegionId] : undefined
    const region = regions.find((r) => r.id === activeRegionId)
    const lift = (p: LonLat) => {
      if (!grid || !region) return 0
      const h = sample(grid, grid.heights, p)
      return Number.isNaN(h) ? 0 : displayHeight(region, h) * exaggeration + 30
    }

    const c = palette()
    const color = (playing === 'astar' ? c.text : c.text3).withAlpha(0.75)
    const collection = new PointPrimitiveCollection()
    const pts: PointPrimitive[] = visited.map(([lon, lat]) =>
      collection.add({
        position: at({ lon, lat }, lift({ lon, lat })),
        pixelSize: 3,
        color,
        show: false,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      }),
    )
    viewer.scene.primitives.add(collection)

    let frame = 0
    let shown = 0
    const reveal = (n: number) => {
      for (; shown < n; shown++) pts[shown].show = true
      viewer.scene.requestRender()
    }
    if (prefersReducedMotion()) {
      reveal(pts.length)
    } else {
      const start = performance.now()
      const tick = (now: number) => {
        if (viewer.isDestroyed()) return
        const k = Math.min(1, (now - start) / REPLAY_MS)
        reveal(Math.ceil(k * pts.length))
        if (k < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    return () => {
      cancelAnimationFrame(frame)
      if (viewer.isDestroyed()) return
      viewer.scene.primitives.remove(collection) // also destroys it
      viewer.scene.requestRender()
    }
  }, [viewer, playing, playId, results])
}

/** Route markers, line, profile hover and search replay on the globe. Renders nothing in the DOM. */
export function RouteOnMap() {
  const viewer = useViewer()
  useClickToPick()
  usePickCursor(viewer)
  useMarkers(viewer)
  useRouteLine(viewer)
  useHoverMarker(viewer)
  useSearchReplay(viewer)
  return null
}
