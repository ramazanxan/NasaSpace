package com.example.nasaproject;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * Wraps HexAStar: turns a frontend request into cell indices, runs the search with the requested
 * profile/hour/algorithm and assembles the response. The cost formula and the search stay in HexAStar.
 */
@Service
public class RoutingService {

    public static final String MAP_CRS = "urn:ogc:def:crs:ESRI::104905";
    public static final String COORDINATE_ORDER = "[lon, lat] (x, y), degrees";

    /** Share of the slope limit used to colour the route. A display setting, not an engineering norm. */
    private static final double MODERATE_RATIO = 0.5;
    private static final double HIGH_RATIO = 0.8;
    /** Cost factor thresholds for the same colouring. */
    private static final double MODERATE_FACTOR = 1.5;
    private static final double HIGH_FACTOR = 2.5;

    private final GridLoader loader;
    private final Semaphore searches;

    public RoutingService(GridLoader loader, @Value("${mars.max-concurrent-searches:4}") int maxConcurrent) {
        this.loader = loader;
        this.searches = new Semaphore(Math.max(1, maxConcurrent));
    }

    // ---------- GET /grid/info ----------

    public GridInfo info() {
        boolean ready = loader.isReady();
        List<GridInfo.Profile> profiles = new ArrayList<>();
        for (MobilityProfile p : MobilityProfile.values())
            profiles.add(new GridInfo.Profile(p.id, p.label, p.maxSlopeDeg, p.slopeSigmaMargin, p.maxDustIndex,
                    p.minSurfaceTempC, p.metersPerSol));
        List<GridInfo.DataSource> sources = List.of(
                new GridInfo.DataSource("slope", "Slope statistics on the hex grid", "grid.geojson (team zonal statistics)",
                        "Mean and standard deviation of slope per cell, degrees."),
                new GridInfo.DataSource("elevation", "MGS MOLA Global DEM", TrekLayerImporter.MOLA,
                        "8-bit grey tiles at zoom 3, read linearly as -8201 m to +21229 m and averaged per cell."),
                new GridInfo.DataSource("dust", "MGS TES, Global Dust Index", TrekLayerImporter.DUST,
                        "Colour tiles at zoom 2; hue read as 0 (dust-free, blue) to 1 (dust-covered, red); grey = no data."),
                new GridInfo.DataSource("thermalInertia", "MGS TES, Global Thermal Inertia", TrekLayerImporter.THERMAL_INERTIA,
                        "Colour tiles at zoom 1; hue read as 0 (violet) to 1 (red) and reported as about 30 to 800 "
                                + "J m-2 K-1 s-1/2. Trek publishes no numeric legend, so the absolute scale is approximate."));
        List<String> notes = List.of(
                "Cost of a step = great-circle distance x cost factor. The factor is 1 plus uphill, downhill, "
                        + "roughness, dust, loose-ground and near-cold terms; every term is zero or positive.",
                "A cell is closed when slopeMean + 2 x slopeStdev exceeds the profile limit, when it has no slope data, "
                        + "when it is too dusty for an astronaut (dust index above 0.7) or too cold at the departure hour.",
                "Surface temperature is a simplified model built on the TES thermal inertia layer: "
                        + "T = 215 K - 50 K sin^2(lat) + (20 K + 60 K (1 - ti)) cos(2 pi (hour - 13) / 24). "
                        + "Loose, low-inertia ground is warm at midday and very cold at night; rock stays moderate.",
                "The departure-hour temperature is applied to the whole route; seasons and dust storms are not modelled.",
                "Prototype: a route is not verified safe without engineering validation.");
        return new GridInfo(ready, ready ? HexAStar.n : 0,
                ready ? new double[]{r4(HexAStar.minLon), r4(HexAStar.minLat), r4(HexAStar.maxLon), r4(HexAStar.maxLat)} : null,
                ready ? Math.round(HexAStar.HEX_EDGE * 10) / 10.0 : 0, MAP_CRS, COORDINATE_ORDER,
                new GridInfo.Layers(ready && HexAStar.hasSlope, ready && HexAStar.hasElev, ready && HexAStar.hasDust,
                        ready && HexAStar.hasTi),
                profiles, sources, notes);
    }

    // ---------- POST /routes/plan ----------

