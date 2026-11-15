import { useEffect, useState } from 'react'
import { Cartesian3, Color, Ellipsoid, HeightReference } from 'cesium'
import { Flag, MapPin, X } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { BlockedBy, CellInfo, LonLat, TravelMode } from '../api/types'
import { formatCoord } from '../map/geo'
import { useViewer } from '../map/viewerRef'
import { PLACE_KIND_LABEL } from '../search/goToPlace'
import { useApp } from '../store/useApp'
import { Button, IconButton, Stat } from '../ui/primitives'
import { fmt } from '../ui/format'
import './place.css'

/** Must not start with "place:" (that prefix belongs to map labels). */
const PLACE_MARKER_ID = 'card-marker'
const HOUR_DEBOUNCE_MS = 250

const samePoint = (a: LonLat | null, b: LonLat) => !!a && a.lon === b.lon && a.lat === b.lat

/** Reads a colour token so the marker matches the chrome. */
function tokenColor(name: string, fallback: string): Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return Color.fromCssColorString(v || fallback)
}

/** Accent dot on the ground under the open card. */
function MarkerOnMap({ position }: { position: LonLat }) {
  const viewer = useViewer()
  const { lon, lat } = position

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return
    const entity = viewer.entities.add({
      id: PLACE_MARKER_ID,
      position: Cartesian3.fromDegrees(lon, lat, 0, Ellipsoid.MARS),
      point: {
        pixelSize: 10,
        color: tokenColor('--c-accent', '#8db8d9'),
        outlineColor: tokenColor('--c-ground', '#15171a'),
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    viewer.scene.requestRender()
    return () => {
      if (viewer.isDestroyed()) return
      viewer.entities.remove(entity)
      viewer.scene.requestRender()
    }
  }, [viewer, lon, lat])

  return null
}

// ---------- surface data ----------

interface SurfaceState {
  data: CellInfo | null
  loading: boolean
  error: Error | null
}

/** Cell data for a point and hour. The card remounts per point, so only the hour is debounced here. */
function useSurface(position: LonLat, hour: number): SurfaceState {
  const [settledHour, setSettledHour] = useState(hour)
  const [result, setResult] = useState<{ key: string; data: CellInfo | null; error: Error | null }>({
    key: '',
    data: null,
    error: null,
  })
  const { lon, lat } = position
  const key = `${lon},${lat},${settledHour}`

  useEffect(() => {
    const t = window.setTimeout(() => setSettledHour(hour), HOUR_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [hour])

  useEffect(() => {
    const ctrl = new AbortController()
    api.cellAt({ lon, lat }, settledHour, ctrl.signal).then(
      (data) => {
        if (!ctrl.signal.aborted) setResult({ key, data, error: null })
      },
      (e: unknown) => {
        if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return
        setResult((r) => ({ key, data: r.data, error: e instanceof Error ? e : new Error('Request failed') }))
      },
    )
    return () => ctrl.abort()
  }, [lon, lat, settledHour, key])

  return { data: result.data, loading: result.key !== key || hour !== settledHour, error: result.key === key ? result.error : null }
}

// ---------- wording ----------

const dash = '—'
const dustWord = (v: number) => (v < 0.3 ? 'low' : v < 0.7 ? 'moderate' : 'heavy')
const inertiaWord = (v: number) => (v < 150 ? 'loose' : v < 350 ? 'mixed' : 'firm')

function formatHour(h: number): string {
  const total = Math.round((((h % 24) + 24) % 24) * 60) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function closedReason(by: BlockedBy | null, hour: number): string {
  switch (by) {
    case 'SLOPE':
      return 'too steep'
    case 'DUST':
      return 'heavy dust'
    case 'COLD':
      return `too cold at ${formatHour(hour)}`
    default:
      return 'no data'
  }
}

function errorText(e: Error): string {
  const code = e instanceof ApiError ? e.code : null
  if (code === 'POINT_OUTSIDE_GRID') return 'Outside the route grid: no surface analysis here yet'
  if (code === 'OFFLINE') return 'Surface analysis needs the route server'
  return e.message
}

function Status({ mode, label, cell }: { mode: TravelMode; label: string; cell: CellInfo | null }) {
  const p = cell?.profiles[mode]
  const tone = !p ? 'none' : p.passable ? 'ok' : p.blockedBy === 'NO_DATA' ? 'warn' : 'danger'
  const text = !p || !cell ? dash : p.passable ? 'Passable' : `Closed: ${closedReason(p.blockedBy, cell.hour)}`
  return (
    <div className="place__status">
      <span className="place__status-label">{label}</span>
      <span className="place__status-text">
        <span className={`place__dot place__dot--${tone}`} aria-hidden />
        {text}
      </span>
    </div>
  )
}

function Surface({ position }: { position: LonLat }) {
  const hour = useApp((s) => s.hour)
  const { data: c, loading, error } = useSurface(position, hour)

  // No numbers to show and no way to get them: say why, in one line.
  if (error && !c) {
    return (
      <p className="place__note" role="status">
        {errorText(error)}
      </p>
    )
  }

  const stale = loading || !!error || undefined
  const num = (v: number | null | undefined, f: (n: number) => string) => (v == null ? dash : f(v))

  return (
    <section className="place__surface" aria-labelledby="surface-title" aria-busy={loading}>
      <h3 id="surface-title" className="place__subtitle">
        Surface here
      </h3>
      {error && (
        <p className="place__note" role="status">
          {errorText(error)}
        </p>
      )}
      <div className="place__stats" data-stale={stale}>
        <Stat label="Elevation" value={num(c?.elevationM, fmt.height)} unit={c?.elevationM != null ? 'm' : undefined} />
        <Stat
          label="Slope"
          value={
            <>
              {num(c?.slopeMeanDeg, (v) => `${fmt.deg(v)}°`)}
              {c?.slopeWithMarginDeg != null && (
                <span className="place__muted"> up to {fmt.deg(c.slopeWithMarginDeg)}°</span>
              )}
            </>
          }
        />
        <Stat
          label="Dust"
          value={
            <>
              {num(c?.dustIndex, (v) => `${Math.round(v * 100)}%`)}
              {c?.dustIndex != null && <span className="place__muted"> {dustWord(c.dustIndex)}</span>}
            </>
          }
        />
        <Stat
          label="Thermal inertia"
          value={
            <>
              {num(c?.thermalInertia, fmt.int)}
              {c?.thermalInertia != null && <span className="place__muted"> {inertiaWord(c.thermalInertia)}</span>}
            </>
          }
        />
        <Stat
          label={`Temperature at ${formatHour(hour)}`}
          value={num(c?.surfaceTempC, fmt.height)}
          unit={c?.surfaceTempC != null ? '°C' : undefined}
        />
      </div>
      <div className="place__statuses" data-stale={stale}>
        <Status mode="rover" label="Rover" cell={c} />
        <Status mode="astronaut" label="Astronaut" cell={c} />
      </div>
    </section>
  )
}

// ---------- card ----------

export function PlaceCard() {
  const place = useApp((s) => s.selectedPlace)
  const inspected = useApp((s) => s.inspected)
  const from = useApp((s) => s.from)
  const to = useApp((s) => s.to)
  const setPoint = useApp((s) => s.setPoint)
  const selectPlace = useApp((s) => s.selectPlace)
  const inspect = useApp((s) => s.inspect)

  const position = place?.position ?? inspected
  if (!position) return null

  const isFrom = samePoint(from, position)
  const isTo = samePoint(to, position)
  const close = () => (place ? selectPlace(null) : inspect(null))

  return (
    <article className="place" aria-labelledby="place-name" key={`${position.lon},${position.lat}`}>
      <MarkerOnMap position={position} />

      <header className="place__head">
        <div className="place__title">
          <span className="place__kind">{place ? PLACE_KIND_LABEL[place.kind] : 'Inspected point'}</span>
          <h2 id="place-name" className="place__name">
            {place ? place.name : 'Surface point'}
          </h2>
        </div>
        <IconButton label="Close card" onClick={close}>
          <X size={16} strokeWidth={1.5} />
        </IconButton>
      </header>

      <p className="place__coord">{formatCoord(position)}</p>
      {place?.description && <p className="place__desc">{place.description}</p>}

      <Surface position={position} />

      <div className="place__actions">
        <Button
          icon={<Flag size={16} strokeWidth={1.5} />}
          aria-pressed={isFrom}
          className="place__action"
          onClick={() => setPoint('from', position)}
        >
          Route from here
        </Button>
        <Button
          icon={<MapPin size={16} strokeWidth={1.5} />}
          aria-pressed={isTo}
          className="place__action"
          onClick={() => setPoint('to', position)}
        >
          Route to here
        </Button>
      </div>
    </article>
  )
}
