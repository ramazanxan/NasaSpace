import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RoutePoint } from '../api/types'
import { useApp } from '../store/useApp'
import { fmt } from '../ui/format'

interface Datum {
  d: number
  h: number
  s: number
}

const HEIGHT = 148

/** 1, 2 or 5 × 10^k: the step a surveyor would pick for about `count` intervals. */
function niceStep(range: number, count: number): number {
  const raw = Math.max(range, 1) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const f = raw / mag
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag
}

function ticksIn(lo: number, hi: number, step: number): number[] {
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v)
  return out
}

/** Distance axis: round ticks, unit only on the last one. */
function distanceAxis(total: number) {
  const km = total >= 2000
  const step = niceStep(total, 4)
  const ticks = ticksIn(0, total, step)
  const last = ticks.at(-1)
  const num = (m: number) =>
    km ? (m / 1000).toLocaleString('ru-RU', { maximumFractionDigits: step < 1000 ? 1 : 0 }) : fmt.int(m)
  return { ticks, tick: (m: number) => (m === last ? `${num(m)} ${km ? 'км' : 'м'}` : num(m)) }
}

/** Height axis: three or four round levels with a little air above and below. */
function heightAxis(lo: number, hi: number) {
  const step = niceStep(Math.max(hi - lo, 20), 3)
  const pad = (hi - lo) * 0.04
  const min = Math.floor((lo - pad) / step) * step
  const max = Math.max(min + step, Math.ceil((hi + pad) / step) * step)
  return { domain: [min, max] as [number, number], ticks: ticksIn(min, max, step) }
}

function ProfileTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Datum }> }) {
  const p = active ? payload?.[0]?.payload : undefined
  if (!p) return null
  return (
    <div className="route-profile__tip">
      <span>
        {fmt.km(p.d)} {fmt.kmUnit(p.d)}
      </span>
      <span>{fmt.height(p.h)} м</span>
      <span>уклон {fmt.deg(p.s)}°</span>
    </div>
  )
}

/** Height along the route. Hover moves the marker on the map. */
export function ElevationProfile({ points }: { points: RoutePoint[] }) {
  const setHoverIndex = useApp((s) => s.setHoverIndex)

  const { data, total, lo, hi } = useMemo(() => {
    const data: Datum[] = points.map((p) => ({ d: p.distance, h: p.height, s: p.slope }))
    let lo = Infinity
    let hi = -Infinity
    for (const p of data) {
      lo = Math.min(lo, p.h)
      hi = Math.max(hi, p.h)
    }
    return { data, total: data.at(-1)?.d ?? 0, lo, hi }
  }, [points])

  const xAxis = useMemo(() => distanceAxis(total), [total])
  const yAxis = useMemo(() => heightAxis(lo, hi), [lo, hi])

  const hover = (i: number | null) => {
    if (useApp.getState().hoverIndex !== i) setHoverIndex(i)
  }

  return (
    <figure className="route-profile">
      <figcaption className="route-profile__head">
        <span className="section__title">Профиль высот</span>
        <span className="route-profile__range">
          {fmt.height(lo)} … {fmt.height(hi)} м
        </span>
      </figcaption>
      <div
        className="route-profile__chart"
        role="img"
        aria-label={`Профиль высот: от ${fmt.height(lo)} до ${fmt.height(hi)} м на ${fmt.km(total)} ${fmt.kmUnit(total)}`}
      >
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
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
              dataKey="h"
              type="number"
              domain={yAxis.domain}
              ticks={yAxis.ticks}
              tickFormatter={(v: number) => fmt.height(v)}
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
              dataKey="h"
              type="linear"
              baseValue="dataMin"
              stroke="var(--c-accent)"
              strokeWidth={1.5}
              fill="var(--c-text)"
              fillOpacity={0.06}
              isAnimationActive={false}
              activeDot={{ r: 3.5, fill: 'var(--c-accent)', stroke: 'var(--c-surface)', strokeWidth: 2 }}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