    public RouteResponse plan(RouteRequest req) {
        requireReady();
        if (req == null)
            throw new ApiException(HttpStatus.BAD_REQUEST, "EMPTY_REQUEST", "The request body is empty. Send start, goal and mode as JSON.");

        MobilityProfile profile = parseMode(req.mode());
        double hour = parseHour(req.departureHour());
        boolean dijkstra = parseAlgorithm(req.algorithm());
        boolean withVisited = Boolean.TRUE.equals(req.includeVisited());
        CostModel model = new CostModel(profile, hour);
        String algorithm = dijkstra ? "dijkstra" : "astar";

        List<String> warnings = new ArrayList<>();
        int s = resolve(req.startCellId(), req.start(), "start", warnings);
        int t = resolve(req.goalCellId(), req.goal(), "goal", warnings);

        // HexAStar only checks the cell being entered. Start and goal are checked explicitly.
        String sb = model.blockedBy(s);
        if (sb != null)
            return noRoute("START_BLOCKED", sb, "The start cell is closed to the " + profile.id + ": " + why(sb, model, s),
                    s, t, profile, hour, algorithm, null, warnings);
        String gb = model.blockedBy(t);
        if (gb != null)
            return noRoute("GOAL_BLOCKED", gb, "The goal cell is closed to the " + profile.id + ": " + why(gb, model, t),
                    s, t, profile, hour, algorithm, null, warnings);

        HexAStar.Result r;
        try {
            if (!searches.tryAcquire(300, TimeUnit.MILLISECONDS))
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED",
                        "Too many routes are being planned right now. Try again in a few seconds.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "RATE_LIMITED", "The server is shutting down. Try again later.");
        }
        try {
            r = HexAStar.search(s, t, model, !dijkstra, withVisited);
        } finally {
            searches.release();
        }
        List<double[]> visited = withVisited ? lonLat(r.visited) : null;
        if (r.path == null)
            return noRoute("NO_CONNECTION", null, "No path connects these cells through cells passable for the "
                    + profile.id + " at " + fmtHour(hour) + ". Try another departure hour, profile or points.",
                    s, t, profile, hour, algorithm, visited, warnings);

        return build(r, s, t, model, algorithm, visited, warnings);
    }

    // ---------- GET /cells/at ----------

    public Map<String, Object> cellAt(Double lon, Double lat, Double hourParam) {
        requireReady();
        if (lon == null || lat == null)
            throw new ApiException(HttpStatus.BAD_REQUEST, "MISSING_POINT", "Pass both lon and lat as query parameters.");
        double hour = parseHour(hourParam);
        double[] p = normalise(lon, lat, "point");
        int i = HexAStar.nearestCell(p[0], p[1]);
        if (i < 0)
            throw new ApiException(HttpStatus.BAD_REQUEST, "POINT_OUTSIDE_GRID",
                    "This point is outside the modelled area (lon -180 to 0). Pick a point in the western hemisphere.");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cellId", HexAStar.ids[i]);
        out.put("center", Map.of("lon", r4(HexAStar.ocx[i]), "lat", r4(HexAStar.ocy[i])));
        CostModel rover = new CostModel(MobilityProfile.ROVER, hour);
        out.put("elevationM", num(HexAStar.elev[i], 1));
        out.put("slopeMeanDeg", num(HexAStar.slope[i], 2));
        out.put("slopeStdevDeg", num(HexAStar.sigma[i], 2));
        out.put("slopeWithMarginDeg", num(rover.slopeWithMargin(i), 2));
        out.put("dustIndex", num(HexAStar.dust[i], 3));
        out.put("thermalInertia", num(HexAStar.ti[i], 0));
        out.put("surfaceTempC", Double.isNaN(HexAStar.tiNorm[i]) ? null : num(rover.tempK(i) - CostModel.KELVIN, 1));
        out.put("hour", hour);
        Map<String, Object> profiles = new LinkedHashMap<>();
        for (MobilityProfile mp : MobilityProfile.values()) {
            CostModel m = new CostModel(mp, hour);
            String b = m.blockedBy(i);
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("passable", b == null);
            e.put("blockedBy", b);
            e.put("costFactor", b == null ? num(m.cellFactor(i), 3) : null);
            profiles.put(mp.id, e);
        }
        out.put("profiles", profiles);
        return out;
    }

