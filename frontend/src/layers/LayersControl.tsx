import { useEffect, useId, useRef, useState } from 'react'
import { Layers } from 'lucide-react'
import type { LayerKind } from '../api/types'
import { useApp } from '../store/useApp'
import { Notice, Slider, Toggle } from '../ui/primitives'
import { useLayerErrors } from './layerErrors'
import { RAMPS, rampGradient } from './ramps'
import './layers.css'

const pct = (v: number) => `${Math.round(v * 100)} %`

function Legend({ kind }: { kind: LayerKind }) {
  const stops = RAMPS[kind]
  const min = stops[0].at
  const span = stops[stops.length - 1].at - min
  return (
    <div className="layer-legend" aria-hidden>
      <div className="layer-legend__bar" style={{ background: rampGradient(stops) }} />
      <div className="layer-legend__labels">
        {stops.map((s, i) => (
          <span
            key={s.at}
            style={{ left: `${((s.at - min) / span) * 100}%` }}
            data-edge={i === 0 ? 'start' : i === stops.length - 1 ? 'end' : undefined}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function DataLayer({ kind, label }: { kind: LayerKind; label: string }) {
  const layer = useApp((s) => s.layers[kind])
  const setLayer = useApp((s) => s.setLayer)
  const error = useLayerErrors((s) => s.errors[kind])
  return (
    <div className="layer-item">
      <Toggle label={label} checked={layer.visible} onChange={(visible) => setLayer(kind, { visible })} />
      {layer.visible && error && <Notice tone="error">{error}</Notice>}
      {layer.visible && !error && (
        <div className="layer-item__body">
          <Legend kind={kind} />
          <Slider
            label="Opacity"
            value={layer.opacity}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(opacity) => setLayer(kind, { opacity })}
            format={pct}
          />
        </div>
      )}
    </div>
  )
}

/** "Layers" button in the map toolbar with a small popover of overlays. */
export function LayersControl() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const popId = useId()
  const regionActive = useApp((s) => s.activeRegionId !== null)
  const showTrails = useApp((s) => s.showTrails)
  const showRovers = useApp((s) => s.showRovers)
  const setShowTrails = useApp((s) => s.setShowTrails)
  const setShowRovers = useApp((s) => s.setShowRovers)
  const trailsError = useLayerErrors((s) => s.errors.trails)

  useEffect(() => {
    if (!open) return
    popRef.current?.querySelector<HTMLElement>('input, button')?.focus()
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
        aria-controls={popId}
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
          {regionActive ? (
            <>
              <DataLayer kind="slope" label="Slope" />
              <DataLayer kind="hazard" label="Hazard" />
              <Toggle label="Trails" checked={showTrails} onChange={setShowTrails} />
              {showTrails && trailsError && <Notice tone="error">{trailsError}</Notice>}
            </>
          ) : (
            <p className="layers-pop__note">Slope, hazard and trails are shown inside a region. Open a region from the list on the left</p>
          )}
          <Toggle label="Rovers" checked={showRovers} onChange={setShowRovers} />
        </div>
      )}
    </div>
  )
}
