import type { Place, Region } from '../types'

/**
 * The terrain patches we model. Positions are real; heights are close to
 * the MOLA values. Until the backend sends real grids, the relief inside
 * each patch is synthesised in `terrain.ts` from the `shape` hint.
 */
export interface MockRegion extends Region {
  shape: 'crater-delta' | 'crater-mound' | 'shield-caldera' | 'canyon' | 'plain' | 'plain-cones'
  /** Relief amplitude, metres. */
  relief: number
}

export const MOCK_REGIONS: MockRegion[] = [
  {
    id: 'jezero',
    name: 'Jezero Crater',
    summary: 'Ancient lake with a river delta, landing site of Perseverance',
    bbox: [76.9, 17.9, 78.1, 18.9],
    center: { lon: 77.5, lat: 18.4 },
    baseHeight: -2600,
    shape: 'crater-delta',
    relief: 900,
  },
  {
    id: 'gale',
    name: 'Gale Crater',
    summary: 'Crater with Mount Sharp at its center, where Curiosity operates',
    bbox: [136.9, -5.9, 138.3, -4.3],
    center: { lon: 137.55, lat: -5.0 },
    baseHeight: -4500,
    shape: 'crater-mound',
    relief: 5000,
  },
  {
    id: 'olympus',
    name: 'Olympus Mons',
    summary: 'Caldera of the tallest volcano in the Solar System',
    bbox: [-134.9, 17.6, -132.7, 19.7],
    center: { lon: -133.8, lat: 18.65 },
    baseHeight: 21000,
    shape: 'shield-caldera',
    relief: 3200,
  },
  {
    id: 'melas',
    name: 'Melas Chasma',
    summary: 'Central part of Valles Marineris, up to 7 km deep',
    bbox: [-73.4, -11.4, -70.8, -9.4],
    center: { lon: -72.1, lat: -10.4 },
    baseHeight: -3800,
    shape: 'canyon',
    relief: 6500,
  },
  {
    id: 'utopia',
    name: 'Utopia Planitia',
    summary: 'Flat plain with cones, landing site of Zhurong',
    bbox: [109.3, 24.6, 110.6, 25.6],
    center: { lon: 109.95, lat: 25.1 },
    baseHeight: -4100,
    shape: 'plain-cones',
    relief: 260,
  },
  {
    id: 'elysium',
    name: 'Elysium Planitia',
    summary: 'Level lava plain, landing site of InSight',
    bbox: [135.0, 4.0, 136.2, 5.0],
    center: { lon: 135.6, lat: 4.5 },
    baseHeight: -2600,
    shape: 'plain',
    relief: 180,
  },
]

type PlaceSeed = Omit<Place, 'height' | 'slope'>

/** Height and slope are filled from the terrain grid at load time. */
export const MOCK_PLACE_SEEDS: PlaceSeed[] = [
  {
    id: 'octavia-butler',
    name: 'Octavia E. Butler landing site',
    kind: 'landing-site',
    regionId: 'jezero',
    position: { lon: 77.4508, lat: 18.4447 },
    description: 'Octavia E. Butler landing site, where Perseverance landed on February 18, 2021.',
  },
  {
    id: 'jezero-delta',
    name: 'Western delta',
    kind: 'feature',
    regionId: 'jezero',
    position: { lon: 77.38, lat: 18.5 },
    description: 'Fan of sediment carried by a river into the lake. The main target in the search for signs of life.',
  },
  {
    id: 'jezero-rim',
    name: 'Jezero western rim',
    kind: 'crater',
    regionId: 'jezero',
    position: { lon: 77.12, lat: 18.45 },
    description: 'Crater rim that the rover has been climbing since 2023.',
  },
  {
    id: 'bradbury',
    name: 'Bradbury Landing',
    kind: 'landing-site',
    regionId: 'gale',
    position: { lon: 137.4417, lat: -4.5895 },
    description: 'Bradbury Landing, where Curiosity landed on August 6, 2012.',
  },
  {
    id: 'mount-sharp',
    name: 'Mount Sharp',
    kind: 'mountain',
    regionId: 'gale',
    position: { lon: 137.85, lat: -5.08 },
    description: 'Layered mountain about 5 km tall at the center of Gale Crater.',
  },
  {
    id: 'olympus-caldera',
    name: 'Olympus Mons caldera',
    kind: 'crater',
    regionId: 'olympus',
    position: { lon: -133.8, lat: 18.65 },
    description: 'Chain of collapsed craters at the summit of the volcano.',
  },
  {
    id: 'melas-floor',
    name: 'Melas Chasma floor',
    kind: 'canyon',
    regionId: 'melas',
    position: { lon: -72.1, lat: -10.45 },
    description: 'Level floor with landslides from the canyon walls.',
  },
  {
    id: 'zhurong',
    name: 'Zhurong landing site',
    kind: 'landing-site',
    regionId: 'utopia',
    position: { lon: 109.925, lat: 25.066 },
    description: 'The Chinese rover Zhurong landed here on May 14, 2021.',
  },
  {
    id: 'insight',
    name: 'InSight lander',
    kind: 'landing-site',
    regionId: 'elysium',
    position: { lon: 135.6234, lat: 4.5024 },
    description: 'The InSight seismic station operated here from 2018 to 2022.',
  },
]
