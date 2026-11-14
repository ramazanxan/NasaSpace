import { useEffect, useState, type ReactNode } from 'react'
import { ArrowUpDown, Crosshair, Footprints, RotateCcw, Truck, X } from 'lucide-react'
import type { LonLat, TravelMode } from '../api/types'
import { formatCoord } from '../map/geo'
import { useActiveRegion, useApp } from '../store/useApp'
import { Button, IconButton, Notice, Segmented, Stat } from '../ui/primitives'
import { fmt } from '../ui/format'
import { ElevationProfile } from './ElevationProfile'
import { RouteCompare } from './RouteCompare'
import { POINT_LABEL, modeHint, solWord } from './routeUtils'
import { useRouteRequest } from './useRouteRequest'
import './route.css'

const MODES: { value: TravelMode; label: string; icon: ReactNode }[] = [
  { value: 'rover', label: 'Ровер', icon: <Truck size={16} strokeWidth={1.5} aria-hidden /> },
  { value: 'astronaut', label: 'Астронавт', icon: <Footprints size={16} strokeWidth={1.5} aria-hidden /> },
]

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
        <span className="sr-only">Точка {label}: </span>
        {picking ? 'Кликните по карте' : point ? formatCoord(point) : 'Не выбрана'}
      </span>
      <IconButton
        label={picking ? 'Отменить выбор на карте' : `Выбрать точку ${label} на карте`}
        aria-pressed={picking}
        className="route-point__pick"
        onClick={() => setPick(picking ? null : which)}
      >
        <Crosshair size={16} strokeWidth={1.5} aria-hidden />
      </IconButton>
      <IconButton
        label={`Убрать точку ${label}`}
        onClick={() => setPoint(which, null)}
        disabled={!point}
        className="route-point__clear"
      >
        <X size={16} strokeWidth={1.5} aria-hidden />
      </IconButton>
    </div>
  )
}

function RouteStats() {
  const route = useApp((s) => s.route)
  const status = useApp((s) => s.routeStatus)
  if (!route) return null
  const { length, ascent, maxSlope, sols } = route.stats
  return (
    <div className="route-stats" data-stale={status === 'loading' || undefined} aria-busy={status === 'loading'}>
      <div className="route-stats__main">
        <Stat label="Длина маршрута" value={fmt.km(length)} unit={fmt.kmUnit(length)} />
      </div>
      <div className="route-stats__row">
        <Stat label="Набор высоты" value={fmt.int(ascent)} unit="м" />
        <Stat label="Макс. уклон" value={fmt.deg(maxSlope)} unit="°" />
        <Stat label="В пути" value={sols.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} unit={solWord(sols)} />
      </div>
    </div>
  )
}

export function RoutePanel() {
  const region = useActiveRegion()
  const from = useApp((s) => s.from)
  const to = useApp((s) => s.to)
  const mode = useApp((s) => s.mode)
  const pick = useApp((s) => s.pick)
  const route = useApp((s) => s.route)
  const status = useApp((s) => s.routeStatus)
  const error = useApp((s) => s.routeError)
  const { setMode, setPick, setPoint, clearRoute } = useApp.getState()
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

  if (!region) {
    return (
      <section className="route-panel" aria-labelledby="route-title">
        <h2 id="route-title" className="route-panel__title">
          Маршрут
        </h2>
        <p className="route-empty">Откройте район на карте или в списке, чтобы проложить маршрут</p>
      </section>
    )
  }

  const swap = () => {
    setPoint('from', to)
    setPoint('to', from)
  }

  return (
    <section className="route-panel" aria-labelledby="route-title">
      <div className="route-panel__head">
        <h2 id="route-title" className="route-panel__title">
          Маршрут
        </h2>
        <span className="route-panel__region">{region.name}</span>
        {(from || to) && (
          <IconButton label="Сбросить маршрут" onClick={clearRoute} className="route-panel__reset">
            <RotateCcw size={16} strokeWidth={1.5} aria-hidden />
          </IconButton>
        )}
      </div>

      <div className="route-points">
        <div className="route-points__rows">
          <PointRow which="from" point={from} />
          <PointRow which="to" point={to} />
        </div>
        <IconButton label="Поменять точки местами" onClick={swap} disabled={!from && !to} className="route-points__swap">
          <ArrowUpDown size={16} strokeWidth={1.5} aria-hidden />
        </IconButton>
      </div>

      <div className="route-mode">
        <Segmented label="Способ передвижения" value={mode} options={MODES} onChange={setMode} />
        <p className="route-mode__hint">{modeHint(mode)}</p>
      </div>

      {!from || !to ? (
        <p className="route-empty">
          {pick
            ? 'Esc — отменить выбор'
            : 'Задайте точки А и Б кнопкой с прицелом или из карточки места'}
        </p>
      ) : (
        <>
          {status === 'loading' && !route && (
            <p className="route-status" role="status">
              Прокладываем маршрут…
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
                Повторить
              </Button>
              )}
            </div>
          )}
          {route && status !== 'error' && (
            <>
              <RouteStats />
              <ElevationProfile points={route.points} />
              {status === 'ready' && <RouteCompare req={{ regionId: region.id, from, to, mode }} />}
            </>
          )}
        </>
      )}
    </section>
  )
}
