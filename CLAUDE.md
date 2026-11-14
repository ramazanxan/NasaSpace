# NasaSpace

A web app for planning rover and astronaut routes across Martian terrain.
Team: one frontend developer (this repository, `frontend/`) and a Java backend team
(route algorithms, terrain grid, points; no database). Frontend and backend meet at the end
through the contract in `frontend/src/api/types.ts` and `docs/openapi.yaml`.

The product is presented in English: all UI text, data, docs and code comments are English.

## Frontend stack

Vite + React 19 + TypeScript, Cesium (Mars ellipsoid, NASA Mars Trek imagery),
Zustand, Recharts, lucide-react. No Cesium ion, so no key is needed.

```
frontend/src/
├── map/        Cesium scene, camera, terrain, shared viewer (viewerRef.ts)
├── search/     search box, region list
├── place/      place card
├── route/      points A/B, route line, stats, elevation profile
├── layers/     slope/hazard layers, trails, rovers
├── timeline/   sols, the Sun
├── api/        types.ts (contract), modes.ts, client.ts, mock/ (backend in the browser)
├── store/      Zustand: one store, one slice per feature
├── ui/         shared controls (primitives.tsx) — build UI only from these
└── styles/     tokens.css — every colour, spacing step and radius comes from here
```

## Rules

- While `VITE_API_URL` is empty everything runs on the mocks in `api/mock/`. The frontend never waits for the backend.
- The API contract changes only in `api/types.ts` and `docs/openapi.yaml` together.
- We model 5–6 regions (`api/mock/regions.ts`); the rest of Mars is imagery only.
- Each feature writes to its own folder. Shared files (`App.tsx`, `store/`, `ui/`, `styles/tokens.css`,
  `map/`) are changed by the lead.
- `*OnMap` components add Cesium entities through `useViewer()` and must remove them in cleanup.
  Call `viewer.scene.requestRender()` after scene changes (requestRenderMode is on).
- Design: quiet graphite interface; only the terrain and the route are rich. The accent
  `--c-accent` (Martian sunset blue) is for the route and the current selection only.
  No gradients, glows, emoji, all-caps labels or exclamation marks.
  Spacing on a 4px grid, lucide icons 16px stroke 1.5, sentence case.
- UI copy is English, short and plain; errors say what happened and what to do next.

## Commands

```bash
npm --prefix frontend run dev      # http://localhost:5173
npm --prefix frontend run build    # tsc + vite build
npm --prefix frontend run lint
```

## Git

`main` is the deploy branch. Work on `feature/...` branches and merge through pull requests.
