import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Layers } from 'lucide-react'
import type { AnalysisLayer, AnalysisLayerId, LegendStop } from '../api/types'
import { useViewer } from '../map/viewerRef'
import { useApp, type TrekOverlayId } from '../store/useApp'
import { Notice, Slider, Toggle } from '../ui/primitives'
import { useLayerErrors } from './layerErrors'
import './layers.css'

const pct = (v: number) => `${Math.round(v * 100)} %`

/** 13.5 → "13:30". */
function clock(h: number): string {
  const total = Math.round(h * 60)
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Legend numbers: grouped thousands, at most two decimals, typographic minus. */
function num(v: number): string {
  const s = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 })
  return v < 0 ? `−${s}` : s
}

const TREK_ITEMS: { id: TrekOverlayId; title: string; what: string; how: string }[] = [
  {
    id: 'dust',
    title: 'Dust index',
    what: 'MGS TES. How much fine dust covers the surface.',
    how: 'Red and orange: thick dust, loose footing, clogs suits and gear. Blue: clean ground.',
  },
  {
    id: 'thermal-inertia',
    title: 'Thermal inertia',
    what: 'MGS TES. How fast the ground heats up and cools down.',
    how: 'Low (purple, blue): dust and sand, big day–night swing. High (yellow, red): rock and firm ground.',
  },
]

function TrekItem({ id, title, what, how }: (typeof TREK_ITEMS)[number]) {
  const overlay = useApp((s) => s.trek[id])
  const setTrek = useApp((s) => s.setTrek)
  const error = useLayerErrors((s) => s.errors[id])
  return (
    <div className="layer-item">
      <Toggle label={title} checked={overlay.visible} onChange={(visible) => setTrek(id, { visible })} />
      <div className="layer-item__body">
        <p className="layer-text">{what}</p>
        <p className="layer-text layer-text--quiet">{how}</p>
        {overlay.visible && error && <Notice tone="error">{error}</Notice>}
        {overlay.visible && !error && (
          <Slider
            label={`${title} opacity`}
            value={overlay.opacity}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(opacity) => setTrek(id, { opacity })}
            format={pct}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Data ramp for an analysis layer. Stops sit at equal steps so labels never
 * collide; the colours between them blend as they do on the map.
 */
function Legend({ stops, unit }: { stops: LegendStop[]; unit: string }) {
  if (stops.length === 0) return null
  const n = stops.length
  const at = (i: number) => `${((i + 0.5) / n) * 100}%`
  const ramp =
    n === 1 ? stops[0].color : `linear-gradient(to right, ${stops.map((s, i) => `${s.color} ${at(i)}`).join(', ')})`
  // Short units ride along with the numbers; long ones are named once below.
  const inline = unit.length > 0 && unit.length <= 3
  const ticks = stops.map((s, i) => {
    const suffix = inline && i === n - 1 ? (unit.startsWith('°') ? unit : ` ${unit}`) : ''
    const value = unit ? `${num(s.value)}${suffix}` : null
    const label = s.label && s.label !== value ? s.label : null
    return { value, label }
  })
  const text = ticks.map((t) => [t.value, t.label].filter(Boolean).join(' ')).join(', ')
  return (
    <figure className="layer-legend" aria-label={`Legend: ${text}${unit && !inline ? `, ${unit}` : ''}`}>
      <div className="layer-legend__bar" style={{ background: ramp }} aria-hidden />
      <div className="layer-legend__ticks" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }} aria-hidden>
        {ticks.map((t, i) => (
          <span key={i} className="layer-legend__tick">
            {t.value && <span className="layer-legend__value">{t.value}</span>}
            {t.label && <span className="layer-legend__label">{t.label}</span>}
          </span>
        ))}
      </div>
      {unit && !inline && <figcaption className="layer-legend__unit">Values in {unit}</figcaption>}
    </figure>
  )
}

/** "Shown for Rover at 13:00 local time" for layers that depend on mode or time. */
function useShownFor(layer: AnalysisLayer): string | null {
  const mode = useApp((s) => s.mode)
  const hour = useApp((s) => s.hour)
  const profileLabel = useApp((s) => s.grid?.profiles.find((p) => p.id === s.mode)?.label)
  if (!layer.modeDependent && !layer.timeDependent) return null
  const who = profileLabel ?? (mode === 'rover' ? 'Rover' : 'Astronaut')
  // The image is rendered for half hours, so say the hour it really shows.
  const when = `${clock(Math.round(hour * 2) / 2)} local time`
  if (layer.modeDependent && layer.timeDependent) return `Shown for ${who} at ${when}`
  return layer.modeDependent ? `Shown for ${who}` : `Shown for ${when}`
}

function AnalysisDetails({ layer }: { layer: AnalysisLayer }) {
  const opacity = useApp((s) => s.analysis.opacity)
  const setAnalysis = useApp((s) => s.setAnalysis)
  const error = useLayerErrors((s) => s.errors.analysis)
  const shownFor = useShownFor(layer)
  return (
    <div className="layer-item__body">
      {layer.howToRead && <p className="layer-text">{layer.howToRead}</p>}
      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : (
        <>
          <Legend stops={layer.stops} unit={layer.unit} />
          <Slider
            label={`${layer.title} opacity`}
            value={opacity}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(v) => setAnalysis({ opacity: v })}
            format={pct}
          />
        </>
      )}
      {shownFor && <p className="layer-text layer-text--quiet">{shownFor}</p>}
      {layer.source && <p className="layer-text layer-text--quiet">Source: {layer.source}</p>}
    </div>
  )
}

