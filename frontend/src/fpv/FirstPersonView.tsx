import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Ellipsoid,
  HorizontalOrigin,
  LabelStyle,
  Math as CMath,
  VerticalOrigin,
  type Entity,
} from 'cesium'
import { Eye, Pause, Play, Rewind, Video, X } from 'lucide-react'
import type { RouteCell, TravelMode } from '../api/types'
import { useViewer } from '../map/viewerRef'
import { useApp, useProfile } from '../store/useApp'
import { Button, IconButton, Segmented } from '../ui/primitives'
import { fmt } from '../ui/format'
import { angleDelta, at, bearing, buildPath } from './path'
import './fpv.css'

/**
 * Drive the computed route in first person on the real 3D globe.
 *
 * Kept light on purpose: the path is resampled once, the camera moves with a
 * single setView per frame, and React re-renders the readouts only ~8 times a
 * second. The compass and progress bar move through refs, not state.
 */

type CameraMode = 'chase' | 'eye'

const MARS = Ellipsoid.MARS
const ROUTE_SECONDS = 70 // whole route at ×1
const SPEEDS = [0.5, 1, 2, 4, 8]
const UI_HZ = 8

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Offset a point by `d` metres along `headingDeg` on the Mars sphere. */
function offset(lon: number, lat: number, headingDeg: number, d: number) {
  const R = 3_389_500
  const h = CMath.toRadians(headingDeg)
  const dLat = (d * Math.cos(h)) / R
  const dLon = (d * Math.sin(h)) / (R * Math.max(0.05, Math.cos(CMath.toRadians(lat))))
  return { lon: lon + CMath.toDegrees(dLon), lat: lat + CMath.toDegrees(dLat) }
}

const dustWord = (v: number) => (v < 0.3 ? 'low' : v < 0.7 ? 'moderate' : 'heavy')
const riskWord = { LOW: 'Low', MODERATE: 'Moderate', HIGH: 'High' } as const

/** Why the path bends or slows here, in plain words, from the cells just ahead. */
function hint(cells: RouteCell[], i: number, maxSlope: number, maxDust: number | null): string | null {
  const ahead = cells.slice(i + 1, i + 5)
  if (!ahead.length) return null
  const steep = ahead.find((c) => (c.slopeWithMarginDeg ?? 0) > 0.7 * maxSlope)
  if (steep) return 'Steep ground ahead: the route keeps to the gentler side'
  const dusty = ahead.find((c) => (c.dustIndex ?? 0) > (maxDust ?? 0.7) * 0.85)
  if (dusty) return 'Heavy dust ahead: loose footing, slower going'
  const cold = ahead.find((c) => (c.surfaceTempC ?? 0) < -75)
  if (cold) return 'Cold ground ahead at this departure time'
  const a = cells[i]
  const b = cells[Math.min(cells.length - 1, i + 1)]
  const c = cells[Math.min(cells.length - 1, i + 2)]
  if (a && b && c && Math.abs(angleDelta(bearing(a, b), bearing(b, c))) > 25) {
    return 'The path bends here to avoid rough or rising ground'
  }
  return null
}

export function FirstPersonView() {
  const on = useApp((s) => s.fpv)
  const plan = useApp((s) => s.plan)
  if (!on || !plan?.route || plan.route.cells.length < 2) return null
  return <Drive cells={plan.route.cells} mode={plan.mode} />
}

