import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Cartesian3, Cartographic, Color, Ellipsoid, Math as CMath } from 'cesium'
import { Footprints, Truck, X } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { CellInfo, LonLat, TravelMode } from '../api/types'
import { formatCoord } from '../map/geo'
import { useViewer } from '../map/viewerRef'
import { useApp } from '../store/useApp'
import { IconButton, Segmented, Slider } from '../ui/primitives'
import { fmt } from '../ui/format'
import './fpv.css'

/**
 * Free first-person walk from "my location". WASD / arrows move, dragging
 * looks around. Before each step the backend's cost model says whether the
 * current mode may enter the ground ahead (slope, dust, cold); closed ground
 * stops you with the reason, exactly as the route planner would.
 */

const MARS = Ellipsoid.MARS
const R = 3_389_500
const LOOKAHEAD_M = 12_000
const CHECK_MS = 350

function step(p: LonLat, headingDeg: number, d: number): LonLat {
  const h = CMath.toRadians(headingDeg)
  const lat = p.lat + CMath.toDegrees((d * Math.cos(h)) / R)
  const lon = p.lon + CMath.toDegrees((d * Math.sin(h)) / (R * Math.max(0.05, Math.cos(CMath.toRadians(p.lat)))))
  return { lon: ((lon + 540) % 360) - 180, lat: Math.max(-89, Math.min(89, lat)) }
}

const reason: Record<string, string> = {
  DUST: 'heavy dust',
  SLOPE: 'too steep',
  COLD: 'too cold at this hour',
  NO_DATA: 'no surface data',
}

export function WalkView() {
  const on = useApp((s) => s.walk)
  const me = useApp((s) => s.me)
  if (!on || !me) return null
  return <Walk start={me} />
}

