import { create } from 'zustand'

/**
 * Local state for the A* vs Dijkstra replay. Lives in route/ because only
 * the route panel and RouteOnMap use it.
 */

export type Algorithm = 'astar' | 'dijkstra'

export interface CompareResult {
  visited: [number, number][]
  /** Route length found by this algorithm, metres; null when none. */
  length: number | null
}

interface CompareState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  results: Partial<Record<Algorithm, CompareResult>>
  /** Which replay is on the map. */
  playing: Algorithm | null
  /** Bumped to restart the replay of the same algorithm. */
  playId: number
  set: (patch: Partial<Omit<CompareState, 'set' | 'reset' | 'play'>>) => void
  play: (a: Algorithm | null) => void
  reset: () => void
}

export const useCompare = create<CompareState>((set) => ({
  status: 'idle',
  error: null,
  results: {},
  playing: null,
  playId: 0,
  set: (patch) => set(patch),
  play: (playing) => set((s) => ({ playing, playId: s.playId + 1 })),
  reset: () => set((s) => ({ status: 'idle', error: null, results: {}, playing: null, playId: s.playId + 1 })),
}))

export const ALGORITHM_LABEL: Record<Algorithm, string> = { astar: 'A*', dijkstra: 'Дейкстра' }
