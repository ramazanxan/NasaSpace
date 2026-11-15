import { Globe, Palette } from 'lucide-react'
import { useApp, type Basemap } from '../store/useApp'
import { Segmented } from '../ui/primitives'

const OPTIONS: { value: Basemap; label: string; icon: React.ReactNode }[] = [
  { value: 'natural', label: 'Natural', icon: <Globe size={16} strokeWidth={1.5} aria-hidden /> },
  { value: 'elevation', label: 'Elevation', icon: <Palette size={16} strokeWidth={1.5} aria-hidden /> },
]

/** Switches the globe between true-colour imagery and the MOLA colour-by-height map. */
export function BasemapSwitch() {
  const basemap = useApp((s) => s.basemap)
  const setBasemap = useApp((s) => s.setBasemap)
  return (
    <div className="basemap-switch">
      <Segmented label="Base map" value={basemap} options={OPTIONS} onChange={setBasemap} />
    </div>
  )
}
