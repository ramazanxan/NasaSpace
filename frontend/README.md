# NasaSpace — frontend

Route planning for rovers and astronauts across the 3D terrain of Mars.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

Without a backend everything runs on built-in mocks (`src/api/mock/`). To connect the Java backend:

```bash
cp .env.example .env.local
# VITE_API_URL=http://localhost:8080
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | type check and build into `dist/` |
| `npm run lint` | oxlint |
| `npm run api:types` | generate types from `../docs/openapi.yaml` into `src/api/schema.gen.ts` |

## Deploy

Vercel: Root Directory is `frontend`; everything else comes from `vercel.json`.
The `VITE_API_URL` environment variable is the backend address. No Cesium ion key is needed:
the basemap is open NASA Mars Trek tiles, the terrain comes from our API.

Structure and rules are in [../CLAUDE.md](../CLAUDE.md); the API contract is in [../docs/API.md](../docs/API.md).
