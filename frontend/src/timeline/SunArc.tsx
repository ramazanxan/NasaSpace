import type { SunState } from '../api/types'

const W = 64
const H = 36
const HORIZON = 27
const SPAN = 26

/**
 * The timeline's "moment": horizon, the sun's day path, and where the sun is
 * now. East is left, west is right; height follows elevation.
 */
export function SunArc({ sun }: { sun: SunState | null }) {
  const up = sun !== null && sun.elevation > 0
  // sin(az − 180°): east → −1, south or north → 0, west → +1, for both hemispheres.
  const x = sun ? W / 2 + SPAN * Math.sin(((sun.azimuth - 180) * Math.PI) / 180) : W / 2
  const y = sun ? HORIZON - Math.max(-6, Math.min(90, sun.elevation)) * (22 / 90) : HORIZON + 4
  return (
    <svg className="sun-arc" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <path
        className="sun-arc__path"
        d={`M ${W / 2 - SPAN} ${HORIZON} Q ${W / 2} ${HORIZON - 30} ${W / 2 + SPAN} ${HORIZON}`}
      />
      <line className="sun-arc__horizon" x1={2} x2={W - 2} y1={HORIZON} y2={HORIZON} />
      {sun && <circle className={`sun-arc__sun ${up ? '' : 'sun-arc__sun--down'}`} cx={x} cy={y} r={3.5} />}
    </svg>
  )
}
