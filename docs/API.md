# NasaSpace API: contract for the Java backend

This document is for backend developers. Machine-readable version: [`openapi.yaml`](./openapi.yaml)
(OpenAPI 3.1). Frontend types: `frontend/src/api/types.ts`, calls:
`frontend/src/api/client.ts`. Reference behavior (in-browser mocks): `frontend/src/api/mock/`.

If this document and the code disagree, `types.ts` and `client.ts` are the source of truth. The contract changes
only simultaneously in `types.ts` and `openapi.yaml`.

## 1. Conventions

| What | Rule |
|---|---|
| Coordinates | Planetocentric degrees on the Mars ellipsoid. Longitude is positive **east**, range **-180..180** (not 0..360). Latitude -90..90. |
| bbox | `[west, south, east, north]` in degrees. The point-in-bbox check is inclusive of the borders (`>=`, `<=`). |
| Heights | Meters relative to the MOLA areoid (Mars "sea level"). May be negative (the Jezero floor is about -2600, the summit of Olympus about 21000+). |
| Distances | Meters. |
| Slopes | Degrees. |
| Durations | Martian days (sols). |
| Mars radius | 3,389,500 m (mean, IAU 2015); distances and meters per degree are computed on it. |
| Format | JSON, UTF-8. Fields in camelCase. All fields marked as required are always present. |

### Grid layout (terrain and layers)

- The grid covers the whole `bbox`; the outermost samples lie **on the bbox borders**
  (first column at `west`, last at `east`, first row at `north`, last at `south`).
- Order: row-major, **starting from the north-west corner**: index `i = row * width + col`.
  `row = 0` is the north edge, `col = 0` is the west edge.
- `heights.length == width * height` (same for `values` in layers).
- Node coordinates: `lon = west + col / (width - 1) * (east - west)`,
  `lat = north - row / (height - 1) * (north - south)`.
- The mocks serve 257 x 257. The size may differ and the frontend reads `width`/`height` from the response,
  but 257 is recommended (terrain and routing on the frontend are tuned for it).
- `resolution` is the ground distance between adjacent samples, in meters (the mocks compute it from the
  east-west step at the mid latitude of the region: `(east - west) / (width - 1) * (π/180 * R * cos(latMid))`).
- Heights in the mocks are integers, but the `number` type allows fractions.
- `/terrain` and `/layers` responses are large (about 66 thousand numbers); enable gzip.

### Errors

Every non-2xx response must have a JSON body:

```json
{ "code": "NOT_FOUND", "message": "Region atlantis not found" }
```

`message` is shown to the user as is. Write it in English, keep it short, and include a hint about
what to do next. If there is no body or it is not JSON, the frontend shows "Server error (status)".

## 2. Endpoints

In the examples `BASE=http://localhost:8080`.

### GET /regions

List of 5-6 modeled regions. The frontend shows it in the region list. Identifiers in the mocks:
`jezero`, `gale`, `olympus`, `melas`, `utopia`, `elysium`.

```bash
curl -s "$BASE/regions"
```

```json
[
  {
    "id": "jezero",
    "name": "Jezero Crater",
    "summary": "Ancient lake with a river delta, the Perseverance landing site",
    "bbox": [76.9, 17.9, 78.1, 18.9],
    "center": { "lon": 77.5, "lat": 18.4 },
    "baseHeight": -2600
  }
]
```

Region bboxes from the mocks:

| id | bbox [W, S, E, N] | center | baseHeight, m |
|---|---|---|---|
| jezero | 76.9, 17.9, 78.1, 18.9 | 77.5, 18.4 | -2600 |
| gale | 136.9, -5.9, 138.3, -4.3 | 137.55, -5.0 | -4500 |
| olympus | -134.9, 17.6, -132.7, 19.7 | -133.8, 18.65 | 21000 |
| melas | -73.4, -11.4, -70.8, -9.4 | -72.1, -10.4 | -3800 |
| utopia | 109.3, 24.6, 110.6, 25.6 | 109.95, 25.1 | -4100 |
| elysium | 135.0, 4.0, 136.2, 5.0 | 135.6, 4.5 | -2600 |

The `shape` and `relief` fields from the mocks are **not** part of the contract and must not be returned.

