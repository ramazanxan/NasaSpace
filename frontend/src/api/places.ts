import type { Place } from './types'

/**
 * Named places bundled with the app: IAU feature names and mission landing
 * sites, with their published coordinates. The route grid currently covers the
 * western hemisphere, so the featured list leads with places inside it.
 */
export const PLACES: Place[] = [
  {
    id: 'olympus-mons',
    name: 'Olympus Mons',
    kind: 'volcano',
    position: { lon: -133.8, lat: 18.65 },
    description: 'Tallest volcano in the Solar System: about 21 km above the datum, 600 km across, ringed by a cliff.',
    featured: true,
    viewRange: 1_600_000,
  },
  {
    id: 'valles-marineris',
    name: 'Valles Marineris',
    kind: 'canyon',
    position: { lon: -59.2, lat: -13.9 },
    description: 'Canyon system 4,000 km long and up to 7 km deep, cut along the flank of the Tharsis rise.',
    featured: true,
    viewRange: 2_600_000,
  },
  {
    id: 'tharsis-montes',
    name: 'Tharsis Montes',
    kind: 'volcano',
    position: { lon: -112.96, lat: 1.48 },
    description: 'Three shield volcanoes in a line: Ascraeus, Pavonis and Arsia Mons. Among the dustiest ground on Mars.',
    featured: true,
    viewRange: 2_400_000,
  },
  {
    id: 'chryse-planitia',
    name: 'Chryse Planitia',
    kind: 'plain',
    position: { lon: -40, lat: 28.4 },
    description: 'Smooth lowland where ancient outflow channels end. Viking 1 and Mars Pathfinder landed here.',
    featured: true,
    viewRange: 2_000_000,
  },
  {
    id: 'meridiani-planum',
    name: 'Meridiani Planum',
    kind: 'plain',
    position: { lon: -5.53, lat: -1.95 },
    description: 'Flat plain rich in hematite, explored by the Opportunity rover from 2004 to 2018.',
    featured: true,
    viewRange: 1_200_000,
  },
  {
    id: 'argyre-planitia',
    name: 'Argyre Planitia',
    kind: 'crater',
    position: { lon: -43, lat: -49.7 },
    description: 'Impact basin 1,800 km wide in the southern highlands, ringed by rugged mountains.',
    featured: true,
    viewRange: 2_200_000,
  },
  {
    id: 'ascraeus-mons',
    name: 'Ascraeus Mons',
    kind: 'volcano',
    position: { lon: -104.08, lat: 11.92 },
    description: 'Northernmost and tallest of the three Tharsis Montes, about 18 km high.',
  },
  {
    id: 'pavonis-mons',
    name: 'Pavonis Mons',
    kind: 'volcano',
    position: { lon: -112.96, lat: 1.48 },
    description: 'Middle Tharsis volcano, sitting almost exactly on the equator.',
  },
  {
    id: 'arsia-mons',
    name: 'Arsia Mons',
    kind: 'volcano',
    position: { lon: -120.09, lat: -8.35 },
    description: 'Southern Tharsis volcano with a caldera 110 km across.',
  },
  {
    id: 'alba-mons',
    name: 'Alba Mons',
    kind: 'volcano',
    position: { lon: -109.6, lat: 40.5 },
    description: 'Very wide, low volcano north of Tharsis, with gentle slopes of about one degree.',
  },
  {
    id: 'noctis-labyrinthus',
    name: 'Noctis Labyrinthus',
    kind: 'canyon',
    position: { lon: -101.3, lat: -6.9 },
    description: 'Maze of steep-walled valleys at the western end of Valles Marineris.',
  },
  {
    id: 'melas-chasma',
    name: 'Melas Chasma',
    kind: 'canyon',
    position: { lon: -72.7, lat: -10.4 },
    description: 'Widest part of Valles Marineris, with landslides spilling from the canyon walls.',
  },
  {
    id: 'kasei-valles',
    name: 'Kasei Valles',
    kind: 'canyon',
    position: { lon: -65, lat: 24.6 },
    description: 'Giant outflow channel system carved by ancient floods, running into Chryse Planitia.',
  },
  {
    id: 'viking-1',
    name: 'Viking 1 lander',
    kind: 'landing-site',
    position: { lon: -47.95, lat: 22.27 },
    description: 'First long-lived lander on Mars. It touched down on July 20, 1976 and worked for six years.',
  },
  {
    id: 'pathfinder',
    name: 'Mars Pathfinder',
    kind: 'landing-site',
    position: { lon: -33.22, lat: 19.13 },
    description: 'Landed on July 4, 1997 in Ares Vallis and released Sojourner, the first Mars rover.',
  },
  {
    id: 'opportunity',
    name: 'Opportunity landing site',
    kind: 'landing-site',
    position: { lon: -5.5266, lat: -1.9462 },
    description: 'Eagle crater, where Opportunity landed on January 25, 2004 and began a 45 km traverse.',
  },
  {
    id: 'phoenix',
    name: 'Phoenix lander',
    kind: 'landing-site',
    position: { lon: -125.7, lat: 68.22 },
    description: 'Landed on May 25, 2008 on the northern plains and dug up water ice.',
  },
  // Eastern hemisphere: visible on the map, outside the current route grid.
  {
    id: 'jezero',
    name: 'Jezero Crater',
    kind: 'crater',
    position: { lon: 77.4508, lat: 18.4447 },
    description: 'Ancient lake with a river delta. Perseverance landed here on February 18, 2021.',
    viewRange: 400_000,
  },
  {
    id: 'gale',
    name: 'Gale Crater',
    kind: 'crater',
    position: { lon: 137.4417, lat: -4.5895 },
    description: 'Crater with Mount Sharp at its center. Curiosity landed here on August 6, 2012.',
    viewRange: 500_000,
  },
  {
    id: 'hellas-planitia',
    name: 'Hellas Planitia',
    kind: 'crater',
    position: { lon: 70.5, lat: -42.4 },
    description: 'Deepest basin on Mars, with a floor more than 7 km below the datum.',
  },
  {
    id: 'elysium-mons',
    name: 'Elysium Mons',
    kind: 'volcano',
    position: { lon: 147.21, lat: 25.02 },
    description: 'Main volcano of the Elysium rise, about 12 km above the surrounding plains.',
  },
  {
    id: 'insight',
    name: 'InSight lander',
    kind: 'landing-site',
    position: { lon: 135.6234, lat: 4.5024 },
    description: 'Seismic station on Elysium Planitia that recorded marsquakes from 2018 to 2022.',
  },
  {
    id: 'zhurong',
    name: 'Zhurong landing site',
    kind: 'landing-site',
    position: { lon: 109.925, lat: 25.066 },
    description: 'The Chinese rover Zhurong landed on Utopia Planitia on May 14, 2021.',
  },
  {
    id: 'spirit',
    name: 'Spirit landing site',
    kind: 'landing-site',
    position: { lon: 175.4726, lat: -14.5684 },
    description: 'Gusev crater, where the Spirit rover landed on January 4, 2004.',
  },
]

/** Case-insensitive search over names and descriptions; names rank first. */
export function searchPlaces(text: string, limit = 8): Place[] {
  const needle = text.trim().toLowerCase()
  if (!needle) return PLACES.filter((p) => p.featured).slice(0, limit)
  const byName = PLACES.filter((p) => p.name.toLowerCase().includes(needle))
  const byText = PLACES.filter((p) => !byName.includes(p) && p.description.toLowerCase().includes(needle))
  return [...byName, ...byText].slice(0, limit)
}
