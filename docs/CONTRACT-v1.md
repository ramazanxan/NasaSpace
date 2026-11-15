# Backend contract v1 (working draft, source of truth while the refit is in progress)

Base URL: `http://localhost:9090/api/v1`. JSON, UTF-8. All text in English.
Coordinates: `[lon, lat]` degrees, lon east-positive in −180..180 (ESRI:104905).
Errors: non-2xx with `{ "error": "<CODE>", "message": "<human text>" }`.

Every number the backend uses comes from NASA Mars Trek (trek.nasa.gov):

| Indicator | Trek layer | How it is read |
|---|---|---|
| Slope (mean, stdev) | hex grid `data/grid.geojson` (team zonal stats) | degrees |
| Elevation | `mola128_mola64_merge_90Nto90S_SimpleC_clon0` (MGS MOLA Global DEM), 8-bit grey tiles | linear −8201 m … +21229 m |
| Dust | `tes_ruffdust` (MGS TES Global Dust Index), colour tiles | hue → 0 (dust-free) … 1 (dust-covered); grey = no data |
| Thermal inertia | `TES_Thermal_Inertia` (MGS TES Global Thermal Inertia), colour tiles | hue → 0 … 1, reported as ≈ 30 … 800 J m⁻² K⁻¹ s⁻½; transparent = no data |

Tile URL: `https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{row}/{col}.png`
(geographic tiling, 2×1 tiles of 256 px at z=0, row 0 at the north).

## GET /grid/info

```json
{
  "ready": true,
  "cellCount": 37648,
  "bbox": [-180.0, -90.0, 0.42, 90.0],
  "hexEdgeMeters": 34200.0,
  "mapCrs": "urn:ogc:def:crs:ESRI::104905",
  "coordinateOrder": "[lon, lat] (x, y), degrees",
  "layers": { "slope": true, "elevation": true, "dust": true, "thermalInertia": true },
  "profiles": [
    { "id": "rover", "label": "Rover", "maxSlopeDeg": 15.0, "slopeSigmaMargin": 2.0,
      "maxDustIndex": null, "minSurfaceTempC": -95.0, "metersPerSol": 150.0 },
    { "id": "astronaut", "label": "Astronaut", "maxSlopeDeg": 25.0, "slopeSigmaMargin": 2.0,
      "maxDustIndex": 0.7, "minSurfaceTempC": -80.0, "metersPerSol": 6000.0 }
  ],
  "dataSources": [ { "id": "dust", "title": "MGS TES, Global Dust Index", "trekLayer": "tes_ruffdust", "note": "…" } ],
  "modelNotes": [ "…" ]
}
```

## POST /routes/plan

Request (start/goal by coordinates or by cell id; id wins):

```json
{ "start": { "lon": -133.8, "lat": 18.6 }, "goal": { "lon": -72.1, "lat": -10.4 },
  "mode": "rover", "departureHour": 13.0, "algorithm": "astar", "includeVisited": false }
```

`mode`: `rover` (default) | `astronaut`. `departureHour`: local solar time 0..24 (default 12).
`algorithm`: `astar` (default) | `dijkstra`. `includeVisited`: return expanded cells for the replay.

Response 200 (also for "no route": `status: "NO_ROUTE"`):

```json
{
  "status": "OK", "reason": null, "blockedBy": null, "message": null,
  "mapCrs": "…", "coordinateOrder": "…",
  "startCellId": "3681", "goalCellId": "9120",
  "mode": "rover", "departureHour": 13.0, "algorithm": "astar",
  "route": {
    "geometry": { "type": "LineString", "coordinates": [[-133.8, 18.6], …] },
    "cellIds": ["3681", …],
    "cells": [ { "cellId": "3681", "lon": -133.8, "lat": 18.6, "distanceFromStartM": 0.0,
                 "elevationM": 21000.0, "slopeMeanDeg": 1.2, "slopeWithMarginDeg": 3.4,
                 "dustIndex": 0.82, "thermalInertia": 95.0, "surfaceTempC": -21.5,
                 "costFactor": 1.9, "riskLevel": "MODERATE" } ],
    "segments": [ { "index": 0, "fromCellId": "…", "toCellId": "…", "distanceMeters": 59000.0,
                    "weightedCostMeters": 112000.0, "slopeMeanDeg": 1.2, "slopeStdevDeg": 1.1,
                    "slopeWithMarginDeg": 3.4, "riskLevel": "LOW" } ]
  },
  "metrics": { "distanceMeters": 0, "weightedCostMeters": 0, "maxSlopeWithMarginDeg": 0,
               "averageSlopeDeg": 0, "riskLevel": "LOW", "cellCount": 0, "maxAllowedSlopeDeg": 15,
               "ascentMeters": 0, "descentMeters": 0, "travelSols": 0,
               "maxDustIndex": 0, "minSurfaceTempC": 0, "maxSurfaceTempC": 0, "expandedCells": 0 },
  "visited": [[-133.8, 18.6], …],
  "warnings": ["…"]
}
```

`reason` on NO_ROUTE: `START_BLOCKED` | `GOAL_BLOCKED` | `NO_CONNECTION`.
`blockedBy` for a blocked start/goal: `SLOPE` | `DUST` | `COLD` | `NO_DATA`.
Null numeric fields mean "no data for this cell". `visited` is present only when requested.

## GET /cells/at?lon=&lat=&hour=

```json
{ "cellId": "3681", "center": { "lon": -133.8, "lat": 18.6 },
  "elevationM": 21000.0, "slopeMeanDeg": 1.2, "slopeStdevDeg": 1.1, "slopeWithMarginDeg": 3.4,
  "dustIndex": 0.82, "thermalInertia": 95.0, "surfaceTempC": -21.5, "hour": 13.0,
  "profiles": { "rover":     { "passable": true,  "blockedBy": null,   "costFactor": 1.9 },
                "astronaut": { "passable": false, "blockedBy": "DUST", "costFactor": null } } }
```

## GET /layers

```json
{ "bbox": [-180.0, -90.0, 0.42, 90.0],
  "layers": [ { "id": "risk", "title": "Traversability", "unit": "", "description": "…", "howToRead": "…",
                "source": "…", "timeDependent": true, "modeDependent": true,
                "stops": [ { "value": 1.0, "color": "#2f6f4f", "label": "easy" } ] } ] }
```

Layer ids: `risk`, `slope`, `dust`, `thermal-inertia`, `temperature`, `elevation`.

## GET /layers/{id}.png?mode=rover&hour=13

`image/png`, RGBA, equirectangular, covering exactly the `bbox` from `/layers`, hexagons drawn
cell by cell, transparent where there is no data. `mode`/`hour` matter only for `risk` and
`temperature`. Width 2048 px by default.

## Error codes

| HTTP | error |
|---|---|
| 400 | `EMPTY_REQUEST`, `INVALID_JSON`, `MISSING_POINT`, `INVALID_COORDINATES`, `INVALID_PARAMETER`, `POINT_OUTSIDE_GRID` |
| 404 | `CELL_NOT_FOUND`, `LAYER_NOT_FOUND` |
| 429 | `RATE_LIMITED` |
| 503 | `GRID_NOT_READY` |
| 500 | `INTERNAL_ERROR` |