### GET /terrain/{regionId}

Region height grid (`TerrainGrid`).

```bash
curl -s "$BASE/terrain/jezero"
```

```json
{
  "regionId": "jezero",
  "bbox": [76.9, 17.9, 78.1, 18.9],
  "width": 257,
  "height": 257,
  "resolution": 263.2,
  "heights": [-2210, -2214, -2219, -2223]
}
```

(`heights` is abbreviated in the example: in reality it holds `width * height` values.)

Errors: `404 NOT_FOUND` for an unknown `regionId`.

### GET /layers/{regionId}/{kind}

`kind` is `slope` or `hazard`. The layout is the same as for terrain (same `bbox`, `width`, `height`).

- `slope`: slope in degrees at each node (in the mocks, central differences over heights with
  clamping at the grid edges, rounded to 0.1).
- `hazard`: hazard 0..1 (in the mocks `slope / 30 + rock noise`, clamped to 1).
  The formula is not part of the contract; the 0..1 range is what matters.

```bash
curl -s "$BASE/layers/jezero/slope"
```

```json
{
  "regionId": "jezero",
  "kind": "slope",
  "bbox": [76.9, 17.9, 78.1, 18.9],
  "width": 257,
  "height": 257,
  "values": [2.4, 3.1, 1.8, 0.9]
}
```

Errors: `404 NOT_FOUND` for an unknown region, `400 BAD_REQUEST` for an unknown `kind`.

### GET /places?q=&limit=

Place search. The frontend always sends `limit=8`. Matching in the mocks: case-insensitive substring
over `name` and `description`; an empty `q` returns the first `limit` places. An empty result is
`200 []`. The frontend may cancel the request (AbortController) while the user types quickly.

`height` and `slope` are the terrain values at the place position (bilinear sampling from the grid in the mocks).

```bash
curl -s "$BASE/places?q=Perseverance&limit=8"
```

```json
[
  {
    "id": "octavia-butler",
    "name": "Perseverance landing site",
    "kind": "landing-site",
    "regionId": "jezero",
    "position": { "lon": 77.4508, "lat": 18.4447 },
    "height": -2613,
    "slope": 1.8,
    "description": "The Octavia E. Butler landing site, where Perseverance landed on February 18, 2021."
  }
]
```

`kind`: `landing-site`, `crater`, `mountain`, `canyon`, `plain`, `feature`.

Errors: `400 BAD_REQUEST` for an invalid `limit` (not a number or less than 1).

### POST /route

Builds a route. Header `Content-Type: application/json`.

Modes (reference `mock/router.ts`, `MODE_LIMITS`):

| mode | max slope | meters per sol |
|---|---|---|
| rover | 20 degrees | 150 |
| astronaut | 30 degrees | 6000 |

```bash
curl -s -X POST "$BASE/route" \
  -H "Content-Type: application/json" \
  -d '{"regionId":"jezero","from":{"lon":77.4508,"lat":18.4447},"to":{"lon":77.38,"lat":18.5},"mode":"rover"}'
```

```json
{
  "regionId": "jezero",
  "mode": "rover",
  "points": [
    { "lon": 77.4508, "lat": 18.4447, "height": -2613, "distance": 0,    "slope": 1.8 },
    { "lon": 77.4414, "lat": 18.4492, "height": -2609, "distance": 1180, "slope": 3.2 },
    { "lon": 77.38,   "lat": 18.5,    "height": -2541, "distance": 9460, "slope": 4.7 }
  ],
  "stats": { "length": 9460, "ascent": 112, "descent": 44, "maxSlope": 11.3, "sols": 63.1 }
}
```

What the result must satisfy (as the reference does):

- `points[0]` and `points[last]` match `from` and `to` from the request in `lon`/`lat`; `distance` of the first point is 0,
  then the accumulated length along the route (meters, integers in the mocks).
- `height` and `slope` are taken from the terrain at the node.
- `stats.length` = `distance` of the last point; `ascent` and `descent` are the sums of positive and
  negative height differences between adjacent points (**both non-negative**, `descent` is a positive number);
  `maxSlope` is the maximum `slope` over the points; `sols = length / meters per sol`, rounded to 0.1.
