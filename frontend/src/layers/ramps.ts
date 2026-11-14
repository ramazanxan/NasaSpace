import type { LayerKind } from '../api/types'

/**
 * Data colour ramps for the slope and hazard overlays. The same stops paint
 * the canvas on the map and the legend in the layers popover, so they never
 * drift apart. Colours are data, not chrome: they follow the terrain palette
 * in tokens.css (--c-ochre, --c-rust, --c-danger).
 */

export interface RampStop {
  /** Value in the layer's own unit: degrees for slope, 0..1 for hazard. */
  at: number
  rgb: [number, number, number]
  /** 0..1, multiplied by the layer opacity on the map. */
  alpha: number
  label?: string
}

const OCHRE: [number, number, number] = [0xd4, 0xa1, 0x5a]
const RUST: [number, number, number] = [0xb8, 0x61, 0x3a]
const DEEP_RED: [number, number, number] = [0x7e, 0x26, 0x1f]
const DANGER: [number, number, number] = [0xd9, 0x70, 0x5f]

export const RAMPS: Record<LayerKind, RampStop[]> = {
  slope: [
    // Flat ground stays clear; the transparent stop borrows the next colour so edges don't turn grey.
    { at: 0, rgb: OCHRE, alpha: 0, label: '0°' },
    { at: 10, rgb: OCHRE, alpha: 0.7, label: '10°' },
    { at: 20, rgb: RUST, alpha: 0.88, label: '20°' },
    { at: 30, rgb: DEEP_RED, alpha: 1, label: '30°+' },
  ],
  hazard: [
    { at: 0, rgb: OCHRE, alpha: 0, label: 'low' },
    { at: 0.5, rgb: OCHRE, alpha: 0.75, label: 'medium' },
    { at: 1, rgb: DANGER, alpha: 1, label: 'high' },
  ],
}

/** RGBA (0..255) for a value, linear between stops, clamped at the ends. */
export function rampColor(stops: RampStop[], v: number): [number, number, number, number] {
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (!(v > first.at)) return [...first.rgb, Math.round(first.alpha * 255)]
  if (v >= last.at) return [...last.rgb, Math.round(last.alpha * 255)]
  let i = 1
  while (stops[i].at < v) i++
  const a = stops[i - 1]
  const b = stops[i]
  const t = (v - a.at) / (b.at - a.at)
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t)
  return [mix(a.rgb[0], b.rgb[0]), mix(a.rgb[1], b.rgb[1]), mix(a.rgb[2], b.rgb[2]), mix(a.alpha * 255, b.alpha * 255)]
}

/** CSS gradient for the legend bar. */
export function rampGradient(stops: RampStop[]): string {
  const min = stops[0].at
  const span = stops[stops.length - 1].at - min
  const parts = stops.map((s) => `rgba(${s.rgb.join(', ')}, ${s.alpha}) ${((s.at - min) / span) * 100}%`)
  return `linear-gradient(to right, ${parts.join(', ')})`
}