function Walk({ start }: { start: LonLat }) {
  const viewer = useViewer()
  const setWalk = useApp((s) => s.setWalk)
  const setMe = useApp((s) => s.setMe)
  const exaggeration = useApp((s) => s.exaggeration)
  const hour = useApp((s) => s.hour)
  const [mode, setMode] = useState<TravelMode>(useApp.getState().mode)
  const [speed, setSpeed] = useState(600) // metres per second of simulated travel

  const pos = useRef<LonLat>(start)
  const heading = useRef(0)
  const pitch = useRef(-6)
  const keys = useRef(new Set<string>())
  const blocked = useRef<string | null>(null)
  const tapeRef = useRef<HTMLDivElement>(null)
  const [here, setHere] = useState<CellInfo | null>(null)
  const [ahead, setAhead] = useState<{ ok: boolean; text: string | null; outside: boolean }>({ ok: true, text: null, outside: false })
  const [readout, setReadout] = useState({ pos: start, heading: 0, travelled: 0 })
  const modeRef = useRef(mode)
  modeRef.current = mode

  // Take over the camera; give it back, and remember where you ended up, on exit.
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
      fog: scene.fog.enabled,
      density: scene.fog.density,
      atmosphere: scene.globe.showGroundAtmosphere,
    }
    scene.requestRenderMode = false
    scene.screenSpaceCameraController.enableInputs = false
    scene.backgroundColor = Color.fromCssColorString('#b98b67')
    scene.fog.enabled = true
    scene.fog.density = 1.2e-4
    scene.globe.showGroundAtmosphere = true
    document.body.classList.add('fpv-on')
    return () => {
      document.body.classList.remove('fpv-on')
      setMe(pos.current)
      if (viewer.isDestroyed()) return
      scene.screenSpaceCameraController.enableInputs = saved.inputs
      scene.backgroundColor = saved.background
      scene.fog.enabled = saved.fog
      scene.fog.density = saved.density
      scene.globe.showGroundAtmosphere = saved.atmosphere
      camera.setView({ destination: saved.position, orientation: { direction: saved.direction, up: saved.up } })
      scene.requestRenderMode = saved.requestRenderMode
      scene.requestRender()
    }
  }, [viewer, setMe])

  // Keyboard.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setWalk(false)
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'q', 'e'].includes(k)) {
        keys.current.add(k)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [setWalk])

  // Ask the backend about the ground under you and just ahead, a few times a second.
  useEffect(() => {
    let alive = true
    const check = async () => {
      const p = pos.current
      const front = step(p, heading.current, LOOKAHEAD_M)
      try {
        const [cur, next] = await Promise.all([api.cellAt(p, hour), api.cellAt(front, hour)])
        if (!alive) return
        setHere(cur)
        const prof = next.profiles[modeRef.current]
        blocked.current = prof.passable ? null : prof.blockedBy
        setAhead({
          ok: prof.passable,
          text: prof.passable ? null : `Closed ahead for the ${modeRef.current}: ${reason[prof.blockedBy ?? 'NO_DATA']}`,
          outside: false,
        })
      } catch (e) {
        if (!alive) return
        const outside = e instanceof ApiError && e.code === 'POINT_OUTSIDE_GRID'
        blocked.current = null
        setAhead({ ok: true, text: outside ? 'Outside the analysed area: free walking, no checks' : null, outside })
      }
    }
    void check()
    const t = window.setInterval(check, CHECK_MS)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [hour])

  // Movement and camera.
  useEffect(() => {
    if (!viewer) return
    const { scene, camera } = viewer
    const carto = new Cartographic()
    let raf = 0
    let last = performance.now()
    let lastUi = 0
    let travelled = 0
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const k = keys.current
      const turn = (k.has('a') || k.has('arrowleft') ? -1 : 0) + (k.has('d') || k.has('arrowright') ? 1 : 0)
      heading.current = (heading.current + turn * 70 * dt + 360) % 360
      if (k.has('q')) pitch.current = Math.max(-40, pitch.current - 30 * dt)
      if (k.has('e')) pitch.current = Math.min(25, pitch.current + 30 * dt)
      const fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0)
      if (fwd) {
        // Forward is refused when the ground ahead is closed; backing away is always allowed.
        if (!(fwd > 0 && blocked.current)) {
          const d = fwd * speed * (k.has('shift') ? 3 : 1) * dt
          pos.current = step(pos.current, heading.current, d)
          travelled += Math.abs(d)
        }
      }
      const p = pos.current
      Cartographic.fromDegrees(p.lon, p.lat, 0, carto)
      const ground = scene.globe.getHeight(carto) ?? 0
      camera.setView({
        destination: Cartesian3.fromDegrees(p.lon, p.lat, ground + 700 + 200 * exaggeration, MARS),
        orientation: { heading: CMath.toRadians(heading.current), pitch: CMath.toRadians(pitch.current), roll: 0 },
      })
      if (tapeRef.current) tapeRef.current.style.transform = `translateX(${-heading.current * 4}px)`
      if (now - lastUi > 125) {
        lastUi = now
        setReadout({ pos: p, heading: heading.current, travelled })
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [viewer, speed, exaggeration])

  // Drag to look around.
  const drag = useRef<{ x: number; y: number } | null>(null)
  const onDown = (e: ReactPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    heading.current = (heading.current + (e.clientX - drag.current.x) * 0.25 + 360) % 360
    pitch.current = Math.max(-40, Math.min(25, pitch.current - (e.clientY - drag.current.y) * 0.15))
    drag.current = { x: e.clientX, y: e.clientY }
  }
  const onUp = () => {
    drag.current = null
  }

  const ticks = useMemo(() => {
    const names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }
    const out: { deg: number; label: string | null; major: boolean }[] = []
    for (let d = -90; d <= 450; d += 5) {
      const n = ((d % 360) + 360) % 360
      out.push({ deg: d, label: names[n] ?? (n % 30 === 0 ? String(n) : null), major: n % 45 === 0 })
    }
    return out
  }, [])

  const prof = here?.profiles[mode]
  const dust = here?.dustIndex

  return (
    <section className="fpv" aria-label="First-person walk">
      <div className="fpv__look" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-hidden />

      <header className="fpv__top">
        <div className="fpv__title">
          <span className="fpv__name">Walking on Mars</span>
          <span className="fpv__state is-on">{formatCoord(readout.pos)}</span>
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
        <IconButton label="Stop walking (Esc)" className="fpv__exit" onClick={() => setWalk(false)}>
          <X />
        </IconButton>
      </header>

      {ahead.text && (
        <div className={ahead.ok ? 'fpv__warn fpv__warn--info' : 'fpv__warn'} role="status">
          {ahead.text}
        </div>
      )}

      <aside className="fpv__side">
        <dl className="fpv__rows">
          <Row label="Cell" value={here?.cellId ?? '—'} />
          <Row label="Elevation" value={here?.elevationM == null ? '—' : `${fmt.height(here.elevationM)} m`} />
          <Row
            label="Slope"
            value={here?.slopeMeanDeg == null ? '—' : `${fmt.deg(here.slopeMeanDeg)}°, up to ${fmt.deg(here.slopeWithMarginDeg ?? here.slopeMeanDeg)}°`}
          />
          <Row label="Dust" value={dust == null ? '—' : `${Math.round(dust * 100)}% ${dust < 0.3 ? 'low' : dust < 0.7 ? 'moderate' : 'heavy'}`} />
          <Row label="Thermal inertia" value={here?.thermalInertia == null ? '—' : String(Math.round(here.thermalInertia))} />
          <Row label="Surface" value={here?.surfaceTempC == null ? '—' : `${Math.round(here.surfaceTempC)} °C`} />
          <Row
            label={mode === 'rover' ? 'Rover' : 'Astronaut'}
            value={
              prof ? (
                <span className={`fpv__risk ${prof.passable ? '' : 'fpv__risk--high'}`}>
                  <i aria-hidden />
                  {prof.passable ? 'Can go here' : `Closed: ${reason[prof.blockedBy ?? 'NO_DATA']}`}
                </span>
              ) : (
                '—'
              )
            }
          />
          <Row label="Walked" value={`${fmt.km(readout.travelled)} ${fmt.kmUnit(readout.travelled)}`} />
        </dl>
        <p className="fpv__keys">W / S or ↑ ↓ move · A / D or ← → turn · Shift faster · Q / E look down and up · drag to look around · Esc stop</p>
      </aside>

      <footer className="fpv__bottom">
        <Segmented<TravelMode>
          label="Walk as"
          value={mode}
          options={[
            { value: 'astronaut', label: 'Astronaut', icon: <Footprints size={16} strokeWidth={1.5} aria-hidden /> },
            { value: 'rover', label: 'Rover', icon: <Truck size={16} strokeWidth={1.5} aria-hidden /> },
          ]}
          onChange={setMode}
        />
        <div className="fpv__speed">
          <Slider
            label="Speed"
            value={speed}
            min={100}
            max={3000}
            step={100}
            onChange={setSpeed}
            format={(v) => `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} km/s`}
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