- The route must not pass through nodes whose slope exceeds the mode limit.

Errors:

- `404 NOT_FOUND`: unknown `regionId`.
- `422 OUT_OF_REGION`: `from` or `to` is outside the region bbox ("Point is outside the region: pick a spot inside it").
- `422 UNREACHABLE`: the start or end point is steeper than the mode limit ("Point too steep: more than 20° for this mode"),
  or no path is found ("Target unreachable: steep slopes block every path").
- `400 BAD_REQUEST`: invalid body (missing fields, unknown `mode`, coordinates outside the allowed ranges).

### POST /route/debug?algorithm=astar|dijkstra

The same request as `/route`, plus the order in which search cells were expanded, for the A* vs Dijkstra comparison animation
(`algorithm` is required). The response is `RouteDebug`:

```bash
curl -s -X POST "$BASE/route/debug?algorithm=dijkstra" \
  -H "Content-Type: application/json" \
  -d '{"regionId":"jezero","from":{"lon":77.4508,"lat":18.4447},"to":{"lon":77.38,"lat":18.5},"mode":"rover"}'
```

```json
{
  "algorithm": "dijkstra",
  "visited": [[77.4508, 18.4447], [77.4555, 18.4447], [77.4508, 18.4494]],
  "route": null
}
```

- `visited`: `[lon, lat]` pairs in expansion order (the order they are popped from the queue). A* produces noticeably fewer than
  Dijkstra; this comparison is the reason the endpoint exists.
- `route` is a `Route` or `null`. **Difference from `/route`:** when no path is found, respond with `200` and `route: null`.
  The `OUT_OF_REGION` and `UNREACHABLE` errors for a start/end point that is too steep remain `422`, as in `/route`.
- The errors are the same as for `/route`; an unknown `algorithm` is `400 BAD_REQUEST`.

### GET /trails?regionId=

Region trails: edges of the road graph as polylines. In the mocks these are three `astronaut` mode routes
between fixed points of the region (identifiers like `jezero-t0`, names "Trail 1"). The backend is free to serve its own graph.

```bash
curl -s "$BASE/trails?regionId=jezero"
```

```json
[
  {
    "id": "jezero-t0",
    "regionId": "jezero",
    "name": "Trail 1",
    "points": [{ "lon": 77.08, "lat": 18.4 }, { "lon": 77.5, "lat": 18.41 }, { "lon": 77.92, "lat": 18.4 }]
  }
]
```

Errors: `404 NOT_FOUND` for an unknown region. If there are no trails, `200 []`.

### GET /sun?lon=&lat=&sol=&hour=

Sun position. `hour` is local mean solar time (LMST), hours 0..24, and is returned as `lmst`.
The frontend passes `sol` as a number. Reference math: the `sunState` function in `frontend/src/api/mock/index.ts`
(simplified Allison and McEwen 2000 model: solar longitude `Ls`, declination, hour angle).

```bash
curl -s "$BASE/sun?lon=77.45&lat=18.44&sol=120&hour=14.5"
```

```json
{ "sol": 120, "lmst": 14.5, "elevation": 38.2, "azimuth": 262.4, "hoursToSunset": 3.4 }
```

- `elevation`: degrees above the horizon, negative at night.
- `azimuth`: degrees clockwise from north, 0..360.
- `hoursToSunset`: hours until sunset, `null` if the Sun is below the horizon.
- Values are rounded to 0.1.

Errors: `400 BAD_REQUEST` for non-numeric or out-of-range values (`hour` outside 0..24, `lat` outside -90..90).

## 3. Error codes

| HTTP | code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Invalid request parameters or body: unknown `kind`, `mode`, `algorithm`; non-numeric `lon`/`lat`/`sol`/`hour`; missing required fields; malformed JSON. |
| 404 | `NOT_FOUND` | Unknown `regionId` (in the path or in the request/body `regionId`). Also an unknown path. |
| 422 | `OUT_OF_REGION` | `from` or `to` is outside the region bbox (routes only). |
| 422 | `UNREACHABLE` | The start or end point is steeper than the mode limit, or no path exists between the points (`/route` only; in `/route/debug` the second case gives `200` and `route: null`). |
| 500 | `INTERNAL` | Any unexpected error. The body is still `{code, message}`, never a stack trace. |

