import { ArrowLeft, ChevronRight } from 'lucide-react'
import { useActiveRegion, useApp } from '../store/useApp'
import { Button } from '../ui/primitives'
import './search.css'

export function RegionList() {
  const regions = useApp((s) => s.regions)
  const active = useActiveRegion()
  const setActiveRegion = useApp((s) => s.setActiveRegion)
  const selectPlace = useApp((s) => s.selectPlace)

  if (active) {
    return (
      <section className="section" aria-label="Текущий район">
        <div className="regions__current">
          <div className="regions__text">
            <span className="regions__label">Район</span>
            <span className="regions__name">{active.name}</span>
          </div>
          <Button
            variant="ghost"
            icon={<ArrowLeft size={16} strokeWidth={1.5} />}
            onClick={() => {
              selectPlace(null)
              setActiveRegion(null)
            }}
          >
            Весь Марс
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="section" aria-labelledby="regions-title">
      <h2 id="regions-title" className="section__title">
        Районы
      </h2>
      {regions.length === 0 ? (
        <p className="regions__summary">Загружаем районы…</p>
      ) : (
        <ul className="regions__list">
          {regions.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="regions__row"
                title={r.summary}
                onClick={() => setActiveRegion(r.id)}
              >
                <span className="regions__text">
                  <span className="regions__name">{r.name}</span>
                  <span className="regions__summary">{r.summary}</span>
                </span>
                <ChevronRight size={16} strokeWidth={1.5} className="regions__chev" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
