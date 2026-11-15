import { useEffect, useState, type ReactNode } from 'react'
/** The first-person view is not built yet; flip this on when src/fpv/ is done. */
const FPV_READY = true

import { ArrowUpDown, ChevronRight, Crosshair, Footprints, Navigation, RotateCcw, Truck, X } from 'lucide-react'
import type { LonLat, RiskLevel, RoutePlan, TravelMode } from '../api/types'
import { formatCoord } from '../map/geo'
import { useApp, useProfile } from '../store/useApp'
import { Button, IconButton, Notice, Segmented, Stat } from '../ui/primitives'
import { fmt } from '../ui/format'
import { ElevationProfile } from './ElevationProfile'
import { RouteCompare } from './RouteCompare'
import {
  POINT_LABEL,
  RISK_LABEL,
  dustWord,
  formatDust,
  formatHour,
  formatTemp,
  noRouteMessage,
  num,
  profileHint,
  solWord,
} from './routeUtils'
import { useRouteRequest } from './useRouteRequest'
import './route.css'

const MODES: { value: TravelMode; label: string; icon: ReactNode }[] = [
  { value: 'rover', label: 'Rover', icon: <Truck size={16} strokeWidth={1.5} aria-hidden /> },
  { value: 'astronaut', label: 'Astronaut', icon: <Footprints size={16} strokeWidth={1.5} aria-hidden /> },
]

const DASH = '—'

function PointRow({ which, point }: { which: 'from' | 'to'; point: LonLat | null }) {
  const picking = useApp((s) => s.pick === which)
  const setPick = useApp((s) => s.setPick)
  const setPoint = useApp((s) => s.setPoint)
  const label = POINT_LABEL[which]

  return (
    <div className="route-point" data-picking={picking || undefined} data-empty={!point || undefined}>
      <span className="route-point__badge" aria-hidden>
        {label}
      </span>
      <span className="route-point__text" aria-live={picking ? 'polite' : undefined}>
        <span className="sr-only">Point {label}: </span>
        {picking ? 'Click on the map' : point ? formatCoord(point) : 'Not set'}
      </span>
      <IconButton
        label={picking ? 'Cancel picking on the map' : `Pick point ${label} on the map`}
        aria-pressed={picking}
        className="route-point__pick"
        onClick={() => setPick(picking ? null : which)}
      >
        <Crosshair size={16} strokeWidth={1.5} aria-hidden />
      </IconButton>
      <IconButton
        label={`Remove point ${label}`}
        onClick={() => setPoint(which, null)}
        disabled={!point}
        className="route-point__clear"
      >
        <X size={16} strokeWidth={1.5} aria-hidden />
      </IconButton>
    </div>
  )
}

function RiskValue({ level }: { level: RiskLevel | null }) {
  if (!level || !RISK_LABEL[level]) return <>{DASH}</>
  return (
    <span className="route-risk" data-level={level}>
      <span className="route-risk__dot" aria-hidden />
      {RISK_LABEL[level]}
    </span>
  )
}

function RouteStats({ plan, stale }: { plan: RoutePlan; stale: boolean }) {
  const m = plan.metrics
  if (!m) return null
  const length = num(m.distanceMeters) ?? 0
  const ascent = num(m.ascentMeters)
  const slope = num(m.maxSlopeWithMarginDeg)
  const sols = num(m.travelSols)
  const dust = num(m.maxDustIndex)
  const tMin = num(m.minSurfaceTempC)
  const tMax = num(m.maxSurfaceTempC)
  const temps =
    tMin == null || tMax == null
      ? DASH
      : Math.round(tMin) === Math.round(tMax)
        ? formatTemp(tMin)
        : `${formatTemp(tMin)}…${formatTemp(tMax)}`
  return (
    <div className="route-stats" data-stale={stale || undefined} aria-busy={stale}>
      <div className="route-stats__main">
        <Stat label="Route length" value={fmt.km(length)} unit={fmt.kmUnit(length)} />
      </div>
      <div className="route-stats__row">
        <Stat label="Ascent" value={ascent == null ? DASH : fmt.int(ascent)} unit={ascent == null ? undefined : 'm'} />
        <Stat label="Max slope" value={slope == null ? DASH : fmt.deg(slope)} unit={slope == null ? undefined : '°'} />
        <Stat
          label="Travel time"
          value={sols == null ? DASH : sols.toLocaleString('en-US', { maximumFractionDigits: 1 })}
          unit={sols == null ? undefined : solWord(sols)}
        />
      </div>
      <div className="route-stats__row route-stats__row--quiet">
        <Stat
          label="Max dust"
          value={dust == null ? DASH : formatDust(dust)}
          unit={dust == null ? undefined : dustWord(dust)}
        />
        <Stat label="Surface" value={temps} unit={temps === DASH ? undefined : '°C'} />
        <Stat label="Risk" value={<RiskValue level={m.riskLevel ?? null} />} />
      </div>
    </div>
  )
}

function ModelNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null
  return (
    <details className="route-notes">
      <summary className="route-notes__summary">
        <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="route-notes__chevron" />
        Model notes
        <span className="route-notes__count">{notes.length}</span>
      </summary>
      <ul className="route-notes__list">
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </details>
  )
}

function OfflineNotice() {
  return (
    <section className="route-panel" aria-labelledby="route-title">
      <h2 id="route-title" className="route-panel__title">
        Route
      </h2>
      <Notice>
        Route server is offline. The map, NASA Trek layers, place search and the sun timeline still work; routing
        returns as soon as the server answers.
      </Notice>
    </section>
  )
}

export function RoutePanel() {
  const backend = useApp((s) => s.backend)
  const from = useApp((s) => s.from)
  const to = useApp((s) => s.to)
  const mode = useApp((s) => s.mode)
  const hour = useApp((s) => s.hour)
  const pick = useApp((s) => s.pick)
  const plan = useApp((s) => s.plan)
  const status = useApp((s) => s.routeStatus)
  const error = useApp((s) => s.routeError)
  const profile = useProfile()
  const { setMode, setPick, setPoint, clearRoute, setFpv } = useApp.getState()
  const [retry, setRetry] = useState(0)

  const retryable = useRouteRequest(retry)

  // Escape cancels picking on the map.
  useEffect(() => {
    if (!pick) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPick(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pick, setPick])

  if (backend === 'offline') return <OfflineNotice />

  const swap = () => {
    setPoint('from', to)
    setPoint('to', from)
  }

  const cells = plan?.status === 'OK' ? (plan.route?.cells ?? []) : []
  const warnings = Array.isArray(plan?.warnings) ? plan.warnings : []
  const loading = status === 'loading'

  return (
    <section className="route-panel" aria-labelledby="route-title">
      <div className="route-panel__head">
        <h2 id="route-title" className="route-panel__title">
          Route
        </h2>
        {(from || to) && (
          <IconButton label="Reset route" onClick={clearRoute} className="route-panel__reset">
            <RotateCcw size={16} strokeWidth={1.5} aria-hidden />
          </IconButton>
        )}
      </div>

      <div className="route-points">
        <div className="route-points__rows">
          <PointRow which="from" point={from} />
          <PointRow which="to" point={to} />
        </div>
        <IconButton label="Swap points" onClick={swap} disabled={!from && !to} className="route-points__swap">
          <ArrowUpDown size={16} strokeWidth={1.5} aria-hidden />
        </IconButton>
      </div>

      <div className="route-mode">
        <Segmented label="Travel mode" value={mode} options={MODES} onChange={setMode} />
        {profile && <p className="route-mode__hint">{profileHint(profile)}</p>}
        <p className="route-mode__hint">
          Departure {formatHour(hour)} local time — change it on the timeline below
        </p>
      </div>

      {!from || !to ? (
        <p className="route-empty">
          {pick ? 'Esc to cancel picking' : 'Set points A and B with the crosshair button or from a place card'}
        </p>
      ) : backend !== 'online' ? (
        <p className="route-status" role="status">
          Connecting to the route server…
        </p>
      ) : (
        <>
          {loading && !plan && (
            <p className="route-status" role="status">
              Planning route…
            </p>
          )}
          {status === 'error' && error && (
            <div className="route-error">
              <Notice tone="error">{error}</Notice>
              {retryable && (
                <Button
                  variant="ghost"
                  icon={<RotateCcw size={16} strokeWidth={1.5} aria-hidden />}
                  onClick={() => setRetry((n) => n + 1)}
                >
                  Retry
                </Button>
              )}
            </div>
          )}
          {plan && status !== 'error' && plan.status === 'NO_ROUTE' && (
            <div className="route-error" data-stale={loading || undefined}>
              <Notice>{noRouteMessage(plan, profile)}</Notice>
            </div>
          )}
          {plan && status !== 'error' && plan.status === 'OK' && (
            <>
              <RouteStats plan={plan} stale={loading} />
              {FPV_READY && cells.length > 1 && (
                <Button
                  variant="secondary"
                  className="route-fpv"
                  icon={<Navigation size={16} strokeWidth={1.5} aria-hidden />}
                  onClick={() => setFpv(true)}
                  disabled={loading}
                >
                  Drive in first person
                </Button>
              )}
              {cells.length > 1 && <ElevationProfile cells={cells} />}
              {status === 'ready' && (
                <RouteCompare req={{ start: from, goal: to, mode, departureHour: plan.departureHour ?? hour }} />
              )}
            </>
          )}
          {plan && status !== 'error' && <ModelNotes notes={warnings} />}
        </>
      )}
    </section>
  )
}