Do not use other `code` values: `ApiErrorCode` on the frontend is exactly these five values.

## 4. CORS

The frontend calls the backend from the browser on a different origin, so the backend must allow:

- the exact project domain on Vercel (production), for example `https://nasaspace.vercel.app`;
- preview deployments of this project only, using a pattern with the project name, for example `https://nasaspace-*-<team>.vercel.app`.
  Do **not** allow all of `*.vercel.app`: that would give access to any third-party site on Vercel;
- `http://localhost:5173` (Vite dev server).

In Spring use `allowedOriginPatterns` (not `allowedOrigins("*")`). Methods: `GET`, `POST`, `OPTIONS`.
Headers: `Content-Type`, `Accept`. `allowCredentials(false)`: cookies and authorization are not used.
A `POST` with `Content-Type: application/json` triggers a preflight `OPTIONS`, which must respond with `2xx`.
Move origins into configuration. CORS headers must also be present on error responses (including 429).
If authorization or cookies ever appear, allow only exact origins, with no patterns.

## 5. How the frontend switches from mocks to the backend

In `frontend/src/api/client.ts` the base URL comes from the `VITE_API_URL` environment variable
(trailing `/` are trimmed):

- `VITE_API_URL` empty or unset: everything runs on in-browser mocks (the default mode, no backend needed).
- `VITE_API_URL=http://localhost:8080`: the frontend makes real requests with `fetch(`${VITE_API_URL}${path}`)`.

Locally:

```bash
# frontend/.env.local
VITE_API_URL=http://localhost:8080
npm --prefix frontend run dev      # http://localhost:5173
```

On Vercel: the `VITE_API_URL` variable in the project settings (Environment Variables), whose value is the
public backend address. **In production it must be `https://`** (a page served over https cannot call http, the browser blocks it); a new deploy is needed after changing it (Vite inlines the value at build time).
Paths have no prefix: `GET {VITE_API_URL}/regions`, not `/api/regions`. If the backend lives under a prefix,
put it in `VITE_API_URL` itself (for example `https://host/api`).

If the request fails entirely (network, CORS, backend not running), the frontend shows
"The route server is not responding. Check that the backend is running".

### Generating types from Swagger

When the backend publishes OpenAPI (springdoc: `/v3/api-docs`), the frontend can regenerate the TypeScript types
with `openapi-typescript` (`frontend/package.json` has an `api:types` script:
`openapi-typescript ../docs/openapi.yaml -o src/api/schema.gen.ts`). You can point it at the backend's live Swagger
(`openapi-typescript http://localhost:8080/v3/api-docs -o src/api/schema.gen.ts`) and compare against `types.ts`.
For that, the backend OpenAPI must match `docs/openapi.yaml` in field names and schemas.

## 6. Checklist: verifying backend compatibility

1. [ ] `GET /regions` returns 5-6 regions; each has `id`, `name`, `summary`, `bbox` (4 numbers W,S,E,N), `center`, `baseHeight`.
2. [ ] `GET /terrain/{id}` for each region: `heights.length == width * height`, row-major order from the north-west corner,
   `bbox` matches the region, `resolution` in meters.
3. [ ] Terrain looks right visually: north is up (node `row=0` holds the north-edge heights), west is left. Check: in Gale, Mount Sharp lies east and south of the center.
4. [ ] `GET /layers/{id}/slope` and `/hazard`: same `width`/`height`/`bbox`, `slope` in degrees, `hazard` in 0..1.
5. [ ] `GET /places?q=&limit=8`: an empty `q` returns places, unknown text returns `[]` with `200`; each place has `height`, `slope`, `regionId`, `position`.
6. [ ] `POST /route` rover and astronaut in one region: the first/last point equal `from`/`to`, `distance` grows monotonically from 0,
   `stats.length` equals `distance` of the last point, `stats.sols` equals `length / 150` (rover) or `length / 6000` (astronaut), rounded to 0.1.
