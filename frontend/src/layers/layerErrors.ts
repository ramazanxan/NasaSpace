import { create } from 'zustand'

/** Load failures for map layers, local to the layers feature. Keyed by 'slope' | 'hazard' | 'trails'. */
export type LayerErrorKey = 'slope' | 'hazard' | 'trails'

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

export const LAYER_ERROR_TEXT: Record<LayerErrorKey, string> = {
  slope: 'Не удалось загрузить слой уклона. Повторите позже',
  hazard: 'Не удалось загрузить слой опасности. Повторите позже',
  trails: 'Не удалось загрузить тропы. Повторите позже',
}
