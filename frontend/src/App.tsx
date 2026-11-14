import { MarsViewer } from './map/MarsViewer'
import { TerrainControls } from './map/TerrainControls'
import { Brand } from './ui/Brand'
import { SearchBox } from './search/SearchBox'
import { RegionList } from './search/RegionList'
import { PlaceCard } from './place/PlaceCard'
import { RoutePanel } from './route/RoutePanel'
import { RouteOnMap } from './route/RouteOnMap'
import { LayersControl } from './layers/LayersControl'
import { LayersOnMap } from './layers/LayersOnMap'
import { SolTimeline } from './timeline/SolTimeline'

/**
 * Screen layout. Each feature folder owns its component; this file only
 * places them. `*OnMap` components render nothing in the DOM — they add
 * and remove Cesium entities for their feature.
 */
export function App() {
  return (
    <div className="app">
      <MarsViewer />

      <aside className="panel panel--left" aria-label="Search and places">
        <Brand />
        <SearchBox />
        <PlaceCard />
        <RegionList />
      </aside>

      <aside className="panel panel--right" aria-label="Route">
        <RoutePanel />
      </aside>

      <div className="map-tools">
        <TerrainControls />
        <LayersControl />
      </div>

      <div className="dock">
        <SolTimeline />
      </div>

      <RouteOnMap />
      <LayersOnMap />
    </div>
  )
}