function Drive({ cells, mode: travelMode }: { cells: RouteCell[]; mode: TravelMode }) {
  const viewer = useViewer()
  const setFpv = useApp((s) => s.setFpv)
  const exaggeration = useApp((s) => s.exaggeration)
  const profile = useProfile()
  const path = useMemo(() => buildPath(cells), [cells])
  const total = path[path.length - 1].s

  // Driving state lives in refs; the animation loop reads and writes it every frame.
  const sRef = useRef(0)
  const playingRef = useRef(!reducedMotion())
  const speedRef = useRef(1)
  const camRef = useRef<CameraMode>('chase')
  const look = useRef({ yaw: 0, pitch: 0 })
  const headingRef = useRef<number | null>(null)
  const tapeRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const coneRef = useRef<SVGGElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)

  // Readouts re-render at UI_HZ.
  const [ui, setUi] = useState(() => ({ s: 0, playing: !reducedMotion(), speed: 1, cam: 'chase' as CameraMode }))

  // Minimap projection, fitted once to the route.
  const mini = useMemo(() => {
    const W = 232
    const H = 150
    const lons = cells.map((c) => c.lon)
    const lats = cells.map((c) => c.lat)
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
    const k = Math.cos(CMath.toRadians(midLat))
    const w = (Math.max(...lons) - Math.min(...lons)) * k || 1
    const h = Math.max(...lats) - Math.min(...lats) || 1
    const scale = Math.min((W - 24) / w, (H - 24) / h)
    const ox = (W - w * scale) / 2
    const oy = (H - h * scale) / 2
    const minLon = Math.min(...lons)
    const maxLat = Math.max(...lats)
    const project = (lon: number, lat: number) => [ox + (lon - minLon) * k * scale, oy + (maxLat - lat) * scale] as const
    const d = cells.map((c, i) => `${i ? 'L' : 'M'}${project(c.lon, c.lat).map((v) => v.toFixed(1)).join(' ')}`).join(' ')
    return { W, H, project, d }
  }, [cells])

  // Enter: remember the camera, take over input, add the goal beacon; restore everything on exit.
  useEffect(() => {
    if (!viewer) return
    const { scene, camera } = viewer
    const saved = {
      position: camera.position.clone(),
      direction: camera.direction.clone(),
      up: camera.up.clone(),
      requestRenderMode: scene.requestRenderMode,
      inputs: scene.screenSpaceCameraController.enableInputs,
      background: scene.backgroundColor.clone(),
      fog: { enabled: scene.fog.enabled, density: scene.fog.density, sse: scene.fog.screenSpaceErrorFactor },
      sse: scene.globe.maximumScreenSpaceError,
      groundAtmosphere: scene.globe.showGroundAtmosphere,
    }
    scene.requestRenderMode = false
    scene.screenSpaceCameraController.enableInputs = false
    // Martian daytime sky: butterscotch near the horizon, with haze that softens distant ground.
    scene.backgroundColor = Color.fromCssColorString('#b98b67')
    scene.fog.enabled = true
    scene.fog.density = 1.2e-4
    scene.fog.screenSpaceErrorFactor = 4
    scene.globe.showGroundAtmosphere = true
    scene.globe.maximumScreenSpaceError = 2.2
    document.body.classList.add('fpv-on')

    const goal = cells[cells.length - 1]
    const accent = Color.fromCssColorString('#8db8d9')
    const ink = Color.fromCssColorString('#14161a')
    const x = useApp.getState().exaggeration
    const goalH = (goal.elevationM ?? 0) * x
    const beaconLen = 18_000 + 3_000 * x
    const entities: Entity[] = [
      viewer.entities.add({
        id: 'fpv:beacon',
        position: Cartesian3.fromDegrees(goal.lon, goal.lat, goalH + beaconLen / 2, MARS),
        cylinder: {
          length: beaconLen,
          topRadius: 900,
          bottomRadius: 2_600,
          material: accent.withAlpha(0.55),
          outline: false,
        },
      }),
      viewer.entities.add({
        id: 'fpv:ring',
        position: Cartesian3.fromDegrees(goal.lon, goal.lat, goalH + 200, MARS),
        ellipse: {
          semiMajorAxis: 14_000,
          semiMinorAxis: 14_000,
          height: goalH + 200,
          material: accent.withAlpha(0.18),
          outline: true,
          outlineColor: accent,
          outlineWidth: 2,
        },
      }),
      viewer.entities.add({
        id: 'fpv:goal',
        position: Cartesian3.fromDegrees(goal.lon, goal.lat, goalH + beaconLen + 2_000, MARS),
        label: {
          text: 'Goal',
          font: '600 14px "Geologica", system-ui, sans-serif',
          fillColor: Color.WHITE,
          outlineColor: ink,
          outlineWidth: 4,
          style: LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: HorizontalOrigin.LEFT,
          verticalOrigin: VerticalOrigin.CENTER,
          pixelOffset: new Cartesian2(10, 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
      viewer.entities.add({
        id: 'fpv:vehicle',
        position: Cartesian3.fromDegrees(cells[0].lon, cells[0].lat, 0, MARS),
        point: {
          pixelSize: 14,
          color: Color.WHITE,
          outlineColor: accent,
          outlineWidth: 4,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    ]
    document.querySelector<HTMLButtonElement>('.fpv__play')?.focus()

    return () => {
      document.body.classList.remove('fpv-on')
      if (viewer.isDestroyed()) return
      entities.forEach((e) => viewer.entities.remove(e))
      scene.screenSpaceCameraController.enableInputs = saved.inputs
      scene.backgroundColor = saved.background
      scene.fog.enabled = saved.fog.enabled
      scene.fog.density = saved.fog.density
      scene.fog.screenSpaceErrorFactor = saved.fog.sse
      scene.globe.maximumScreenSpaceError = saved.sse
      scene.globe.showGroundAtmosphere = saved.groundAtmosphere
      camera.setView({ destination: saved.position, orientation: { direction: saved.direction, up: saved.up } })
      scene.requestRenderMode = saved.requestRenderMode
      scene.requestRender()
    }
  }, [viewer, cells])

  // The drive loop.
  useEffect(() => {
    if (!viewer) return
    const { scene, camera } = viewer
    const vehicle = viewer.entities.getById('fpv:vehicle')
    const carto = new Cartographic()
    let raf = 0
    let last = performance.now()
    let lastUi = 0

    const surface = (lon: number, lat: number, molaH: number) => {
      Cartographic.fromDegrees(lon, lat, 0, carto)
      const rendered = scene.globe.getHeight(carto)
      const fromData = molaH * exaggeration
      return rendered === undefined ? fromData : Math.max(rendered, fromData)
    }

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (playingRef.current) {
        sRef.current += (total / ROUTE_SECONDS) * speedRef.current * dt
        if (sRef.current >= total) {
          sRef.current = total
          playingRef.current = false
        }
      }
      const s = sRef.current
      const p = at(path, s)
      const q = at(path, Math.min(total, s + Math.max(60_000, total * 0.03)))
      const target = s >= total - 1 && headingRef.current !== null ? headingRef.current : bearing(p, q)
      const prev = headingRef.current ?? target
      const heading = (prev + angleDelta(prev, target) * Math.min(1, dt * 2.5) + 360) % 360
      headingRef.current = heading
      const view = (heading + look.current.yaw + 360) % 360

      const ground = surface(p.lon, p.lat, p.h)
      if (camRef.current === 'chase') {
        const back = 22_000
        const c = offset(p.lon, p.lat, view, -back)
        const h = Math.max(ground, surface(c.lon, c.lat, p.h)) + 7_000 + 1_500 * exaggeration
        camera.setView({
          destination: Cartesian3.fromDegrees(c.lon, c.lat, h, MARS),
          orientation: { heading: CMath.toRadians(view), pitch: CMath.toRadians(-17 + look.current.pitch), roll: 0 },
        })
      } else {
        camera.setView({
          destination: Cartesian3.fromDegrees(p.lon, p.lat, ground + 900 + 250 * exaggeration, MARS),
          orientation: { heading: CMath.toRadians(view), pitch: CMath.toRadians(-4 + look.current.pitch), roll: 0 },
        })
      }
      if (vehicle) {
        vehicle.position = Cartesian3.fromDegrees(p.lon, p.lat, ground + 400, MARS) as never
        vehicle.show = camRef.current === 'chase'
      }

      // Per-frame HUD bits through refs.
      if (tapeRef.current) tapeRef.current.style.transform = `translateX(${-view * 4}px)`
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${total ? s / total : 0})`
      const [mx, my] = mini.project(p.lon, p.lat)
      dotRef.current?.setAttribute('cx', mx.toFixed(1))
      dotRef.current?.setAttribute('cy', my.toFixed(1))
      coneRef.current?.setAttribute('transform', `translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${view.toFixed(1)})`)

      if (now - lastUi > 1000 / UI_HZ) {
        lastUi = now
        setUi({ s, playing: playingRef.current, speed: speedRef.current, cam: camRef.current })
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [viewer, path, total, exaggeration, mini])

  // Controls.
  const exit = () => setFpv(false)
  const togglePlay = () => {
    if (sRef.current >= total - 1) sRef.current = 0
    playingRef.current = !playingRef.current
    setUi((u) => ({ ...u, playing: playingRef.current }))
  }
  const restart = () => {
    sRef.current = 0
    headingRef.current = null
    look.current = { yaw: 0, pitch: 0 }
  }
  const seekCells = (n: number) => {
    const i = Math.max(0, Math.min(cells.length - 1, at(path, sRef.current).cell + n))
    sRef.current = cells[i].distanceFromStartM
  }
  const setSpeed = (v: number) => {
    speedRef.current = v
    setUi((u) => ({ ...u, speed: v }))
  }
  const setCam = (c: CameraMode) => {
    camRef.current = c
    look.current = { yaw: 0, pitch: 0 }
    setUi((u) => ({ ...u, cam: c }))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const i = SPEEDS.indexOf(speedRef.current)
      if (e.key === 'Escape') exit()
      else if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowLeft') seekCells(-1)
      else if (e.key === 'ArrowRight') seekCells(1)
      else if (e.key === 'ArrowUp') setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, i + 1)])
      else if (e.key === 'ArrowDown') setSpeed(SPEEDS[Math.max(0, i - 1)])
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Drag on the view to look around; it springs back slowly when released.
  const drag = useRef<{ x: number; y: number } | null>(null)
  const onDown = (e: ReactPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    look.current.yaw = Math.max(-100, Math.min(100, look.current.yaw + (e.clientX - drag.current.x) * 0.25))
    look.current.pitch = Math.max(-30, Math.min(30, look.current.pitch - (e.clientY - drag.current.y) * 0.15))
    drag.current = { x: e.clientX, y: e.clientY }
  }
  const onUp = () => {
    drag.current = null
  }

  // Readouts for the current cell.
  const here = at(path, ui.s)
  const i = here.cell
  const cell = cells[i]
  const ahead = cells[Math.min(cells.length - 1, i + 2)]
  const run = (ahead.distanceFromStartM - cell.distanceFromStartM) || 1
  const grade =
    typeof ahead.elevationM === 'number' && typeof cell.elevationM === 'number' && ahead !== cell
      ? CMath.toDegrees(Math.atan((ahead.elevationM - cell.elevationM) / run))
      : null
  const maxSlope = profile?.maxSlopeDeg ?? 15
  const why = hint(cells, i, maxSlope, profile?.maxDustIndex ?? null)
  const danger = cells
    .slice(i, i + 5)
    .some((c) => (c.slopeWithMarginDeg ?? 0) > 0.7 * maxSlope || (profile?.maxDustIndex != null && (c.dustIndex ?? 0) > profile.maxDustIndex * 0.9))
  const km = (m: number) => `${fmt.km(m)} ${fmt.kmUnit(m)}`
  const ticks = useMemo(() => {
    const out: { deg: number; label: string | null; major: boolean }[] = []
    const names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }
    for (let d = -90; d <= 450; d += 5) {
      const n = ((d % 360) + 360) % 360
      out.push({ deg: d, label: names[n] ?? (n % 30 === 0 ? String(n) : null), major: n % 45 === 0 })
    }
    return out
  }, [])

  return (
    <section className="fpv" aria-label="First-person drive">
      <div
        className="fpv__look"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-hidden
      />

      <header className="fpv__top">
        <div className="fpv__title">
          <span className="fpv__name">First-person drive</span>
          <span className={`fpv__state ${ui.playing ? 'is-on' : ''}`}>{ui.playing ? 'Moving' : 'Paused'}</span>
        </div>
        <div className="fpv__compass" aria-hidden>
          <div className="fpv__tape" ref={tapeRef}>
            {ticks.map((t) => (
              <span key={t.deg} className={`fpv__tick ${t.major ? 'is-major' : ''}`} style={{ left: `${(t.deg + 90) * 4}px` }}>
                {t.label && <em>{t.label}</em>}
              </span>
            ))}
          </div>
          <span className="fpv__needle" />
        </div>
        <IconButton label="Exit first-person view (Esc)" className="fpv__exit" onClick={exit}>
          <X />
        </IconButton>
      </header>

      {danger && (
        <div className="fpv__warn" role="status">
          {why ?? 'Hazard ahead: the next cells are close to this profile’s limits'}
        </div>
      )}

      <aside className="fpv__side">
        <svg className="fpv__mini" viewBox={`0 0 ${mini.W} ${mini.H}`} role="img" aria-label="Route overview">
          <path d={mini.d} className="fpv__mini-route" />
          <g ref={coneRef}>
            <path d="M0 0 L-22 -44 A50 50 0 0 1 22 -44 Z" className="fpv__mini-cone" />
          </g>
          <circle ref={dotRef} r="4.5" className="fpv__mini-dot" />
          {(() => {
            const [gx, gy] = mini.project(cells[cells.length - 1].lon, cells[cells.length - 1].lat)
            const [sx, sy] = mini.project(cells[0].lon, cells[0].lat)
            return (
              <>
                <circle cx={sx} cy={sy} r="3.5" className="fpv__mini-start" />
                <circle cx={gx} cy={gy} r="4" className="fpv__mini-goal" />
              </>
            )
          })()}
        </svg>

        <dl className="fpv__rows">
          <Row label="Cell" value={`${cell.cellId} (${i + 1} of ${cells.length})`} />
          <Row label="Elevation" value={cell.elevationM == null ? '—' : `${fmt.height(cell.elevationM)} m`} />
          <Row
            label="Slope"
            value={cell.slopeMeanDeg == null ? '—' : `${fmt.deg(cell.slopeMeanDeg)}°, up to ${fmt.deg(cell.slopeWithMarginDeg ?? cell.slopeMeanDeg)}°`}
          />
          <Row label="Grade ahead" value={grade == null ? '—' : `${grade > 0 ? '+' : grade < 0 ? '−' : ''}${fmt.deg(Math.abs(grade))}°`} />
          <Row label="Dust" value={cell.dustIndex == null ? '—' : `${Math.round(cell.dustIndex * 100)}% ${dustWord(cell.dustIndex)}`} />
          <Row label="Surface" value={cell.surfaceTempC == null ? '—' : `${Math.round(cell.surfaceTempC)} °C`} />
          <Row
            label="Risk"
            value={
              <span className={`fpv__risk fpv__risk--${cell.riskLevel.toLowerCase()}`}>
                <i aria-hidden />
                {riskWord[cell.riskLevel]}
              </span>
            }
          />
          <Row label="Profile" value={travelMode === 'rover' ? 'Rover' : 'Astronaut'} />
        </dl>
        {why && !danger && <p className="fpv__why">{why}</p>}
        <p className="fpv__keys">Space pause · ← → previous / next cell · ↑ ↓ speed · drag to look around · Esc exit</p>
      </aside>

      <footer className="fpv__bottom">
        <div className="fpv__progress">
          <div className="fpv__figures">
            <span>
              Travelled <strong>{km(ui.s)}</strong>
            </span>
            <span>
              Remaining <strong>{km(total - ui.s)}</strong>
            </span>
          </div>
          <div className="fpv__bar">
            <div className="fpv__fill" ref={fillRef} />
          </div>
        </div>
        <div className="fpv__controls">
          <IconButton label="Back to start" onClick={restart}>
            <Rewind />
          </IconButton>
          <Button
            className="fpv__play"
            variant="primary"
            icon={ui.playing ? <Pause size={16} strokeWidth={1.5} aria-hidden /> : <Play size={16} strokeWidth={1.5} aria-hidden />}
            onClick={togglePlay}
          >
            {ui.playing ? 'Pause' : 'Play'}
          </Button>
          <Segmented
            label="Speed"
            value={String(ui.speed)}
            options={SPEEDS.map((v) => ({ value: String(v), label: `×${v}` }))}
            onChange={(v) => setSpeed(Number(v))}
          />
          <Segmented<CameraMode>
            label="Camera"
            value={ui.cam}
            options={[
              { value: 'chase', label: 'Chase', icon: <Video size={16} strokeWidth={1.5} aria-hidden /> },
              { value: 'eye', label: 'Eye level', icon: <Eye size={16} strokeWidth={1.5} aria-hidden /> },
            ]}
            onChange={setCam}
          />
        </div>
      </footer>
    </section>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="fpv__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
