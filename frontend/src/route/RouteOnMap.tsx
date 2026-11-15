import { useEffect, useRef } from 'react'
import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ConstantPositionProperty,
  Ellipsoid,
  HeightReference,
  LabelStyle,
  PointPrimitiveCollection,
  PolylineDashMaterialProperty,
  PolylineOutlineMaterialProperty,
  VerticalOrigin,
  sampleTerrain,
  type Entity,
  type PointPrimitive,
  type Viewer,
} from 'cesium'
import type { LonLat, RouteCell } from '../api/types'
import { flyToPoints } from '../map/camera'
import { buildPath } from '../fpv/path'
import { onMapClick, useViewer } from '../map/viewerRef'
import { useApp } from '../store/useApp'
import { useCompare } from './compareStore'
import { POINT_LABEL, highRiskRuns, prefersReducedMotion, tokenColor } from './routeUtils'

const MARS = Ellipsoid.MARS
const REPLAY_MS = 2600
const MAX_REPLAY_POINTS = 40_000
/** Terrain level the replay heights are read at: 45° tiles, ~40 km samples, close to the ~59 km hex cells. */
const REPLAY_TERRAIN_LEVEL = 2
/** Metres above the sampled (smoothed) ground, so points are not swallowed by finer terrain. */
const REPLAY_LIFT = 2_500
/** Within this camera distance replay points ignore depth, so relief never hides them up close. */
const REPLAY_NO_DEPTH_M = 1_500_000

const at = (p: LonLat, h = 0) => Cartesian3.fromDegrees(p.lon, p.lat, h, MARS)

function palette() {
  return {
    accent: Color.fromCssColorString(tokenColor('--c-accent', '#8db8d9')),
    accentInk: Color.fromCssColorString(tokenColor('--c-accent-ink', '#10202c')),
    ground: Color.fromCssColorString(tokenColor('--c-ground', '#15171a')),
    rust: Color.fromCssColorString(tokenColor('--c-rust', '#b8613a')),
    ochre: Color.fromCssColorString(tokenColor('--c-ochre', '#e0a050')),
    text: Color.fromCssColorString(tokenColor('--c-text', '#ece8e1')),
    text3: Color.fromCssColorString(tokenColor('--c-text-3', '#74767a')),
  }
}

/** Cells of the current plan when it has a drawable route, else null. */
const routeCells = (plan: ReturnType<typeof useApp.getState>['plan']): RouteCell[] | null => {
  const cells = plan?.status === 'OK' ? plan.route?.cells : undefined
  return cells && cells.length > 1 ? cells : null
}

function useClickToPick() {
  useEffect(
    () =>
      onMapClick(({ position, picking }) => {
        if (!picking || !position) return
        const { pick, setPoint } = useApp.getState()
        if (pick) setPoint(pick, position)
      }),
    [],
  )
}

