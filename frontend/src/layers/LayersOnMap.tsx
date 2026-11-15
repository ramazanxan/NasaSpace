import { useEffect, useState } from 'react'
import { Ellipsoid, ImageryLayer, Rectangle, SingleTileImageryProvider, type Entity, type Viewer } from 'cesium'
import { api } from '../api/client'
import { trekProvider } from '../map/trek'
import { useViewer } from '../map/viewerRef'
import { useApp, type TrekOverlayId } from '../store/useApp'
import { landingSiteEntity, LANDING_SITES } from './landingSites'
import { analysisErrorText, TREK_ERROR_TEXT, useLayerErrors } from './layerErrors'

/** Our imagery layers per viewer, kept in one place so they can be stacked in a fixed order. */
type Stack = Partial<Record<TrekOverlayId | 'analysis', ImageryLayer>>
const stacks = new WeakMap<Viewer, Stack>()

function stackOf(viewer: Viewer): Stack {
  let stack = stacks.get(viewer)
  if (!stack) {
    stack = {}
    stacks.set(viewer, stack)
  }
  return stack
}

/** Base maps stay below, then the Trek overlays, then the analysis layer on top. */
function restack(viewer: Viewer, stack: Stack) {
  const layers = viewer.imageryLayers
  for (const l of [stack.dust, stack['thermal-inertia'], stack.analysis]) {
    if (l && layers.contains(l)) layers.raiseToTop(l)
  }
  viewer.scene.requestRender()
}

/** Scene mutations live outside the hooks: the viewer is shared, not React state. */
function setAlpha(viewer: Viewer, key: keyof Stack, alpha: number) {
  const layer = stackOf(viewer)[key]
  if (!layer) return
  layer.alpha = alpha
  viewer.scene.requestRender()
}

/** NASA Trek imagery overlay, shown while the store says so; alpha follows opacity. */
function useTrekOverlay(id: TrekOverlayId) {
  const viewer = useViewer()
  const visible = useApp((s) => s.trek[id].visible)
  const opacity = useApp((s) => s.trek[id].opacity)

  useEffect(() => {
    const { setError } = useLayerErrors.getState()
    setError(id, null)
    if (!viewer || !visible) return
    const provider = trekProvider(id)
    const offError = provider.errorEvent.addEventListener(() => setError(id, TREK_ERROR_TEXT[id]))
    const layer = new ImageryLayer(provider, { alpha: useApp.getState().trek[id].opacity })
    const stack = stackOf(viewer)
    viewer.imageryLayers.add(layer)
    stack[id] = layer
    restack(viewer, stack)
    return () => {
      offError()
      if (stack[id] === layer) delete stack[id]
      if (viewer.isDestroyed()) return
      viewer.imageryLayers.remove(layer, true)
      viewer.scene.requestRender()
    }
  }, [viewer, visible, id])

  useEffect(() => {
    if (viewer) setAlpha(viewer, id, opacity)
  }, [viewer, opacity, id])
}

/** The value, settled for `ms` before it changes. The first value passes through at once. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

/**
 * The one backend analysis layer: a single equirectangular PNG over the grid bbox.
 * A new image replaces the old one only once it has loaded, so scrubbing the hour
 * does not blink; an image that resolves after a newer request is dropped.
 */
function useAnalysisLayer() {
  const viewer = useViewer()
  const online = useApp((s) => s.backend === 'online')
  const catalog = useApp((s) => s.catalog)
  const id = useApp((s) => s.analysis.id)
  const opacity = useApp((s) => s.analysis.opacity)
  const mode = useApp((s) => s.mode)
  const hour = useApp((s) => s.hour)

  const meta = online && id ? (catalog?.layers.find((l) => l.id === id) ?? null) : null
  const bbox = catalog?.bbox ?? null
  // Fixed values for layers that ignore mode or time, so their URL (and cache entry) stays the same.
  const layerMode = meta?.modeDependent ? mode : 'rover'
  const settledHour = useSettled(Math.round(hour * 2) / 2, 250)
  const layerHour = meta?.timeDependent ? settledHour : 12
  const active = meta !== null
  const title = meta?.title ?? ''
  const source = meta?.source ?? ''

  useEffect(() => {
    if (!viewer) return
    const { setError } = useLayerErrors.getState()
    const stack = stackOf(viewer)
    const drop = () => {
      const old = stack.analysis
      delete stack.analysis
      if (old && !viewer.isDestroyed()) {
        viewer.imageryLayers.remove(old, true)
        viewer.scene.requestRender()
      }
    }
    if (!id || !active || !bbox) {
      setError('analysis', null)
      drop()
      return
    }
    let stale = false
    const [w, s, e, n] = bbox
    const rectangle = Rectangle.fromDegrees(w, Math.max(-90, s), e, Math.min(90, n))
    const url = api.layerImageUrl(id, { mode: layerMode, hour: layerHour })
    SingleTileImageryProvider.fromUrl(url, { rectangle, ellipsoid: Ellipsoid.MARS, credit: source }).then(
      (provider) => {
        if (stale || viewer.isDestroyed()) return
        setError('analysis', null)
        const layer = new ImageryLayer(provider, { alpha: useApp.getState().analysis.opacity })
        viewer.imageryLayers.add(layer)
        drop()
        stack.analysis = layer
        restack(viewer, stack)
      },
      (err: unknown) => {
        if (stale) return
        console.error(`analysis layer ${id}`, err)
        drop()
        setError('analysis', analysisErrorText(title))
      },
    )
    return () => {
      stale = true
    }
  }, [viewer, id, active, bbox, layerMode, layerHour, title, source])

  useEffect(() => {
    if (viewer) setAlpha(viewer, 'analysis', opacity)
  }, [viewer, opacity])

  // Unmount: the swap logic above keeps the layer between runs, so remove it here.
  useEffect(() => {
    if (!viewer) return
    const stack = stackOf(viewer)
    return () => {
      const layer = stack.analysis
      delete stack.analysis
      if (!layer || viewer.isDestroyed()) return
      viewer.imageryLayers.remove(layer, true)
      viewer.scene.requestRender()
    }
  }, [viewer])
}

/** Markers for rovers and landers at the mission landing sites. */
function useLandingSites() {
  const viewer = useViewer()
  const show = useApp((s) => s.showRovers)

  useEffect(() => {
    if (!viewer || !show) return
    const added: Entity[] = []
    for (const p of LANDING_SITES) {
      const opts = landingSiteEntity(p)
      if (opts.id && viewer.entities.getById(opts.id)) continue
      added.push(viewer.entities.add(opts))
    }
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
  useTrekOverlay('dust')
  useTrekOverlay('thermal-inertia')
  useAnalysisLayer()
  useLandingSites()
  return null
}
