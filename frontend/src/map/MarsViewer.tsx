import { useEffect, useRef } from 'react'
import {
  Cartesian2,
  Cartographic,
  Color,
  Ellipsoid,
  ImageryLayer,
  RequestScheduler,
  Math as CMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  defined,
  type Entity,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { PLACES } from '../api/places'
import { useApp } from '../store/useApp'
import { flyHome, flyToPlace } from './camera'
import { PLACE_ENTITY_PREFIX, useGridArea, usePlaceLabels } from './annotations'
import { createMolaTerrainProvider } from './terrain'
import { trekProvider } from './trek'
import { emitClick, emitMove, hasMoveHandlers, onMapClick, setViewer, useViewer, type MapPointerEvent } from './viewerRef'

// Must be set before any Cesium object is created: every default ellipsoid becomes Mars.
Ellipsoid.default = Ellipsoid.MARS
// Trek serves every layer from one host; let more tiles load in parallel so moving views fill in fast.
RequestScheduler.requestsByServer['trek.nasa.gov:443'] = 36
RequestScheduler.requestsByServer['astro.arcgis.com:443'] = 24

/** The imagery layers the base-map switch controls. */
interface BaseLayers {
  viking: ImageryLayer
  ctx: ImageryLayer
  tint: ImageryLayer
  shade: ImageryLayer
  elevation: ImageryLayer
}

/**
 * Two base maps share one globe.
 * - Natural: Viking colour; close up, the 5 m CTX greyscale mosaic with Viking
 *   laid over it at half strength to keep the colour.
 * - Elevation: MOLA + HRSC colour hillshade, where colour is height.
 */
function addBaseLayers(viewer: Viewer): BaseLayers {
  const layers = viewer.imageryLayers
  const viking = layers.get(0)
  const ctx = new ImageryLayer(trekProvider('ctx'), { minimumTerrainLevel: 6, brightness: 1.05, contrast: 1.1 })
  const tint = new ImageryLayer(trekProvider('viking'), { minimumTerrainLevel: 6, alpha: 0.5 })
  // Hillshade on top at low strength: craters, ridges and canyon walls get light and shadow.
  const shade = new ImageryLayer(trekProvider('shade'), { alpha: 0.38, contrast: 1.15 })
  const elevation = new ImageryLayer(trekProvider('elevation'), { show: false })
  layers.add(ctx)
  layers.add(tint)
  layers.add(shade)
  layers.add(elevation)
  return { viking, ctx, tint, shade, elevation }
}

function pointerEvent(viewer: Viewer, pos: Cartesian2): MapPointerEvent {
  const picking = useApp.getState().pick !== null
  const picked = viewer.scene.pick(pos) as { id?: Entity } | undefined
  const entityId = defined(picked) && picked?.id && typeof picked.id.id === 'string' ? picked.id.id : null
  const ray = viewer.camera.getPickRay(pos)
  const cart = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined
  if (!cart) return { position: null, entityId, picking }
  const c = Cartographic.fromCartesian(cart, Ellipsoid.MARS)
  return { position: { lon: CMath.toDegrees(c.longitude), lat: CMath.toDegrees(c.latitude) }, entityId, picking }
}

export function MarsViewer() {
  const host = useRef<HTMLDivElement>(null)
  const base = useRef<BaseLayers | null>(null)
  const viewer = useViewer()
  const basemap = useApp((s) => s.basemap)
  const exaggeration = useApp((s) => s.exaggeration)
  const grid = useApp((s) => s.grid)
  const showGridArea = useApp((s) => s.showGridArea)

  // Create the viewer once.
  useEffect(() => {
    if (!host.current) return
    const v = new Viewer(host.current, {
      baseLayer: new ImageryLayer(trekProvider('viking')),
      terrainProvider: createMolaTerrainProvider(),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      skyBox: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    })
    // Render at the display's real pixel density so imagery and labels stay crisp.
    v.useBrowserRecommendedResolution = false

    const { scene } = v
    scene.backgroundColor = Color.fromCssColorString('#0e1014')
    scene.globe.baseColor = Color.fromCssColorString('#6b3a24')
    scene.globe.showGroundAtmosphere = false
    scene.globe.enableLighting = false
    scene.globe.depthTestAgainstTerrain = true
    scene.globe.maximumScreenSpaceError = 1.5
    scene.globe.tileCacheSize = 400
    scene.globe.preloadSiblings = true
    if (scene.skyAtmosphere) {
      // Thin, dusty limb instead of Earth's blue halo.
      scene.skyAtmosphere.hueShift = -0.62
      scene.skyAtmosphere.saturationShift = -0.35
      scene.skyAtmosphere.brightnessShift = -0.25
    }
    scene.fog.enabled = false
    scene.verticalExaggeration = useApp.getState().exaggeration
    scene.screenSpaceCameraController.minimumZoomDistance = 2_000
    scene.screenSpaceCameraController.maximumZoomDistance = 30_000_000

    base.current = addBaseLayers(v)

    const handler = new ScreenSpaceEventHandler(scene.canvas)
    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      emitClick(pointerEvent(v, e.position))
    }, ScreenSpaceEventType.LEFT_CLICK)

    let frame = 0
    handler.setInputAction((e: ScreenSpaceEventHandler.MotionEvent) => {
      if (frame || !hasMoveHandlers()) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (!v.isDestroyed()) emitMove(pointerEvent(v, e.endPosition))
      })
    }, ScreenSpaceEventType.MOUSE_MOVE)

    flyHome(v, 0)
    setViewer(v)

    return () => {
      cancelAnimationFrame(frame)
      handler.destroy()
      setViewer(null)
      base.current = null
      v.destroy()
    }
  }, [])

  // A plain click (not choosing a route point) opens a place label or inspects the ground.
  useEffect(
    () =>
      onMapClick(({ position, entityId, picking }) => {
        if (picking) return
        const s = useApp.getState()
        if (entityId?.startsWith(PLACE_ENTITY_PREFIX)) {
          const place = PLACES.find((p) => p.id === entityId.slice(PLACE_ENTITY_PREFIX.length))
          if (!place) return
          s.selectPlace(place)
          if (viewer) flyToPlace(viewer, place)
          return
        }
        if (entityId || !position) return
        s.inspect(position)
      }),
    [viewer],
  )

  // Base-map switch.
  useEffect(() => {
    const b = base.current
    if (!viewer || !b) return
    const natural = basemap === 'natural'
    b.viking.show = natural
    b.ctx.show = natural
    b.tint.show = natural
    b.shade.show = natural
    b.elevation.show = !natural
    viewer.scene.requestRender()
  }, [viewer, basemap])

  useEffect(() => {
    if (!viewer) return
    viewer.scene.verticalExaggeration = exaggeration
    viewer.scene.requestRender()
  }, [viewer, exaggeration])

  usePlaceLabels(viewer)
  useGridArea(viewer, showGridArea ? (grid?.bbox ?? null) : null)

  return <div ref={host} className="mars-viewer" aria-label="3D map of Mars" role="application" />
}