    // ---------- GET /cells/nearest-open ----------

    /**
     * Nearest cell the given profile may enter at this hour, found by a breadth-first walk over
     * hex neighbours from the cell under the point. Used to move a blocked route point onto open ground.
     */
    public Map<String, Object> nearestOpen(Double lon, Double lat, String mode, Double hourParam) {
        requireReady();
        if (lon == null || lat == null)
            throw new ApiException(HttpStatus.BAD_REQUEST, "MISSING_POINT", "Pass both lon and lat as query parameters.");
        MobilityProfile profile = parseMode(mode == null ? "rover" : mode);
        double hour = parseHour(hourParam);
        double[] p = normalise(lon, lat, "point");
        int start = HexAStar.nearestCell(p[0], p[1]);
        if (start < 0)
            throw new ApiException(HttpStatus.BAD_REQUEST, "POINT_OUTSIDE_GRID",
                    "This point is outside the modelled area (lon -180 to 0). Pick a point in the western hemisphere.");
        CostModel m = new CostModel(profile, hour);
        int found = -1;
        int[] dist = new int[HexAStar.n];
        java.util.Arrays.fill(dist, -1);
        java.util.ArrayDeque<Integer> queue = new java.util.ArrayDeque<>();
        queue.add(start);
        dist[start] = 0;
        while (!queue.isEmpty()) {
            int u = queue.poll();
            if (m.blockedBy(u) == null) { found = u; break; }
            if (dist[u] >= 40) continue; // about 2,400 km: beyond that the area is simply closed
            for (int v : HexAStar.neigh[u]) {
                if (dist[v] >= 0) continue;
                dist[v] = dist[u] + 1;
                queue.add(v);
            }
        }
        if (found < 0)
            throw new ApiException(HttpStatus.NOT_FOUND, "CELL_NOT_FOUND",
                    "No open ground for the " + profile.label.toLowerCase(Locale.ROOT) + " within 2,400 km of this point.");
        Map<String, Object> out = cellAt(HexAStar.ocx[found], HexAStar.ocy[found], hour);
        out.put("mode", profile.id);
        out.put("distanceFromPointM", Math.round(HexAStar.haversine(p[0], p[1], HexAStar.ocx[found], HexAStar.ocy[found])));
        out.put("cellsAway", dist[found]);
        return out;
    }

    // ---------- Validation ----------

