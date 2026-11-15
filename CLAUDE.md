# NasaSpace

A web app for planning rover and astronaut routes across Mars, in 3D.

Competition rule: **every data value comes from NASA Mars Trek** (trek.nasa.gov). No synthetic
terrain, no mock numbers.

- `frontend/` — Vite + React 19 + TypeScript, Cesium (Mars ellipsoid), Zustand, Recharts, lucide-react.
- `backend/` — Java 25, Spring Boot 4 (package `com.example.nasaproject`), no database. A hex grid
  (`data/grid.geojson`, ~1° cells, western hemisphere for now) with slope from the team's zonal
  stats, plus elevation (MOLA), dust index and thermal inertia (TES) sampled from Trek tiles into
  `data/trek_layers.csv`. A* / Dijkstra over the grid with a cost model per mobility profile
  (rover, astronaut) and departure hour.
- Contract: `docs/CONTRACT-v1.md` ⇄ `frontend/src/api/types.ts`. Change them together.

The product is presented in English: all UI text, data, docs and code comments are English.

## Frontend layout

```
frontend/src/
├── map/        Cesium scene: Trek imagery (trek.ts), real MOLA terrain (terrain.ts), camera,
│               base-map switch, place labels, shared viewer (viewerRef.ts)
├── search/     search box, place list
├── place/      card for a named place or a clicked surface point (backend /cells/at)
├── route/      points A/B, plan request, route line, stats, profile chart, A* vs Dijkstra replay
├── layers/     Trek overlays (dust, thermal inertia), backend analysis layers, markers
├── timeline/   sol and local-time sliders, the Sun
├── api/        types.ts (contract), client.ts, places.ts (bundled gazetteer), sun.ts
├── store/      Zustand: one store, one slice per feature; useBackendBoot.ts
├── ui/         shared controls (primitives.tsx) — build UI only from these
└── styles/     tokens.css — every colour, spacing step and radius comes from here
```

## Rules

- The frontend talks to the backend at `VITE_API_URL` (dev default `http://localhost:9090`).
  Without a backend the map, Trek layers, search and sun readout still work; routing and
  surface analysis show a clear "route server is offline" state. There are no mocks.
- Map imagery and terrain come straight from Trek tile services (`map/trek.ts`). No Cesium ion.
- Each feature writes to its own folder. Shared files (`App.tsx`, `store/`, `ui/`, `styles/tokens.css`,
  `map/`, `api/`) are changed by the lead.
- `*OnMap` components add Cesium entities through `useViewer()` and must remove them in cleanup.
  Call `viewer.scene.requestRender()` after scene changes (requestRenderMode is on).
- Design: quiet graphite interface; only the terrain and the route are rich. The accent
  `--c-accent` (Martian sunset blue) is for the route and the current selection only.
  No gradients on chrome (data ramps in legends are fine), glows, emoji, all-caps labels or
  exclamation marks. Spacing on a 4px grid, lucide icons 16px stroke 1.5, sentence case.
- UI copy is English, short and plain; errors say what happened and what to do next.
- Models built on Trek data (surface temperature from thermal inertia, colour → value decoding)
  are simplifications: say so in the UI notes and docs, never present them as measurements.

## Commands

```bash
npm --prefix frontend run dev      # http://localhost:5173
npm --prefix frontend run build    # tsc + vite build
npm --prefix frontend run lint

# backend (needs JDK 25 + Maven, or Docker)
docker build -t nasaspace-backend backend && docker run --rm -p 9090:9090 nasaspace-backend
```

## Git

`main` is the deploy branch. Work on `feature/...` branches and merge through pull requests.