function AnalysisSection() {
  const backend = useApp((s) => s.backend)
  const catalog = useApp((s) => s.catalog)
  const selected = useApp((s) => s.analysis.id)
  const setAnalysis = useApp((s) => s.setAnalysis)
  const name = useId()
  const titleId = useId()
  const online = backend === 'online'
  const layers = online ? (catalog?.layers ?? []) : []
  // A selection the catalog no longer offers reads as "None".
  const current = layers.some((l) => l.id === selected) ? selected : null

  const note =
    backend === 'unknown'
      ? 'Connecting to the route server'
      : backend === 'offline'
        ? 'These maps come from the route server, which is offline. Start the backend to use them'
        : layers.length === 0
          ? 'The route server sent no analysis layers. Try again later'
          : null

  const options: { id: AnalysisLayerId | null; title: string; description?: string; layer?: AnalysisLayer }[] = [
    { id: null, title: 'None' },
    ...layers.map((l) => ({ id: l.id, title: l.title, description: l.description, layer: l })),
  ]

  const disabled = layers.length === 0
  return (
    <section className="layers-section" aria-labelledby={titleId}>
      <h3 id={titleId} className="layers-section__title">
        Route analysis
      </h3>
      {note && <p className="layer-text layer-text--quiet">{note}</p>}
      {!disabled && (
        <div role="radiogroup" aria-labelledby={titleId}>
          {options.map((o) => {
            const checked = current === o.id
            return (
              <div key={o.id ?? 'none'} className="layer-item">
                <label className="layer-radio">
                  <input type="radio" name={name} checked={checked} onChange={() => setAnalysis({ id: o.id })} />
                  <span className="layer-radio__dot" aria-hidden />
                  <span className="layer-radio__text">
                    <span className="layer-radio__title">{o.title}</span>
                    {o.description && <span className="layer-radio__description">{o.description}</span>}
                  </span>
                </label>
                {checked && o.layer && <AnalysisDetails layer={o.layer} />}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function MarkersSection() {
  const showRovers = useApp((s) => s.showRovers)
  const showGridArea = useApp((s) => s.showGridArea)
  const setShowRovers = useApp((s) => s.setShowRovers)
  const setShowGridArea = useApp((s) => s.setShowGridArea)
  const titleId = useId()
  return (
    <section className="layers-section" aria-labelledby={titleId}>
      <h3 id={titleId} className="layers-section__title">
        Markers
      </h3>
      <Toggle label="Rovers and landers" checked={showRovers} onChange={setShowRovers} />
      <Toggle label="Route grid frame" checked={showGridArea} onChange={setShowGridArea} />
    </section>
  )
}

/** "Layers" button in the map toolbar with a popover of overlays, analysis maps and markers. */
export function LayersControl() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const popId = useId()
  const trekId = useId()
  const viewer = useViewer()

  // Keep the popover inside the map area: it ends 16px above the map's bottom edge
  // (or the window's, whichever is higher) and scrolls inside.
  useLayoutEffect(() => {
    const pop = popRef.current
    if (!open || !pop) return
    const fit = () => {
      const mapBottom = viewer && !viewer.isDestroyed() ? viewer.container.getBoundingClientRect().bottom : innerHeight
      const room = Math.min(mapBottom, innerHeight) - pop.getBoundingClientRect().top - 16
      pop.style.setProperty('--pop-max', `${Math.max(160, Math.floor(room))}px`)
    }
    fit()
    addEventListener('resize', fit)
    addEventListener('scroll', fit, true)
    return () => {
      removeEventListener('resize', fit)
      removeEventListener('scroll', fit, true)
    }
  }, [open, viewer])

  useEffect(() => {
    if (!open) return
    popRef.current?.querySelector<HTMLElement>('input:not(:disabled), button')?.focus()
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="layers-control" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="float layers-control__button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Layers size={16} strokeWidth={1.5} aria-hidden />
        Layers
      </button>
      {open && (
        <div
          ref={popRef}
          id={popId}
          className="layers-pop"
          role="dialog"
          aria-label="Map layers"
          onBlur={(e) => {
            if (!rootRef.current?.contains(e.relatedTarget as Node | null) && e.relatedTarget) setOpen(false)
          }}
        >
          <section className="layers-section" aria-labelledby={trekId}>
            <h3 id={trekId} className="layers-section__title">
              NASA Trek maps
            </h3>
            {TREK_ITEMS.map((item) => (
              <TrekItem key={item.id} {...item} />
            ))}
          </section>
          <AnalysisSection />
          <MarkersSection />
        </div>
      )}
    </div>
  )
}