    private void requireReady() {
        if (!loader.isReady())
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "GRID_NOT_READY", "The grid is still loading. Try again in a few seconds.");
    }

    static MobilityProfile parseMode(String mode) {
        MobilityProfile p = MobilityProfile.parse(mode);
        if (p == null)
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PARAMETER", "Unknown mode. Use \"rover\" or \"astronaut\".");
        return p;
    }

    static double parseHour(Double h) {
        if (h == null) return 12.0;
        if (h.isNaN() || h < 0 || h > 24)
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PARAMETER", "The hour must be a local solar time from 0 to 24.");
        return h == 24.0 ? 0.0 : h;
    }

    static boolean parseAlgorithm(String a) {
        if (a == null || a.isBlank()) return false;
        String k = a.trim().toLowerCase(Locale.ROOT);
        if (k.equals("astar")) return false;
        if (k.equals("dijkstra")) return true;
        throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PARAMETER", "Unknown algorithm. Use \"astar\" or \"dijkstra\".");
    }

    /** Validates degrees and folds lon 180..360 into -180..180. */
    static double[] normalise(double lon, double lat, String role) {
        if (Double.isNaN(lon) || Double.isNaN(lat) || lat < -90 || lat > 90 || lon < -180 || lon > 360)
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_COORDINATES",
                    "The " + role + " coordinates are out of range. Use lon -180 to 360 and lat -90 to 90 degrees.");
        if (lon > 180) lon -= 360;
        return new double[]{lon, lat};
    }

    // ---------- Snapping points ----------

    private int resolve(String cellId, RouteRequest.Point p, String role, List<String> warnings) {
        if (cellId != null && !cellId.isBlank()) {
            Integer idx = HexAStar.idIndex.get(cellId.trim());
            if (idx == null)
                throw new ApiException(HttpStatus.NOT_FOUND, "CELL_NOT_FOUND", "There is no " + role + " cell with this id. Pick the point on the map instead.");
            return idx;
        }
        if (p == null || p.lon() == null || p.lat() == null)
            throw new ApiException(HttpStatus.BAD_REQUEST, "MISSING_POINT",
                    "The " + role + " needs a cell id or coordinates {lon, lat}.");
        double[] ll = normalise(p.lon(), p.lat(), role);
        int best = HexAStar.nearestCell(ll[0], ll[1]);
        if (best < 0)
            throw new ApiException(HttpStatus.BAD_REQUEST, "POINT_OUTSIDE_GRID",
                    "The " + role + " point is outside the modelled area (lon -180 to 0). Move it into the western hemisphere.");
        warnings.add("The " + role + " point was snapped to the nearest cell " + HexAStar.ids[best] + ".");
        return best;
    }

    // ---------- Building the response ----------

    private RouteResponse build(HexAStar.Result r, int s, int t, CostModel model, String algorithm,
                                List<double[]> visited, List<String> warnings) {
        MobilityProfile p = model.profile();
        List<Integer> path = r.path;
        List<double[]> coords = new ArrayList<>();
        List<String> cellIds = new ArrayList<>();
        List<RouteResponse.Cell> cells = new ArrayList<>();
        List<RouteResponse.Segment> segments = new ArrayList<>();

        double dist = 0, weighted = 0, maxMargin = 0, slopeSum = 0, ascent = 0, descent = 0;
        double maxDust = Double.NaN, minT = Double.NaN, maxT = Double.NaN;
        boolean anyElevPair = false;
        int worst = 0, noTi = 0, noDust = 0;

        for (int k = 0; k < path.size(); k++) {
            int v = path.get(k);
            double margin = model.slopeWithMargin(v);
            double cf = model.cellFactor(v);
            if (k > 0) {
                int u = path.get(k - 1);
                double d = HexAStar.dist(u, v);
                double w = HexAStar.edgeCost(u, v, model);
                dist += d;
                weighted += w;
                if (!Double.isNaN(HexAStar.elev[u]) && !Double.isNaN(HexAStar.elev[v])) {
                    double dh = HexAStar.elev[v] - HexAStar.elev[u];
                    if (dh > 0) ascent += dh; else descent -= dh;
                    anyElevPair = true;
                }
                segments.add(new RouteResponse.Segment(k - 1, HexAStar.ids[u], HexAStar.ids[v], r1(d), r1(w),
                        r2(HexAStar.slope[v]), r2(HexAStar.sigma[v]), r2(margin), name(level(margin, cf, p))));
            }
            int lv = level(margin, cf, p);
            worst = Math.max(worst, lv);
            maxMargin = Math.max(maxMargin, margin);
            slopeSum += HexAStar.slope[v];
            if (!Double.isNaN(HexAStar.dust[v])) maxDust = Double.isNaN(maxDust) ? HexAStar.dust[v] : Math.max(maxDust, HexAStar.dust[v]);
            else noDust++;
            double tc = Double.NaN;
            if (!Double.isNaN(HexAStar.tiNorm[v])) {
                tc = model.tempK(v) - CostModel.KELVIN;
                minT = Double.isNaN(minT) ? tc : Math.min(minT, tc);
                maxT = Double.isNaN(maxT) ? tc : Math.max(maxT, tc);
            } else noTi++;

            coords.add(new double[]{r4(HexAStar.ocx[v]), r4(HexAStar.ocy[v])});   // [lon, lat]
            cellIds.add(HexAStar.ids[v]);
            cells.add(new RouteResponse.Cell(HexAStar.ids[v], r4(HexAStar.ocx[v]), r4(HexAStar.ocy[v]), r1(dist),
                    num(HexAStar.elev[v], 1), num(HexAStar.slope[v], 2), num(margin, 2), num(HexAStar.dust[v], 3),
                    num(HexAStar.ti[v], 0), num(tc, 1), num(cf, 3), name(lv)));
        }

        if (!HexAStar.hasElev || !HexAStar.hasDust || !HexAStar.hasTi)
            warnings.add("Some Trek layers are not loaded; the cost uses only the indicators that are available.");
        if (HexAStar.hasTi && noTi > 0)
            warnings.add(noTi + " route cells have no thermal inertia data; a mid value was assumed for their temperature.");
        if (HexAStar.hasDust && noDust > 0)
            warnings.add(noDust + " route cells have no dust data; a moderate dust index of 0.3 was assumed.");
        warnings.add("Surface temperature is a simplified model from TES thermal inertia, applied at the departure hour "
                + fmtHour(model.hour()) + " to the whole route.");
        warnings.add("Prototype: the route is not verified safe without engineering validation.");

        RouteResponse.Metrics m = new RouteResponse.Metrics(r1(dist), r1(weighted), r2(maxMargin),
                r2(slopeSum / path.size()), name(worst), path.size(), p.maxSlopeDeg,
                anyElevPair ? r1(ascent) : null, anyElevPair ? r1(descent) : null,
                Math.round(dist / p.metersPerSol * 10) / 10.0,
                num(maxDust, 3), num(minT, 1), num(maxT, 1), r.expanded);
        return new RouteResponse("OK", null, null, null, MAP_CRS, COORDINATE_ORDER, HexAStar.ids[s], HexAStar.ids[t],
                p.id, model.hour(), algorithm,
                new RouteResponse.Route(new RouteResponse.Geometry("LineString", coords), cellIds, cells, segments),
                m, visited, warnings);
    }

    private RouteResponse noRoute(String reason, String blockedBy, String message, int s, int t, MobilityProfile p,
                                  double hour, String algorithm, List<double[]> visited, List<String> warnings) {
        return new RouteResponse("NO_ROUTE", reason, blockedBy, message, MAP_CRS, COORDINATE_ORDER,
                HexAStar.ids[s], HexAStar.ids[t], p.id, hour, algorithm, null, null, visited, warnings);
    }

    private static String why(String blockedBy, CostModel m, int i) {
        MobilityProfile p = m.profile();
        return switch (blockedBy) {
            case CostModel.SLOPE -> String.format(Locale.ROOT, "the slope with margin is %.1f deg, above the %.0f deg limit.",
                    m.slopeWithMargin(i), p.maxSlopeDeg);
            case CostModel.DUST -> String.format(Locale.ROOT, "the dust index is %.2f, above the %.1f limit.",
                    HexAStar.dust[i], p.maxDustIndex);
            case CostModel.COLD -> String.format(Locale.ROOT, "the modelled surface temperature at %s is %.0f C, below the %.0f C limit. Try a departure closer to midday.",
                    fmtHour(m.hour()), m.tempK(i) - CostModel.KELVIN, p.minSurfaceTempC);
            default -> "there is no slope data for this cell.";
        };
    }

    // ---------- Helpers ----------

    private static List<double[]> lonLat(List<Integer> cells) {
        List<double[]> out = new ArrayList<>(cells.size());
        for (int i : cells) out.add(new double[]{r4(HexAStar.ocx[i]), r4(HexAStar.ocy[i])});
        return out;
    }

    /** 0 LOW, 1 MODERATE, 2 HIGH: the worse of the slope-margin share and the cost factor. */
    static int level(double margin, double costFactor, MobilityProfile p) {
        double ratio = margin / p.maxSlopeDeg;
        int bySlope = ratio >= HIGH_RATIO ? 2 : ratio >= MODERATE_RATIO ? 1 : 0;
        int byCost = Double.isNaN(costFactor) ? 2 : costFactor >= HIGH_FACTOR ? 2 : costFactor >= MODERATE_FACTOR ? 1 : 0;
        return Math.max(bySlope, byCost);
    }

    private static String name(int level) { return level == 2 ? "HIGH" : level == 1 ? "MODERATE" : "LOW"; }

    static String fmtHour(double h) {
        int mins = (int) Math.round(h * 60) % (24 * 60);
        return String.format(Locale.ROOT, "%02d:%02d", mins / 60, mins % 60);
    }

    /** Rounded boxed number, or null for NaN/infinite (JSON has no NaN). */
    static Double num(double v, int decimals) {
        if (Double.isNaN(v) || Double.isInfinite(v)) return null;
        double f = Math.pow(10, decimals);
        return Math.round(v * f) / f;
    }

    private static double r1(double v) { return Math.round(v * 10) / 10.0; }

    private static double r2(double v) { return Math.round(v * 100) / 100.0; }

    static double r4(double v) { return Math.round(v * 10000) / 10000.0; }
}
