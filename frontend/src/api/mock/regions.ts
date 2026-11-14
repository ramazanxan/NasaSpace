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
    name: 'Кратер Езеро',
    summary: 'Древнее озеро с дельтой реки, место посадки Perseverance',
    bbox: [76.9, 17.9, 78.1, 18.9],
    center: { lon: 77.5, lat: 18.4 },
    baseHeight: -2600,
    shape: 'crater-delta',
    relief: 900,
  },
  {
    id: 'gale',
    name: 'Кратер Гейл',
    summary: 'Кратер с горой Шарп в центре, где работает Curiosity',
    bbox: [136.9, -5.9, 138.3, -4.3],
    center: { lon: 137.55, lat: -5.0 },
    baseHeight: -4500,
    shape: 'crater-mound',
    relief: 5000,
  },
  {
    id: 'olympus',
    name: 'Гора Олимп',
    summary: 'Кальдера самого высокого вулкана Солнечной системы',
    bbox: [-134.9, 17.6, -132.7, 19.7],
    center: { lon: -133.8, lat: 18.65 },
    baseHeight: 21000,
    shape: 'shield-caldera',
    relief: 3200,
  },
  {
    id: 'melas',
    name: 'Каньон Мелас',
    summary: 'Центральная часть долин Маринер, глубина до 7 км',
    bbox: [-73.4, -11.4, -70.8, -9.4],
    center: { lon: -72.1, lat: -10.4 },
    baseHeight: -3800,
    shape: 'canyon',
    relief: 6500,
  },
  {
    id: 'utopia',
    name: 'Равнина Утопия',
    summary: 'Плоская равнина с конусами, место посадки Zhurong',
    bbox: [109.3, 24.6, 110.6, 25.6],
    center: { lon: 109.95, lat: 25.1 },
    baseHeight: -4100,
    shape: 'plain-cones',
    relief: 260,
  },
  {
    id: 'elysium',
    name: 'Равнина Элизий',
    summary: 'Ровная лавовая равнина, место посадки InSight',
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
    name: 'Посадка Perseverance',
    kind: 'landing-site',
    regionId: 'jezero',
    position: { lon: 77.4508, lat: 18.4447 },
    description: 'Площадка «Октавия Батлер», где Perseverance сел 18 февраля 2021 года.',
  },
  {
    id: 'jezero-delta',
    name: 'Западная дельта',
    kind: 'feature',
    regionId: 'jezero',
    position: { lon: 77.38, lat: 18.5 },
    description: 'Веер осадков, принесённых рекой в озеро. Главная цель поиска следов жизни.',
  },
  {
    id: 'jezero-rim',
    name: 'Западный край кратера',
    kind: 'crater',
    regionId: 'jezero',
    position: { lon: 77.12, lat: 18.45 },
    description: 'Вал кратера, на который ровер поднимается с 2023 года.',
  },
  {
    id: 'bradbury',
    name: 'Посадка Curiosity',
    kind: 'landing-site',
    regionId: 'gale',
    position: { lon: 137.4417, lat: -4.5895 },
    description: 'Площадка «Брэдбери», где Curiosity сел 6 августа 2012 года.',
  },
  {
    id: 'mount-sharp',
    name: 'Гора Шарп',
    kind: 'mountain',
    regionId: 'gale',
    position: { lon: 137.85, lat: -5.08 },
    description: 'Слоистая гора высотой около 5 км в центре кратера Гейл.',
  },
  {
    id: 'olympus-caldera',
    name: 'Кальдера Олимпа',
    kind: 'crater',
    regionId: 'olympus',
    position: { lon: -133.8, lat: 18.65 },
    description: 'Цепочка обрушившихся кратеров на вершине вулкана.',
  },
  {
    id: 'melas-floor',
    name: 'Дно каньона Мелас',
    kind: 'canyon',
    regionId: 'melas',
    position: { lon: -72.1, lat: -10.45 },
    description: 'Ровное дно с оползнями от стен каньона.',
  },
  {
    id: 'zhurong',
    name: 'Посадка Zhurong',
    kind: 'landing-site',
    regionId: 'utopia',
    position: { lon: 109.925, lat: 25.066 },
    description: 'Китайский ровер Zhurong сел здесь 14 мая 2021 года.',
  },
  {
    id: 'insight',
    name: 'Станция InSight',
    kind: 'landing-site',
    regionId: 'elysium',
    position: { lon: 135.6234, lat: 4.5024 },
    description: 'Сейсмическая станция InSight работала здесь с 2018 по 2022 год.',
  },
]
