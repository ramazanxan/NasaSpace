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
import type { LonLat } from '../api/types'

export const ROVER_ENTITY_PREFIX = 'rover:'

export interface Rover {
  id: string
  name: string
  position: LonLat
  /** Future glTF model, served from public/models. Not shipped yet. */
  model: string
}

export const ROVERS: Rover[] = [
  { id: 'perseverance', name: 'Perseverance', position: { lon: 77.4508, lat: 18.4447 }, model: '/models/perseverance.glb' },
  { id: 'curiosity', name: 'Curiosity', position: { lon: 137.4417, lat: -4.5895 }, model: '/models/curiosity.glb' },
]

/** A small rover silhouette on a dark disc: body, mast with camera head, rocker legs, three wheels. */
const ROVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32">
<circle cx="16" cy="16" r="14.5" fill="#15171a" fill-opacity="0.78" stroke="#ece8e1" stroke-opacity="0.45"/>
<g fill="none" stroke="#ece8e1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
<rect x="8" y="13" width="13" height="4.5" rx="1"/>
<path d="M18.5 13V8.5"/>
<rect x="17" y="6.5" width="5" height="2.5" rx="0.6"/>
<path d="M10 17.5 8.8 20.5M15 17.5v3M20 17.5l1.6 3"/>
<circle cx="8.8" cy="22" r="1.6"/>
<circle cx="15" cy="22" r="1.6"/>
<circle cx="21.6" cy="22" r="1.6"/>
</g>
</svg>`

const ROVER_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ROVER_SVG)}`

const LABEL = Color.fromCssColorString('#ece8e1')
const LABEL_OUTLINE = Color.fromCssColorString('#14161a').withAlpha(0.8)

/** Billboard + label, clamped to the ground and readable from orbit down to a few km. */
export function roverEntity(r: Rover): Entity.ConstructorOptions {
  return {
    id: `${ROVER_ENTITY_PREFIX}${r.id}`,
    name: r.name,
    position: Cartesian3.fromDegrees(r.position.lon, r.position.lat, 0, Ellipsoid.MARS),
    billboard: {
      image: ROVER_ICON,
      width: 32,
      height: 32,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      scaleByDistance: new NearFarScalar(5_000, 1, 2e7, 0.7),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: r.name,
      font: '500 12px "Schibsted Grotesk", system-ui, sans-serif',
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

/*
 * TODO(rover-models): swap the billboard for a glTF model once the .glb files
 * land in public/models (not downloaded yet). Usage in LayersOnMap:
 *   viewer.entities.add(roverModelEntity(r))
 * Keep the billboard for far zoom (distanceDisplayCondition) and show the
 * model only close up, so the rover is still findable from orbit.
 */
export function roverModelEntity(r: Rover): Entity.ConstructorOptions {
  return {
    id: `${ROVER_ENTITY_PREFIX}${r.id}:model`,
    name: r.name,
    position: Cartesian3.fromDegrees(r.position.lon, r.position.lat, 0, Ellipsoid.MARS),
    model: {
      uri: r.model,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      minimumPixelSize: 48,
      maximumScale: 2000,
    },
  }
}
