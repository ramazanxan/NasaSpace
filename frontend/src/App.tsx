import { MarsViewer } from './map/MarsViewer'
import { BasemapSwitch } from './map/BasemapSwitch'
import { TerrainControls } from './map/TerrainControls'
import { Brand } from './ui/Brand'
import { SearchBox } from './search/SearchBox'
import { PlaceList } from './search/PlaceList'
import { PlaceCard } from './place/PlaceCard'
import { RoutePanel } from './route/RoutePanel'
import { RouteOnMap } from './route/RouteOnMap'
import { LayersControl } from './layers/LayersControl'
import { LayersOnMap } from './layers/LayersOnMap'
import { SolTimeline } from './timeline/SolTimeline'
import { FirstPersonView } from './fpv/FirstPersonView'
import { WalkView } from './fpv/WalkView'
import { LocateControl, MeOnMap } from './fpv/LocateControl'
import { useBackendBoot } from './store/useBackendBoot'

/**
 * Screen layout. Each feature folder owns its component; this file only
 * places them. `*OnMap` components render nothing in the DOM — they add
 * and remove Cesium entities for their feature.
 */
export function App() {
  useBackendBoot()
  return (
    <div className="app">
      <MarsViewer />

      <aside className="panel panel--left" aria-label="Search and places">
        <Brand />
        <SearchBox />
        <PlaceCard />
        <PlaceList />
      </aside>

      <aside className="panel panel--right" aria-label="Route">
        <RoutePanel />
      </aside>

      <div className="map-tools">
        <BasemapSwitch />
        <TerrainControls />
        <LocateControl />
        <LayersControl />
      </div>

      <div className="dock">
        <SolTimeline />
      </div>

      <RouteOnMap />
      <FirstPersonView />
      <WalkView />
      <MeOnMap />
      <LayersOnMap />
    </div>
  )
}
