import {
  Cartesian2,
  Cartesian3,
  Color,
  Ellipsoid,
  HeightReference,
  HorizontalOrigin,
  LabelStyle,
  NearFarScalar,
  VerticalOrigin,
  type Entity,
} from 'cesium'
import { PLACE_ENTITY_PREFIX } from '../map/annotations'
import { PLACES } from '../api/places'
import type { Place } from '../api/types'

/**
 * Markers for the mission landing sites in the bundled places list.
 *
 * Entity ids use the place prefix, so a click opens the place card through the
 * map's own click handler. Featured places already carry a label from
 * map/annotations and are skipped here to keep ids unique.
 */
export const LANDING_SITES: Place[] = PLACES.filter((p) => p.kind === 'landing-site' && !p.featured)

/** Sites where a rover drove off; the rest are stationary landers. */
const ROVER_SITES = new Set(['opportunity', 'spirit', 'zhurong'])

const disc = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32">
<circle cx="16" cy="16" r="14.5" fill="#15171a" fill-opacity="0.78" stroke="#ece8e1" stroke-opacity="0.45"/>
<g fill="none" stroke="#ece8e1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</g>
</svg>`

/** Rover silhouette: body, mast with camera head, rocker legs, three wheels. */
const ROVER_SVG = disc(`<rect x="8" y="13" width="13" height="4.5" rx="1"/>
<path d="M18.5 13V8.5"/>
<rect x="17" y="6.5" width="5" height="2.5" rx="0.6"/>
<path d="M10 17.5 8.8 20.5M15 17.5v3M20 17.5l1.6 3"/>
<circle cx="8.8" cy="22" r="1.6"/>
<circle cx="15" cy="22" r="1.6"/>
<circle cx="21.6" cy="22" r="1.6"/>`)

/** Lander silhouette: deck, antenna dish, three splayed legs with footpads. */
const LANDER_SVG = disc(`<path d="M10 15h12l-1.5 3h-9z"/>
<path d="M16 15v-3.5"/>
<path d="M13 9.5a3 3 0 0 0 6 0z"/>
<path d="M11.5 18 8.5 23M16 18v5M20.5 18l3 5"/>
<path d="M7.5 23h2M15 23h2M22.5 23h2"/>`)

const icon = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
const ROVER_ICON = icon(ROVER_SVG)
const LANDER_ICON = icon(LANDER_SVG)

const LABEL = Color.fromCssColorString('#ece8e1')
const LABEL_OUTLINE = Color.fromCssColorString('#14161a').withAlpha(0.8)

/** Billboard + label, clamped to the ground and readable from orbit down to a few km. */
export function landingSiteEntity(p: Place): Entity.ConstructorOptions {
  return {
    id: `${PLACE_ENTITY_PREFIX}${p.id}`,
    name: p.name,
    position: Cartesian3.fromDegrees(p.position.lon, p.position.lat, 0, Ellipsoid.MARS),
    billboard: {
      image: ROVER_SITES.has(p.id) ? ROVER_ICON : LANDER_ICON,
      width: 32,
      height: 32,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      scaleByDistance: new NearFarScalar(5_000, 1, 2e7, 0.7),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: p.name,
      font: '500 12px "Geologica", system-ui, sans-serif',
      fillColor: LABEL,
      outlineColor: LABEL_OUTLINE,
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: HorizontalOrigin.LEFT,
      verticalOrigin: VerticalOrigin.CENTER,
      pixelOffset: new Cartesian2(20, 0),
      heightReference: HeightReference.CLAMP_TO_GROUND,
      scaleByDistance: new NearFarScalar(5_000, 1, 2e7, 0.85),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }
}
