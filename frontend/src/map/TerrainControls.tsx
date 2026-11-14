import { Mountain } from 'lucide-react'
import { useApp } from '../store/useApp'
import { Slider } from '../ui/primitives'

/** Relief exaggeration, shown only inside a region where relief exists. */
export function TerrainControls() {
  const active = useApp((s) => s.activeRegionId)
  const x = useApp((s) => s.exaggeration)
  const set = useApp((s) => s.setExaggeration)
  if (!active) return null
  return (
    <div className="float terrain-controls">
      <Mountain size={16} strokeWidth={1.5} aria-hidden className="muted" />
      <Slider label="Terrain" value={x} min={1} max={5} step={0.5} onChange={set} format={(v) => `${v}×`} />
    </div>
  )
}
