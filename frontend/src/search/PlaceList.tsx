import { ChevronRight, Globe } from 'lucide-react'
import { PLACES } from '../api/places'
import { flyHome } from '../map/camera'
import { getViewer } from '../map/viewerRef'
import { useApp } from '../store/useApp'
import { Button } from '../ui/primitives'
import { goToPlace } from './goToPlace'
import './search.css'

const FEATURED = PLACES.filter((p) => p.featured)

export function PlaceList() {
  const selectedId = useApp((s) => s.selectedPlace?.id)
  const selectPlace = useApp((s) => s.selectPlace)

  function home() {
    selectPlace(null)
    const viewer = getViewer()
    if (viewer && !viewer.isDestroyed()) flyHome(viewer)
  }

  return (
    <section className="section" aria-labelledby="places-title">
      <h2 id="places-title" className="section__title">
        Places
      </h2>
      <ul className="places__list">
        {FEATURED.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="places__row"
              aria-current={p.id === selectedId ? 'true' : undefined}
              title={p.description}
              onClick={() => goToPlace(p)}
            >
              <span className="places__text">
                <span className="places__name">{p.name}</span>
                <span className="places__summary">{p.description}</span>
              </span>
              <ChevronRight size={16} strokeWidth={1.5} className="places__chev" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" icon={<Globe size={16} strokeWidth={1.5} />} onClick={home}>
        Whole planet
      </Button>
    </section>
  )
}
