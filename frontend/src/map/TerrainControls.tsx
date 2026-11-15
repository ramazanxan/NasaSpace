import { Mountain } from 'lucide-react'
import { useApp } from '../store/useApp'
import { Slider } from '../ui/primitives'

/** How much the real MOLA relief is stretched vertically so it reads from orbit. */
export function TerrainControls() {
  const x = useApp((s) => s.exaggeration)
  const set = useApp((s) => s.setExaggeration)
  return (
    <div className="float terrain-controls">
      <Mountain size={16} strokeWidth={1.5} aria-hidden className="muted" />
      <Slider label="Relief" value={x} min={1} max={10} step={1} onChange={set} format={(v) => `${v}×`} />
    </div>
  )
}
