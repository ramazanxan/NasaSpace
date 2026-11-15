import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RouteCell } from '../api/types'
import { useApp } from '../store/useApp'
import { Segmented } from '../ui/primitives'
import { fmt } from '../ui/format'
import { dustWord, formatDust, formatTemp, num } from './routeUtils'

type Series = 'elevation' | 'dust' | 'temperature'

interface Datum {
  d: number
  elevation: number | null
  slope: number | null
  dust: number | null
  temperature: number | null
}

const HEIGHT = 148

const SERIES: { value: Series; label: string }[] = [
  { value: 'elevation', label: 'Elevation' },
  { value: 'dust', label: 'Dust' },
  { value: 'temperature', label: 'Temperature' },
]

/** How each series reads: tick text, range text, the unit after the range, and its chart description. */
const SPEC: Record<Series, { tick: (v: number) => string; unit: string; name: string; minRange: number }> = {
  elevation: { tick: fmt.height, unit: 'm', name: 'Elevation', minRange: 20 },
  dust: { tick: formatDust, unit: 'dust index', name: 'Dust index', minRange: 0.1 },
  temperature: { tick: formatTemp, unit: '°C', name: 'Surface temperature', minRange: 5 },
}

/** 1, 2 or 5 × 10^k: the step a surveyor would pick for about `count` intervals. */
function niceStep(range: number, count: number): number {
  const raw = range / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const f = raw / mag
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag
}

function ticksIn(lo: number, hi: number, step: number): number[] {
  const out: number[] = []
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-6; v += step) out.push(Number(v.toPrecision(12)))
  return out
}

/** Distance axis: round ticks, unit only on the last one. */
function distanceAxis(total: number) {
  const km = total >= 2000
  const step = niceStep(Math.max(total, 1), 4)
  const ticks = ticksIn(0, total, step)
  const last = ticks.at(-1)
  const n = (m: number) =>
    km ? (m / 1000).toLocaleString('en-US', { maximumFractionDigits: step < 1000 ? 1 : 0 }) : fmt.int(m)
  return { ticks, tick: (m: number) => (m === last ? `${n(m)} ${km ? 'km' : 'm'}` : n(m)) }
}

/** Value axis: three or four round levels with a little air above and below. */
function valueAxis(series: Series, lo: number, hi: number) {
  if (series === 'dust') return { domain: [0, 1] as [number, number], ticks: [0, 0.5, 1] }
  const step = niceStep(Math.max(hi - lo, SPEC[series].minRange), 3)
  const pad = (hi - lo) * 0.04
  const min = Math.floor((lo - pad) / step) * step
  const max = Math.max(min + step, Math.ceil((hi + pad) / step) * step)
  return { domain: [min, max] as [number, number], ticks: ticksIn(min, max, step) }
}

const dash = '—'

function ProfileTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Datum }> }) {
  const p = active ? payload?.[0]?.payload : undefined
  if (!p) return null
  return (
    <div className="route-profile__tip">
      <span>
        {fmt.km(p.d)} {fmt.kmUnit(p.d)}
      </span>
      <span>Elevation {p.elevation == null ? dash : `${fmt.height(p.elevation)} m`}</span>
      <span>Slope {p.slope == null ? dash : `${fmt.deg(p.slope)}°`}</span>
      <span>Dust {p.dust == null ? dash : `${formatDust(p.dust)}, ${dustWord(p.dust)}`}</span>
      <span>Surface {p.temperature == null ? dash : `${formatTemp(p.temperature)} °C`}</span>
    </div>
  )
}

/** Elevation, dust or temperature along the route. Hover moves the marker on the map. */
export function ElevationProfile({ cells }: { cells: RouteCell[] }) {
  const setHoverIndex = useApp((s) => s.setHoverIndex)
  const [series, setSeries] = useState<Series>('elevation')

  const data = useMemo<Datum[]>(
    () =>
      cells.map((c) => ({
        d: num(c.distanceFromStartM) ?? 0,
        elevation: num(c.elevationM),
        slope: num(c.slopeWithMarginDeg) ?? num(c.slopeMeanDeg),
        dust: num(c.dustIndex),
        temperature: num(c.surfaceTempC),
      })),
    [cells],
  )
  const total = data.at(-1)?.d ?? 0

  const { lo, hi } = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const p of data) {
      const v = p[series]
      if (v == null) continue
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    return { lo, hi }
  }, [data, series])
  const hasData = Number.isFinite(lo)

  const xAxis = useMemo(() => distanceAxis(total), [total])
  const yAxis = useMemo(() => (hasData ? valueAxis(series, lo, hi) : null), [hasData, series, lo, hi])
  const spec = SPEC[series]
  const range = hasData ? `${spec.tick(lo)} … ${spec.tick(hi)} ${spec.unit}` : `No ${spec.name.toLowerCase()} data`

  const hover = (i: number | null) => {
    if (useApp.getState().hoverIndex !== i) setHoverIndex(i)
  }

  return (
    <figure className="route-profile">
      <figcaption className="route-profile__head">
        <Segmented label="Profile series" value={series} options={SERIES} onChange={setSeries} />
        <span className="route-profile__range">{range}</span>
      </figcaption>
      <div
        className="route-profile__chart"
        role="img"
        aria-label={`${spec.name} along the route: ${range} over ${fmt.km(total)} ${fmt.kmUnit(total)}`}
      >
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
            onMouseMove={(st) => {
              const i = st.activeTooltipIndex
              hover(st.isTooltipActive && i != null ? Number(i) : null)
            }}
            onMouseLeave={() => hover(null)}
          >
            <CartesianGrid vertical={false} stroke="var(--c-line)" />
            <XAxis
              dataKey="d"
              type="number"
              domain={[0, total]}
              ticks={xAxis.ticks}
              tickFormatter={xAxis.tick}
              tickLine={false}
              axisLine={{ stroke: 'var(--c-line-strong)' }}
              tick={{ fill: 'var(--c-text-3)', fontSize: 12 }}
              tickMargin={6}
              interval={0}
              height={24}
            />
            <YAxis
              dataKey={series}
              type="number"
              domain={yAxis?.domain ?? [0, 1]}
              ticks={yAxis?.ticks}
              tickFormatter={spec.tick}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--c-text-3)', fontSize: 12 }}
              interval={0}
              width={48}
            />
            <Tooltip
              content={ProfileTooltip}
              cursor={{ stroke: 'var(--c-line-strong)', strokeWidth: 1 }}
              isAnimationActive={false}
              offset={12}
            />
            <Area
              key={series}
              dataKey={series}
              type="linear"
              baseValue="dataMin"
              stroke={series === 'elevation' ? 'var(--c-accent)' : 'var(--c-ochre)'}
              strokeWidth={1.5}
              fill="var(--c-text)"
              fillOpacity={0.06}
              connectNulls={false}
              isAnimationActive={false}
              activeDot={{ r: 3.5, fill: 'var(--c-text)', stroke: 'var(--c-surface)', strokeWidth: 2 }}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
