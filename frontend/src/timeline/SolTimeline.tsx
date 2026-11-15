import { useMemo } from 'react'
import type { LonLat } from '../api/types'
import { sunState } from '../api/sun'
import { useApp } from '../store/useApp'
import { Slider } from '../ui/primitives'
import { fmt } from '../ui/format'
import { SunArc } from './SunArc'
import './timeline.css'

/** Sols in one Martian year. */
const SOLS_PER_YEAR = 668
/** Without an inspected point or a place, the sun is shown for the centre of the route grid. */
const GRID_CENTRE: LonLat = { lon: -85, lat: 6 }

/** 13.75 → "13:45". */
function clock(h: number): string {
  const total = Math.round(h * 60)
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Typographic minus for negative elevations. */
const signedDeg = (v: number) => (v < 0 ? `−${fmt.deg(-v)}` : fmt.deg(v))

const hours = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Bottom dock: sol and local time, with the sun at that moment. */
export function SolTimeline() {
  const sol = useApp((s) => s.sol)
  const hour = useApp((s) => s.hour)
  const setTime = useApp((s) => s.setTime)
  const point = useApp((s) => s.inspected ?? s.selectedPlace?.position ?? GRID_CENTRE)
  const sun = useMemo(() => sunState(point, sol, hour), [point, sol, hour])

  return (
    <section className="float sol-timeline" aria-label="Time on Mars">
      <div className="sol-timeline__sliders">
        <Slider label="Sol" value={sol} min={0} max={SOLS_PER_YEAR} onChange={(v) => setTime({ sol: v })} format={fmt.int} />
        <Slider
          label="Local time"
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
          <span className="sol-timeline__time">
            {clock(sun.lmst)} <span className="muted">LMST</span>
          </span>
          <span className="sol-timeline__line">
            Elevation {signedDeg(sun.elevation)}°, azimuth {fmt.int(sun.azimuth)}°
          </span>
          <span className="sol-timeline__line">
            {sun.hoursToSunset === null ? 'Sun below the horizon' : `Sunset in ${hours(sun.hoursToSunset)} h`}
          </span>
          <span className="sol-timeline__hint">Sets departure time and the temperature map</span>
        </div>
      </div>
    </section>
  )
}
