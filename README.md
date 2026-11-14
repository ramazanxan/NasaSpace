# NasaSpace

Route planning for rovers and astronauts across real Martian terrain, in 3D.

- **Frontend** — [`frontend/`](frontend/): Vite, React, TypeScript, Cesium. Runs on built-in mock data until the backend is connected.
- **Backend** — Java (route algorithms, terrain grid, points). Contract: [`docs/API.md`](docs/API.md), [`docs/openapi.yaml`](docs/openapi.yaml), notes in [`backend/README.md`](backend/README.md).

## Quick start

```bash
git clone https://github.com/ramazanxan/NasaSpace.git
cd NasaSpace/frontend
npm install
npm run dev
```

## How we work

See [CONTRIBUTING.md](CONTRIBUTING.md).