7. [ ] A rover route contains no points with `slope > 20`, an astronaut route none with `slope > 30`.
8. [ ] `POST /route` with a point outside the bbox gives `422 OUT_OF_REGION`; with a point on a steep slope gives `422 UNREACHABLE`; with an unknown region gives `404 NOT_FOUND`; with `mode: "x"` gives `400 BAD_REQUEST`.
9. [ ] `POST /route/debug?algorithm=astar` and `=dijkstra`: `visited` is non-empty, and A* has noticeably fewer entries than Dijkstra for the same pair of points; `route` has the same length (both are optimal).
10. [ ] `GET /trails?regionId=` returns an array of polylines `{id, regionId, name, points[]}` with points inside the bbox.
11. [ ] `GET /sun`: at night `elevation < 0` and `hoursToSunset: null`; by day `hoursToSunset` is a number; `lmst` equals the passed `hour`.
12. [ ] All 4xx/5xx errors are JSON `{code, message}` with one of the five codes, and `message` is in English.
13. [ ] CORS: `curl -i -X OPTIONS "$BASE/route" -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"`
    responds `2xx` with `Access-Control-Allow-Origin: http://localhost:5173`.
14. [ ] (review) Section 7 is done: bounds validation, rate limit, body size limit, no stack traces in responses. The backend Swagger (`/v3/api-docs`) is valid and matches `docs/openapi.yaml`; `openapi-typescript` generates types without errors, `tsc` on the frontend passes.
15. [ ] Frontend with `VITE_API_URL=http://localhost:8080`: open a region, build a route, enable the slope and hazard layers, search, trails and the Sun, with no errors in the console or the Network tab.

## 7. Security and limits

Recommendations for the backend. The backend is public and has no authorization, and route search is CPU-expensive.

- **Input validation**: Bean Validation on DTOs. `@Valid` on `@RequestBody`, `@Validated` on controllers with parameters.
  `@DecimalMin/@DecimalMax` for `lon` (-180..180), `lat` (-90..90), `sol` (0..100000), `hour` (0..24);
  `@Min(1) @Max(50)` for `limit`; `@Size(max = 100)` for `q`; `@Pattern(regexp = "^[a-z0-9-]{1,32}$")` for `regionId`;
  `@NotNull` on `mode`, `from`, `to`. Turn violations into `400 BAD_REQUEST`. The bounds are the same as in `openapi.yaml`.
- **Identical A and B**: if both points fall into the same grid node, respond `400 BAD_REQUEST`
  "Points A and B are too close: move one of them" (the mock does the same).
- **Concurrency limit**: a `Semaphore` on the number of simultaneous route searches (for example, the number of cores);
  when no slot is free, wait briefly and respond `429`.
- **Per-IP rate limit** (for example, Bucket4j): about 10 requests/s on `/route`, 1 request/s on `/route/debug`
  (it is heavier and returns up to 100,000 cells). Respond `429` with `{code, message}` and a `Retry-After` header.
  For 429 use the code `TOO_MANY_REQUESTS` and the `Retry-After` header. Example message: "Too many requests. Wait a second and try again".
  Behind a proxy, take the real IP from a trusted `X-Forwarded-For`, not from an arbitrary client header.
- **Body size**: reject POSTs larger than 4 KB (`413` or `400`); a normal request is about 150 bytes.
- **Search timeout**: bound the time of a single search (for example, 5-10 s); on expiry respond `500 INTERNAL` with a generic message.
- **Cache** results by key `(regionId, rounded from/to, mode)`; rounding to the grid node, for example.
  Grids are immutable, so the cache is safe.
- **Errors**: `server.error.include-stacktrace=never`, `server.error.include-message=never` (your own messages come from `@RestControllerAdvice`).
  Do not put raw user input (region id, search string) into `message`: use fixed texts.
  For `NOT_FOUND`, prefer "Region not found" over "Region <input> not found".
- **Swagger**: disable `/swagger-ui.html` and `/v3/api-docs` in production (`springdoc.api-docs.enabled=false`,
  `springdoc.swagger-ui.enabled=false`) or leave them on deliberately for a demo.
- **Actuator**: do not expose it without restrictions; if needed, only `health`, and not on the public interface.
- **Logs**: access logs without request bodies and without excess personal data.
- **Transport**: HTTPS only in production; CORS per section 4.
