import { create } from 'zustand'
import type { TrekOverlayId } from '../store/useApp'

/** Load failures for map layers, local to the layers feature. */
export type LayerErrorKey = TrekOverlayId | 'analysis'

interface LayerErrors {
  errors: Partial<Record<LayerErrorKey, string>>
  setError: (k: LayerErrorKey, message: string | null) => void
}

export const useLayerErrors = create<LayerErrors>((set) => ({
  errors: {},
  setError: (k, message) =>
    set((s) => {
      if ((s.errors[k] ?? null) === message) return {}
      const errors = { ...s.errors }
      if (message === null) delete errors[k]
      else errors[k] = message
      return { errors }
    }),
}))

export const TREK_ERROR_TEXT: Record<TrekOverlayId, string> = {
  dust: 'Could not load the dust map from NASA Trek. Try again later',
  'thermal-inertia': 'Could not load the thermal inertia map from NASA Trek. Try again later',
}

export const analysisErrorText = (title: string) => `Could not load the ${title.toLowerCase()} layer. Try again later`
