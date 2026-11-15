# NasaSpace backend (Java)

Backend of the Mars route planner. Contract with the frontend:
[`docs/API.md`](../docs/API.md) (human-readable description) and [`docs/openapi.yaml`](../docs/openapi.yaml) (OpenAPI 3.1).
Implement exactly these endpoints, without additional fields.

## Recommended stack

- Java 25, Spring Boot 4 (Spring MVC and validation)
- springdoc-openapi (`springdoc-openapi-starter-webmvc-ui`): Swagger UI at `/swagger-ui.html`,
  OpenAPI JSON at `/v3/api-docs`. The frontend can generate types from it via `openapi-typescript`.
- Maven or Gradle, JUnit 5 for tests.
- No database: everything is kept in memory.

## Package structure

```
com.nasaspace
├── api/        REST controllers, DTOs (records), ApiErrorBody, @RestControllerAdvice, CORS
├── terrain/    loading height grids into memory, TerrainGrid, slope/hazard layers
├── routing/    A*, Dijkstra, cost model, rover/astronaut modes, trails
├── places/     place list and search
└── sun/        Sun position (sunState)
```

## DTOs (records, fields one-to-one with the contract)

```java
public record LonLat(double lon, double lat) {}

public record RoutePoint(
    double lon,
    double lat,
    double height,    // m from the MOLA areoid
    double distance,  // m from the route start, 0 for the first point
    double slope      // degrees
) {}

public record RouteStats(
    double length,    // m
    double ascent,    // m, total ascent
    double descent,   // m, total descent (a positive number)
    double maxSlope,  // degrees
    double sols       // length / meters per sol of the mode, rounded to 0.1
) {}

public enum TravelMode { rover, astronaut } // lowercase in JSON: "rover" / "astronaut"

public record Route(
    String regionId,
    TravelMode mode,
    List<RoutePoint> points,
    RouteStats stats
) {}

public record RouteRequest(String regionId, LonLat from, LonLat to, TravelMode mode) {}

public record RouteDebug(String algorithm, List<double[]> visited, Route route) {} // route may be null

public record ApiErrorBody(String code, String message) {}
```

JSON field names are camelCase, as in the records. `ApiErrorBody.code` is one of:
`OUT_OF_REGION`, `UNREACHABLE`, `BAD_REQUEST`, `NOT_FOUND`, `INTERNAL`.
`TravelMode` values are lowercase in JSON (`rover`, `astronaut`), so it is best to name the constants the same way or
use `@JsonValue`/`@JsonProperty`. The `RouteDebug.route` field must serialize as `null`, not be omitted.

Errors: throw your own `ApiException(status, code, message)` and convert it to `ApiErrorBody` in a single
`@RestControllerAdvice`. Also catch validation errors, malformed JSON and unknown paths (`BAD_REQUEST`/`NOT_FOUND`)
and any unhandled exception (`INTERNAL`): the frontend expects `{code, message}` on every non-2xx response.

## CORS

Allow: the exact project domain on Vercel, preview deployments of this project only, by pattern
(for example, `https://nasaspace-*-<team>.vercel.app`), and `http://localhost:5173`.
Do **not** allow all of `*.vercel.app`. Methods GET/POST/OPTIONS, headers Content-Type/Accept, `allowCredentials(false)`.
If authorization appears, use exact origins only. Move the values into configuration:

```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Value("${nasaspace.cors.origin-patterns:http://localhost:5173}")
    private String[] originPatterns; // https://nasaspace.vercel.app, https://nasaspace-*-<team>.vercel.app

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns(originPatterns)
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("Content-Type", "Accept")
                .allowCredentials(false);
    }
}
```

In production the frontend must call the backend over `https://` (`VITE_API_URL`).

## In-memory grids (no database)

- At startup, load one height grid per region (5-6 of them) and keep them in a `Map<String, TerrainGrid>`.
  Recommended size is 257 x 257, `double[]` or `float[]` in row-major order from the north-west corner
  (`i = row * width + col`), as in the API response.
- Compute slope once at load time (central differences, edges clamped) and cache it; the `hazard` layer too.
- Data source: files in resources (for example, GeoTIFF/PNG/binary `.bin` files with MOLA/HiRISE data, cut to the region bbox)
  or synthetic data for now. All objects are immutable after loading, so they are thread-safe without locks.
- `/terrain` and `/layers` responses are about 66 thousand numbers: enable gzip (`server.compression.enabled=true`,
  `server.compression.mime-types=application/json`).
- Keep places (`places`) and the region list as a static in-memory list; take a place's `height`/`slope`
  from bilinear sampling of the grid.
- Distances are computed on a sphere of radius 3,389,500 m.
- Coordinates in responses: longitude -180..180, east is positive.

## Reference algorithm

The reference routing implementation lives in the frontend: `frontend/src/api/mock/router.ts`
(grid search with a step of 2 through a node, 8 neighbors, cost model, mode limits
rover 20 degrees / 150 m per sol and astronaut 30 degrees / 6000 m per sol, `OUT_OF_REGION` and `UNREACHABLE` errors).
It also defines the `visited` format for `/route/debug`. Other reference points:

- `frontend/src/api/mock/terrain.ts`: grid layout and slope computation;
- `frontend/src/api/mock/index.ts`: place search, `/trails`, `/sun` math;
- `frontend/src/map/geo.ts`: `toGrid`/`fromGrid`, distance on a sphere, bilinear sampling.

You may improve the algorithm, but the response contract (fields, units, errors) must not change without editing
`frontend/src/api/types.ts` and `docs/openapi.yaml` at the same time.

## Security and limits

Detailed list: section 7 in [`docs/API.md`](../docs/API.md). In short:

- Bean Validation on DTOs (`@Valid`, `@DecimalMin/@DecimalMax`, `@Pattern("^[a-z0-9-]{1,32}$")` for `regionId`,
  `@Size`/`@Min`/`@Max` for `q` and `limit`); bounds as in `docs/openapi.yaml`.
- A `Semaphore` on concurrent route searches, a timeout for a single search, a cache by `(region, rounded from/to, mode)`.
- Per-IP rate limit (for example, Bucket4j): about 10 requests/s on `/route`, 1 request/s on `/route/debug`; respond 429.
- Reject POSTs with a body larger than 4 KB (`server.tomcat.max-swallow-size`, a filter on `Content-Length`).
- `server.error.include-stacktrace=never`; do not return raw input in `message`.
- Disable Swagger UI and `/v3/api-docs` in production or leave them on deliberately for a demo; do not expose actuator without restrictions.
- Access logs without request bodies.

## Compatibility check

The checklist is at the end of [`docs/API.md`](../docs/API.md), section "Checklist: verifying backend compatibility".
