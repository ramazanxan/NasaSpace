import { useEffect, useRef } from 'react'
import {
  Cartesian2,
  Cartographic,
  Color,
  Ellipsoid,
  ImageryLayer,
  Math as CMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  Viewer,
  defined,
  type Entity,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { api } from '../api/client'
import { useApp } from '../store/useApp'
import { createTerrainProvider, marsTilingScheme } from './terrain'
import { emitClick, emitMove, setViewer, useViewer, type MapPointerEvent } from './viewerRef'
import { flyHome, flyToRegion } from './camera'
import { REGION_ENTITY_PREFIX, useRegionOutlines } from './regionOutlines'

// Must be set before any Cesium object is created: every default ellipsoid becomes Mars.
Ellipsoid.default = Ellipsoid.MARS

const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ'
/** Viking colour mosaic, 232 m/px. Public NASA tiles with CORS enabled. */
const MARS_IMAGERY = `${TREK}/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`
/** MRO CTX greyscale mosaic, ~5 m/px, 512 px tiles. Published through Mars Trek (Esri Astro), CORS enabled. */
const MARS_CTX = 'https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/{z}/{y}/{x}'

const vikingProvider = () =>
  new UrlTemplateImageryProvider({
    url: MARS_IMAGERY,
    tilingScheme: marsTilingScheme(),
    maximumLevel: 7,
    credit: 'NASA/JPL Mars Trek · Viking MDIM 2.1',
  })

/**
 * Close up, the 232 m Viking colour mosaic turns to mush. Above it we lay the
 * 5 m CTX greyscale mosaic, then Viking again at low alpha to bring the colour
 * back. Both extra layers appear only once the camera is near the ground.
 */
function addDetailImagery(viewer: Viewer) {
  const layers = viewer.imageryLayers
  const ctx = new ImageryLayer(
    new UrlTemplateImageryProvider({
      url: MARS_CTX,
      tilingScheme: marsTilingScheme(),
      tileWidth: 512,
      tileHeight: 512,
      maximumLevel: 12,
      credit: 'NASA/JPL/MSSS · MRO CTX mosaic (Caltech Murray Lab), via Mars Trek',
    }),
    { minimumTerrainLevel: 6, brightness: 1.05, contrast: 1.1 },
  )
  const tint = new ImageryLayer(vikingProvider(), { minimumTerrainLevel: 6, alpha: 0.5 })
  layers.add(ctx)
  layers.add(tint)
}

function pointerEvent(viewer: Viewer, pos: Cartesian2): MapPointerEvent {
  const picked = viewer.scene.pick(pos) as { id?: Entity } | undefined
  const entityId = defined(picked) && picked?.id && typeof picked.id.id === 'string' ? picked.id.id : null
  const ray = viewer.camera.getPickRay(pos)
  const cart = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined
  if (!cart) return { position: null, entityId }
  const c = Cartographic.fromCartesian(cart, Ellipsoid.MARS)
  return { position: { lon: CMath.toDegrees(c.longitude), lat: CMath.toDegrees(c.latitude) }, entityId }
}

export function MarsViewer() {
  const host = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const regions = useApp((s) => s.regions)
  const activeRegionId = useApp((s) => s.activeRegionId)
  const terrain = useApp((s) => s.terrain)
  const exaggeration = useApp((s) => s.exaggeration)

  // Create the viewer once.
  useEffect(() => {
    if (!host.current) return
    const viewer = new Viewer(host.current, {
      baseLayer: new ImageryLayer(vikingProvider()),
      terrainProvider: createTerrainProvider([]),
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

    addDetailImagery(viewer)
    const { scene } = viewer
    scene.backgroundColor = Color.fromCssColorString('#0e1014')
    scene.globe.baseColor = Color.fromCssColorString('#6b3a24')
    scene.globe.showGroundAtmosphere = false
    scene.globe.enableLighting = false
    scene.globe.depthTestAgainstTerrain = true
    scene.globe.maximumScreenSpaceError = 1.5
    if (scene.skyAtmosphere) {
      // Thin, dusty limb instead of Earth's blue halo.
      scene.skyAtmosphere.hueShift = -0.62
      scene.skyAtmosphere.saturationShift = -0.35
      scene.skyAtmosphere.brightnessShift = -0.25
    }
    scene.fog.enabled = false
    scene.verticalExaggeration = useApp.getState().exaggeration
    scene.screenSpaceCameraController.minimumZoomDistance = 800
    scene.screenSpaceCameraController.maximumZoomDistance = 30_000_000

    const handler = new ScreenSpaceEventHandler(scene.canvas)
    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      emitClick(pointerEvent(viewer, e.position))
    }, ScreenSpaceEventType.LEFT_CLICK)

    let frame = 0
    handler.setInputAction((e: ScreenSpaceEventHandler.MotionEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (!viewer.isDestroyed()) emitMove(pointerEvent(viewer, e.endPosition))
      })
    }, ScreenSpaceEventType.MOUSE_MOVE)

    flyHome(viewer, 0)
    viewerRef.current = viewer
    setViewer(viewer)

    return () => {
      cancelAnimationFrame(frame)
      handler.destroy()
      setViewer(null)
      viewerRef.current = null
      viewer.destroy()
    }
  }, [])

  // Load the region list once.
  useEffect(() => {
    api.regions().then(useApp.getState().setRegions, (e) => console.error('regions', e))
  }, [])

  // Clicking a region outline opens it.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(e.position) as { id?: Entity } | undefined
      const id = picked?.id?.id
      if (typeof id === 'string' && id.startsWith(REGION_ENTITY_PREFIX) && !useApp.getState().activeRegionId) {
        useApp.getState().setActiveRegion(id.slice(REGION_ENTITY_PREFIX.length))
      }
    }, ScreenSpaceEventType.LEFT_CLICK)
    return () => handler.destroy()
  }, [])

  const sharedViewer = useViewer()
  useRegionOutlines(sharedViewer, regions, activeRegionId)

  // Fetch terrain for the active region and fly there.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const region = regions.find((r) => r.id === activeRegionId)
    if (!region) {
      if (regions.length) flyHome(viewer)
      return
    }
    flyToRegion(viewer, region)
    if (!useApp.getState().terrain[region.id]) {
      api.terrain(region.id).then(useApp.getState().putTerrain, (e) => console.error('terrain', e))
    }
  }, [activeRegionId, regions])

  // Rebuild the terrain provider whenever a new grid arrives.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const grids = Object.values(terrain).flatMap((grid) => {
      const region = regions.find((r) => r.id === grid.regionId)
      return region ? [{ grid, region }] : []
    })
    viewer.terrainProvider = createTerrainProvider(grids)
    viewer.scene.requestRender()
  }, [terrain, regions])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.scene.verticalExaggeration = exaggeration
    viewer.scene.requestRender()
  }, [exaggeration])

  return <div ref={host} className="mars-viewer" aria-label="3D-карта Марса" role="application" />
}

