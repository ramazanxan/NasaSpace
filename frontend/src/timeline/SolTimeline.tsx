import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { LonLat, SunState } from '../api/types'
import { useActiveRegion, useApp } from '../store/useApp'
import { Slider } from '../ui/primitives'
import { fmt } from '../ui/format'
import { SunArc } from './SunArc'
import { useSunLighting } from './sunLight'
import './timeline.css'

/** Sols in one Martian year. */
const SOLS_PER_YEAR = 668
/** Sun readout falls back to Jezero when no region is open. */
const JEZERO: LonLat = { lon: 77.4508, lat: 18.4447 }

/** 13.75 → «13:45». */
function clock(h: number): string {
  const total = Math.round(h * 60)
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Typographic minus for negative elevations. */
const signedDeg = (v: number) => (v < 0 ? `−${fmt.deg(-v)}` : fmt.deg(v))

const hours = (v: number) => v.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Debounced sun position for a point and moment. Keeps the last answer while a new one loads. */
function useSun(point: LonLat, sol: number, hour: number): SunState | null {
  const [sun, setSun] = useState<SunState | null>(null)
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      api.sun(point, sol, hour).then(
        (s) => {
          if (!cancelled) setSun(s)
        },
        (e) => console.error('sun', e),
      )
    }, 80)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [point, sol, hour])
  return sun
}

/** Bottom dock: sol and local time, with the sun at that moment. */
export function SolTimeline() {
  const sol = useApp((s) => s.sol)
  const hour = useApp((s) => s.hour)
  const setTime = useApp((s) => s.setTime)
  const region = useActiveRegion()
  const center = region?.center ?? null
  const point = useMemo(() => center ?? JEZERO, [center])
  const sun = useSun(point, sol, hour)
  useSunLighting(center, sun)

  return (
    <section className="float sol-timeline" aria-label="Время на Марсе">
      <div className="sol-timeline__sliders">
        <Slider label="Сол" value={sol} min={0} max={SOLS_PER_YEAR} onChange={(v) => setTime({ sol: v })} format={fmt.int} />
        <Slider
          label="Местное время"
          value={hour}
          min={0}
          max={24}
          step={0.25}
          onChange={(v) => setTime({ hour: v })}
          format={clock}
        />
      </div>
      <div className="sol-timeline__moment">
        <SunArc sun={sun} />
        <div className="sol-timeline__readout">
          {sun ? (
            <>
              <span className="sol-timeline__time">
                {clock(sun.lmst)} <span className="muted">LMST</span>
              </span>
              <span className="sol-timeline__line">
                Высота {signedDeg(sun.elevation)}°, азимут {fmt.int(sun.azimuth)}°
              </span>
              <span className="sol-timeline__line">
                {sun.hoursToSunset === null ? 'Солнце за горизонтом' : `До заката ${hours(sun.hoursToSunset)} ч`}
              </span>
            </>
          ) : (
            <span className="sol-timeline__line">Считаем положение Солнца</span>
          )}
        </div>
      </div>
    </section>
  )
}