function usePickCursor(viewer: Viewer | null) {
  const pick = useApp((s) => s.pick)
  useEffect(() => {
    if (!viewer || !pick) return
    const canvas = viewer.canvas
    canvas.style.setProperty('cursor', 'crosshair')
    return () => {
      canvas.style.removeProperty('cursor')
    }
  }, [viewer, pick])
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
  const plan = useApp((s) => s.plan)
  const status = useApp((s) => s.routeStatus)
  const from = useApp((s) => s.from)
  const to = useApp((s) => s.to)
  const framed = useRef<string | null>(null)

  const exaggeration = useApp((s) => s.exaggeration)

  useEffect(() => {
    if (!viewer) return
    const c = palette()
    const added: Entity[] = []
    const cells = status === 'error' ? null : routeCells(plan)
    const stale = status === 'loading'
    // Lines float just above the exaggerated MOLA surface instead of being draped on it:
    // draped lines break up on steep relief. Where a ridge still hides a stretch,
    // the depth-fail material keeps it visible, slightly dimmed.
    // Lines float just above the exaggerated MOLA surface instead of being draped on it
    // (draped lines break up on steep relief). The cell-to-cell path is smoothed so it
    // reads as a road, not a staircase; where relief still hides it, it shows dimmed.
    const lift = 600 + 250 * exaggeration
    const raised = (p: LonLat, h: number | null | undefined) => at(p, (h ?? 0) * exaggeration + lift)
    if (cells) {
      const smooth = buildPath(cells)
      const positions = smooth.map((p) => raised(p, p.h))
      const road = (id: string, pts: Cartesian3[], core: Color, width: number) => {
        const material = new PolylineOutlineMaterialProperty({ color: core, outlineColor: c.ground.withAlpha(0.9), outlineWidth: 2 })
        return viewer.entities.add({
          id,
          polyline: {
            positions: pts,
            width,
            material,
            depthFailMaterial: new PolylineOutlineMaterialProperty({
              color: core.withAlpha(0.45),
              outlineColor: c.ground.withAlpha(0.4),
              outlineWidth: 2,
            }),
            arcType: ArcType.NONE,
          },
        })
      }
      added.push(road('route:line', positions, c.accent.withAlpha(stale ? 0.5 : 1), 7))
      // HIGH-risk stretches change the core colour to warm ochre, same width, drawn on top.
      highRiskRuns(cells).forEach(([i, j], k) => {
        const run = smooth.filter((p) => p.cell >= i && p.cell <= j)
        if (run.length < 2) return
        added.push(road(`route:risk:${k}`, run.map((p) => raised(p, p.h + 40)), c.ochre.withAlpha(stale ? 0.5 : 1), 7))
      })
    } else if (from && to) {
      // No route yet (or none possible): a straight hint between the points, high enough to clear the relief.
      const color = c.text.withAlpha(0.85)
      added.push(
        viewer.entities.add({
          id: 'route:draft',
          polyline: {
            positions: [at(from, lift * 4), at(to, lift * 4)],
            width: 2.5,
            arcType: ArcType.GEODESIC,
            material: new PolylineDashMaterialProperty({ color, gapColor: c.ground.withAlpha(0.6), dashLength: 16 }),
            depthFailMaterial: new PolylineDashMaterialProperty({ color: color.withAlpha(0.45), dashLength: 16 }),
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
  }, [viewer, plan, status, from, to, exaggeration])

  // Frame a route with new end cells or mode; a new departure hour alone keeps the view.
  useEffect(() => {
    const cells = routeCells(plan)
    if (!plan || !cells) {
      if (!plan) framed.current = null
      return
    }
    const key = `${plan.startCellId}>${plan.goalCellId}:${plan.mode}`
    if (!viewer || framed.current === key) return
    framed.current = key
    flyToPoints(viewer, cells)
    viewer.scene.requestRender()
  }, [viewer, plan])
}

function useHoverMarker(viewer: Viewer | null) {
  const plan = useApp((s) => s.plan)
  const hoverIndex = useApp((s) => s.hoverIndex)
  const marker = useRef<Entity | null>(null)
  const cells = routeCells(plan)

  useEffect(() => {
    if (!viewer || !cells) return
    const c = palette()
    const m = viewer.entities.add({
      id: 'route:hover',
      show: false,
      position: new ConstantPositionProperty(at(cells[0])),
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
  }, [viewer, cells])

  useEffect(() => {
    const m = marker.current
    if (!viewer || !m || !cells) return
    const p = hoverIndex == null ? undefined : cells[hoverIndex]
    if (p) (m.position as ConstantPositionProperty).setValue(at(p))
    m.show = !!p
    viewer.scene.requestRender()
  }, [viewer, cells, hoverIndex])
}

interface Replay {
  pts: PointPrimitive[]
  cells: LonLat[]
  /** Ground height before vertical exaggeration, per cell. */
  base: number[]
}

/** Replays the cells an algorithm expanded, in the order it expanded them. */
function useSearchReplay(viewer: Viewer | null) {
  const playing = useCompare((s) => s.playing)
  const playId = useCompare((s) => s.playId)
  const results = useCompare((s) => s.results)
  const exaggeration = useApp((s) => s.exaggeration)
  const replay = useRef<Replay | null>(null)

  useEffect(() => {
    const visited = playing ? results[playing]?.visited : undefined
    if (!viewer || !visited?.length) return
    const cells: LonLat[] = visited.slice(0, MAX_REPLAY_POINTS).map(([lon, lat]) => ({ lon, lat }))
    const c = palette()
    const color = (playing === 'astar' ? c.text : c.text3).withAlpha(0.75)
    const collection = new PointPrimitiveCollection()
    viewer.scene.primitives.add(collection)
    let frame = 0
    let cancelled = false

    const begin = (base: number[], depthTest: boolean) => {
      if (cancelled || viewer.isDestroyed()) return
      const x = useApp.getState().exaggeration
      const pts = cells.map((p, i) =>
        collection.add({
          position: at(p, base[i] * x + REPLAY_LIFT),
          pixelSize: 3,
          color,
          show: false,
          disableDepthTestDistance: depthTest ? REPLAY_NO_DEPTH_M : Number.POSITIVE_INFINITY,
        }),
      )
      replay.current = { pts, cells, base }
      let shown = 0
      const reveal = (n: number) => {
        for (; shown < n; shown++) pts[shown].show = true
        viewer.scene.requestRender()
      }
      if (prefersReducedMotion()) {
        reveal(pts.length)
        return
      }
      const start = performance.now()
      const tick = (now: number) => {
        if (cancelled || viewer.isDestroyed()) return
        const k = Math.min(1, (now - start) / REPLAY_MS)
        reveal(Math.ceil(k * pts.length))
        if (k < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    // PointPrimitive has no height reference, so read the relief once and lift the points above it.
    // If terrain cannot be sampled, draw at the datum and ignore depth so they stay visible.
    const carts = cells.map((p) => Cartographic.fromDegrees(p.lon, p.lat))
    sampleTerrain(viewer.terrainProvider, REPLAY_TERRAIN_LEVEL, carts).then(
      (r) => begin(r.map((k) => (Number.isFinite(k.height) ? k.height : 0)), true),
      () => begin(cells.map(() => 0), false),
    )

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      replay.current = null
      if (viewer.isDestroyed()) return
      viewer.scene.primitives.remove(collection) // also destroys it
      viewer.scene.requestRender()
    }
  }, [viewer, playing, playId, results])

  // Follow the relief slider without restarting the replay.
  useEffect(() => {
    const r = replay.current
    if (!viewer || !r) return
    r.pts.forEach((pt, i) => {
      pt.position = at(r.cells[i], r.base[i] * exaggeration + REPLAY_LIFT)
    })
    viewer.scene.requestRender()
  }, [viewer, exaggeration])
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
