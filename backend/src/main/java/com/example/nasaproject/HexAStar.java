package com.example.nasaproject;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.List;
import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.awt.geom.*;

/**
 * Hex grid over Mars and the route search on it.
 *
 * <p>All cell data lives in static arrays that are filled once at startup (load, loadLayers, buildNeighbors,
 * buildIndex) and only read afterwards. A search keeps its own g/parent/closed arrays, so
 * {@link #search} may run from many request threads at once.
 */
public class HexAStar {

    // ===== Model parameters =====
    static double HEX_EDGE = 30.0;           // hexagon edge (= circumradius), m; measured from the grid on load
    static double HEX_EDGE_DEG = 0.5;        // the same in degrees of the equirectangular grid plane
    static final double THETA_MAX = 15.0;    // default max slope, deg (rover profile; see MobilityProfile)
    static final double K_SIGMA = 2.0;       // default slope stdev margin
    static final double RHO = 1.0;           // rocks (no Trek layer yet, data stays 0)
    static final double MU = 0.5;            // radiation (no Trek layer yet, data stays 0)
    static final double TI_REF = 250.0;      // thermal inertia below which the ground counts as loose, J m^-2 K^-1 s^-1/2
    static final double MARS_R = 3396190.0;  // Mars radius, m

    // ===== Cell data =====
    static int n;
    static String[] ids;
    static double[] cx, cy, elev, slope, sigma, rock, ti, tiNorm, dust, rad;
    static double[] ocx, ocy;                // centres in the file's coordinates: lon, lat degrees
    static double[][] px, py;                // hexagon vertices, metres (grid plane)
    static double[][] plon, plat;            // hexagon vertices, degrees
    static int[][] neigh;
    static Map<String, Integer> idIndex = new HashMap<>();
    static boolean hasSlope = false, hasElev = false, hasDust = false, hasTi = false;
    static double minLon, minLat, maxLon, maxLat; // grid bbox, degrees
    private static Map<Long, int[]> cellIndex = Map.of();

    // =====================================================================
    //  Mini JSON parser (no libraries)
    // =====================================================================
    static class Json {
        final String s;
        int p = 0;

        Json(String s) { this.s = s; }

        Object parse() {
            ws();
            char c = s.charAt(p);
            if (c == '{') return obj();
            if (c == '[') return arr();
            if (c == '"') return str();
            int q = p;
            while (p < s.length() && ",]} \t\r\n".indexOf(s.charAt(p)) < 0) p++;
            String t = s.substring(q, p);
            if (t.equals("null")) return null;
            if (t.equals("true")) return Boolean.TRUE;
            if (t.equals("false")) return Boolean.FALSE;
            return Double.parseDouble(t);
        }

        void ws() {
            while (p < s.length() && Character.isWhitespace(s.charAt(p))) p++;
        }

        Map<String, Object> obj() {
            Map<String, Object> m = new LinkedHashMap<>();
            p++;
            ws();
            if (s.charAt(p) == '}') { p++; return m; }
            while (true) {
                ws();
                String k = str();
                ws();
                p++;                                   // ':'
                m.put(k, parse());
                ws();
                char c = s.charAt(p++);
                if (c == '}') break;
            }
            return m;
        }

        List<Object> arr() {
            List<Object> l = new ArrayList<>();
            p++;
            ws();
            if (s.charAt(p) == ']') { p++; return l; }
            while (true) {
                l.add(parse());
                ws();
                char c = s.charAt(p++);
                if (c == ']') break;
            }
            return l;
        }

        String str() {
            StringBuilder b = new StringBuilder();
            p++;
            while (true) {
                char c = s.charAt(p++);
                if (c == '"') break;
                if (c == '\\') {
                    char e = s.charAt(p++);
                    switch (e) {
                        case 'n': b.append('\n'); break;
                        case 't': b.append('\t'); break;
                        case 'r': b.append('\r'); break;
                        case 'u':
                            b.append((char) Integer.parseInt(s.substring(p, p + 4), 16));
                            p += 4;
                            break;
                        default: b.append(e);
                    }
                } else b.append(c);
            }
            return b.toString();
        }
    }

    static double dbl(Map<String, Object> pr, double def, String... names) {
        for (String nm : names) {
            Object v = pr.get(nm);
            if (v == null) continue;
            if (v instanceof Double) return (Double) v;
            try { return Double.parseDouble(v.toString().trim()); } catch (Exception ignored) {}
        }
        return def;
    }

    // ---------- GeoJSON loading ----------
    @SuppressWarnings("unchecked")
    static void load(String path) throws IOException {
        Object root = new Json(Files.readString(Paths.get(path))).parse();
        List<Object> feats = (List<Object>) ((Map<String, Object>) root).get("features");

        n = feats.size();
        ids = new String[n];
        idIndex = new HashMap<>();
        hasSlope = hasElev = hasDust = hasTi = false;
        cx = new double[n]; cy = new double[n]; ocx = new double[n]; ocy = new double[n];
        elev = new double[n]; slope = new double[n]; sigma = new double[n];
        rock = new double[n]; ti = new double[n]; tiNorm = new double[n]; dust = new double[n]; rad = new double[n];
        px = new double[n][]; py = new double[n][]; plon = new double[n][]; plat = new double[n][];

        for (int i = 0; i < n; i++) {
            Map<String, Object> f = (Map<String, Object>) feats.get(i);
            Map<String, Object> pr = new HashMap<>();
            Map<String, Object> raw = (Map<String, Object>) f.get("properties");
            if (raw != null) for (Map.Entry<String, Object> e : raw.entrySet()) pr.put(e.getKey().toLowerCase(), e.getValue());

            Object idv = pr.containsKey("id") ? pr.get("id") : pr.get("fid");
            if (idv instanceof Double && ((Double) idv) % 1 == 0) ids[i] = String.valueOf(((Double) idv).longValue());
            else ids[i] = idv != null ? idv.toString() : String.valueOf(i);
            idIndex.put(ids[i], i);

            elev[i]  = dbl(pr, Double.NaN, "elev_mean", "elev", "height_mean");
            slope[i] = dbl(pr, Double.NaN, "slope_mean", "slope", "_mean", "mean", "rough_mean");
            double sd = dbl(pr, Double.NaN, "slope_stdev", "_stdev", "stdev", "rough_stdev");
            sigma[i] = !Double.isNaN(sd) ? sd
                     : Math.sqrt(Math.max(dbl(pr, 0.0, "slope_variance", "slope_var"), 0));
            rock[i]  = dbl(pr, 0.0, "rock_mean");
            ti[i]    = dbl(pr, Double.NaN, "ti_mean");
            tiNorm[i] = Double.isNaN(ti[i]) ? Double.NaN
                      : clamp((ti[i] - CostModel.TI_MIN) / CostModel.TI_SPAN, 0, 1);
            dust[i]  = dbl(pr, Double.NaN, "dust_index");
            rad[i]   = dbl(pr, 0.0, "rad_mean");
            if (!Double.isNaN(slope[i])) hasSlope = true;
            if (!Double.isNaN(elev[i])) hasElev = true;
            if (!Double.isNaN(ti[i])) hasTi = true;
            if (!Double.isNaN(dust[i])) hasDust = true;

            px[i] = new double[0]; py[i] = new double[0]; plon[i] = new double[0]; plat[i] = new double[0];
            cx[i] = cy[i] = ocx[i] = ocy[i] = Double.NaN;
            Map<String, Object> geom = (Map<String, Object>) f.get("geometry");
            if (geom == null) continue;
            Object co = geom.get("coordinates");
            String type = String.valueOf(geom.get("type"));
            List<Object> ring;
            if (type.equals("Polygon"))
                ring = (List<Object>) ((List<Object>) co).get(0);
            else if (type.equals("MultiPolygon"))
                ring = (List<Object>) ((List<Object>) ((List<Object>) co).get(0)).get(0);
            else continue;
            int m = ring.size();
            List<Object> last = (List<Object>) ring.get(m - 1), first = (List<Object>) ring.get(0);
            if (m > 1 && last.get(0).equals(first.get(0)) && last.get(1).equals(first.get(1))) m--;
            px[i] = new double[m]; py[i] = new double[m];
            double sx = 0, sy = 0;
            for (int k = 0; k < m; k++) {
                List<Object> pt = (List<Object>) ring.get(k);
                px[i][k] = (Double) pt.get(0);
                py[i][k] = (Double) pt.get(1);
                sx += px[i][k];
                sy += py[i][k];
            }
            plon[i] = px[i].clone();
            plat[i] = py[i].clone();
            ocx[i] = sx / m;
            ocy[i] = sy / m;
        }

        // grid bbox in degrees
        minLon = minLat = Double.POSITIVE_INFINITY;
        maxLon = maxLat = Double.NEGATIVE_INFINITY;
        for (int i = 0; i < n; i++)
            for (int k = 0; k < plon[i].length; k++) {
                minLon = Math.min(minLon, plon[i][k]); maxLon = Math.max(maxLon, plon[i][k]);
                minLat = Math.min(minLat, plat[i][k]); maxLat = Math.max(maxLat, plat[i][k]);
            }

        // degrees -> metres (equirectangular plane on the Mars sphere)
        boolean geo = true;
        double sx = 0, sy = 0;
        int cnt = 0;
        for (int i = 0; i < n; i++) {
            if (Double.isNaN(ocx[i])) continue;
            if (Math.abs(ocx[i]) > 360 || Math.abs(ocy[i]) > 90) { geo = false; break; }
            sx += ocx[i]; sy += ocy[i]; cnt++;
        }
        double metresPerUnit = 1.0;
        if (geo && cnt > 0) {
            double lon0 = sx / cnt, lat0 = sy / cnt, k0 = 1.0;   // equirectangular: a grid regular in degrees stays regular
            metresPerUnit = MARS_R * Math.toRadians(1.0) * k0;
            System.out.printf(Locale.US, "Coordinates in degrees -> metres (centre lon=%.3f lat=%.3f)%n", lon0, lat0);
            for (int i = 0; i < n; i++)
                for (int k = 0; k < px[i].length; k++) {
                    double lon = px[i][k], lat = py[i][k];
                    px[i][k] = MARS_R * Math.toRadians(lon - lon0) * k0;
                    py[i][k] = MARS_R * Math.toRadians(lat - lat0);
                }
        }
        for (int i = 0; i < n; i++) {
            if (px[i].length == 0) continue;
            double a = 0, b = 0;
            for (int k = 0; k < px[i].length; k++) { a += px[i][k]; b += py[i][k]; }
            cx[i] = a / px[i].length;
            cy[i] = b / px[i].length;
        }

        // hexagon edge = mean distance from the centre to the vertices
        double sum = 0;
        int c2 = 0;
        for (int i = 0; i < n && c2 < 500; i += Math.max(1, n / 500)) {
            if (px[i].length == 0) continue;
            double d = 0;
            for (int k = 0; k < px[i].length; k++) d += Math.hypot(px[i][k] - cx[i], py[i][k] - cy[i]);
            sum += d / px[i].length;
            c2++;
        }
        if (c2 > 0) HEX_EDGE = sum / c2;
        HEX_EDGE_DEG = HEX_EDGE / metresPerUnit;
        System.out.printf(Locale.US, "Hexagon edge: %.2f m%n", HEX_EDGE);
    }

    // ---------- Trek layers: data/trek_layers.csv (id,elev_m,ti_norm,dust_index) ----------
    /** Loads the Trek layer table into elev/ti/tiNorm/dust. Returns the number of matched cells. */
    static int loadLayers(Path csv) throws IOException {
        int matched = 0;
        try (BufferedReader r = Files.newBufferedReader(csv, StandardCharsets.UTF_8)) {
            String line = r.readLine();                    // header
            if (line == null || !line.startsWith("id,")) throw new IOException("Unexpected header in " + csv);
            while ((line = r.readLine()) != null) {
                if (line.isBlank()) continue;
                String[] a = line.split(",", -1);
                if (a.length < 4) continue;
                Integer i = idIndex.get(a[0].trim());
                if (i == null) continue;
                elev[i] = parseOrNaN(a[1]);
                tiNorm[i] = parseOrNaN(a[2]);
                ti[i] = Double.isNaN(tiNorm[i]) ? Double.NaN : CostModel.tiUnits(tiNorm[i]);
                dust[i] = parseOrNaN(a[3]);
                matched++;
            }
        }
        hasElev = hasTi = hasDust = false;
        for (int i = 0; i < n; i++) {
            if (!Double.isNaN(elev[i])) hasElev = true;
            if (!Double.isNaN(tiNorm[i])) hasTi = true;
            if (!Double.isNaN(dust[i])) hasDust = true;
        }
        return matched;
    }

    private static double parseOrNaN(String s) {
        s = s.trim();
        if (s.isEmpty()) return Double.NaN;
        try { return Double.parseDouble(s); } catch (NumberFormatException e) { return Double.NaN; }
    }

    // ---------- Neighbours (6 each) via a spatial hash ----------
    // The grid does not span the antimeridian (lon -180..0.42), so no wrap-around neighbours are needed.
    static void buildNeighbors() {
        double d0 = Math.sqrt(3.0) * HEX_EDGE;
        double cell = d0 * 1.2;
        Map<Long, List<Integer>> grid = new HashMap<>();
        for (int i = 0; i < n; i++) {
            if (Double.isNaN(cx[i])) continue;
            grid.computeIfAbsent(key(cx[i], cy[i], cell), k -> new ArrayList<>()).add(i);
        }
        neigh = new int[n][];
        for (int i = 0; i < n; i++) {
            List<Integer> res = new ArrayList<>();
            if (!Double.isNaN(cx[i])) {
                long gx = (long) Math.floor(cx[i] / cell), gy = (long) Math.floor(cy[i] / cell);
                for (long dx = -1; dx <= 1; dx++)
                    for (long dy = -1; dy <= 1; dy++) {
                        List<Integer> lst = grid.get(pack(gx + dx, gy + dy));
                        if (lst == null) continue;
                        for (int j : lst) {
                            if (j == i) continue;
                            if (Math.hypot(cx[j] - cx[i], cy[j] - cy[i]) <= d0 * 1.1) res.add(j);
                        }
                    }
            }
            neigh[i] = res.stream().mapToInt(Integer::intValue).toArray();
        }
    }

    static long key(double x, double y, double cell) {
        return pack((long) Math.floor(x / cell), (long) Math.floor(y / cell));
    }

    static long pack(long a, long b) { return (a << 32) ^ (b & 0xffffffffL); }

    // ---------- Nearest cell for a lon/lat point: 1-degree buckets in the grid plane ----------
    static void buildIndex() {
        Map<Long, List<Integer>> m = new HashMap<>();
        for (int i = 0; i < n; i++) {
            if (Double.isNaN(ocx[i])) continue;
            m.computeIfAbsent(pack((long) Math.floor(ocx[i]), (long) Math.floor(ocy[i])), k -> new ArrayList<>()).add(i);
        }
        Map<Long, int[]> idx = new HashMap<>();
        for (Map.Entry<Long, List<Integer>> e : m.entrySet())
            idx.put(e.getKey(), e.getValue().stream().mapToInt(Integer::intValue).toArray());
        cellIndex = idx;
    }

    /**
     * Cell containing (lon, lat): the nearest centre in the degree plane the hexagons are regular in.
     * Returns -1 outside the grid bbox or farther than 1.2 hexagon sizes from any centre.
     */
    static int nearestCell(double lon, double lat) {
        double tol = 1.2 * HEX_EDGE_DEG;
        if (lon < minLon - 1e-9 || lon > maxLon + 1e-9 || lat < minLat - 1e-9 || lat > maxLat + 1e-9) return -1;
        long gx = (long) Math.floor(lon), gy = (long) Math.floor(lat);
        int best = -1;
        double bd = Double.POSITIVE_INFINITY;
        for (long dx = -2; dx <= 2; dx++)
            for (long dy = -2; dy <= 2; dy++) {
                int[] lst = cellIndex.get(pack(gx + dx, gy + dy));
                if (lst == null) continue;
                for (int j : lst) {
                    double d = sq(ocx[j] - lon) + sq(ocy[j] - lat);
                    if (d < bd) { bd = d; best = j; }
                }
            }
        return (best >= 0 && Math.sqrt(bd) <= tol) ? best : -1;
    }

    // ---------- Without a slope field: slope from neighbour heights ----------
    static void computeSlopeIfMissing() {
        if (hasSlope) return;
        System.out.println("No slope_mean field: slope is computed from neighbour heights.");
        for (int i = 0; i < n; i++) {
            double mx = 0;
            boolean ok = false;
            for (int j : neigh[i]) {
                if (Double.isNaN(elev[i]) || Double.isNaN(elev[j])) continue;
                double d = Math.hypot(cx[j] - cx[i], cy[j] - cy[i]);
                mx = Math.max(mx, Math.toDegrees(Math.atan(Math.abs(elev[j] - elev[i]) / d)));
                ok = true;
            }
            slope[i] = ok ? mx : Double.NaN;
        }
    }

    // ---------- Distances on the Mars sphere ----------
    /** Great-circle distance, metres; input lon/lat degrees. */
    static double haversine(double lon1, double lat1, double lon2, double lat2) {
        double p1 = Math.toRadians(lat1), p2 = Math.toRadians(lat2);
        double dp = p2 - p1, dl = Math.toRadians(lon2 - lon1);
        double h = Math.sin(dp / 2) * Math.sin(dp / 2)
                + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * MARS_R * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    /** Great-circle distance between the centres of cells u and v, metres. */
    static double dist(int u, int v) { return haversine(ocx[u], ocy[u], ocx[v], ocy[v]); }

    // ---------- Cost of the directed edge u -> v ----------
    /**
     * Cost factor f >= 1 of entering cell v from u over distance d (metres):
     * f = 1 + A(up/thetaMax)^2 + B(down/thetaMax)^2 + LAM*sigma/thetaMax + W_DUST*dust^2 + W_SOFT*soft
     *       + W_COLD*cold + RHO*rock + MU*rad.
     * up/down come from the MOLA elevation difference between the centres. u = -1 leaves them out
     * (direction-free factor of a cell). Blocking is checked by the caller.
     */
    static double factor(int u, int v, double d, CostModel m) {
        MobilityProfile p = m.profile();
        double thetaMax = p.maxSlopeDeg;
        double theta = (u < 0 || d <= 0 || Double.isNaN(elev[u]) || Double.isNaN(elev[v]))
                ? 0 : Math.toDegrees(Math.atan2(elev[v] - elev[u], d));
        double up = Math.max(theta, 0), down = Math.max(-theta, 0);
        double dustV = m.dustForCost(v);

        return 1.0
                + p.wUphill * sq(up / thetaMax)
                + p.wDownhill * sq(down / thetaMax)
                + p.wRoughness * sigma[v] / thetaMax
                + p.wDust * sq(dustV)
                + p.wSoft * m.soft(v)
                + p.wCold * m.coldPenalty(v)
                + RHO * rock[v]
                + MU * rad[v];
    }

    static double edgeCost(int u, int v, CostModel m) {
        if (m.blockedBy(v) != null)
            return Double.POSITIVE_INFINITY;
        double d = dist(u, v);
        return d * factor(u, v, d, m);
    }

    /** Default model (rover, noon); kept for the desktop viewer. */
    static double edgeCost(int u, int v) { return edgeCost(u, v, CostModel.DEFAULT); }

    static double sq(double x) { return x * x; }

    static double clamp(double x, double lo, double hi) { return Math.max(lo, Math.min(hi, x)); }

    /** A* heuristic: great-circle distance to the goal. Admissible because every cost factor is >= 1. */
    static double h(int a, int goal) {
        return dist(a, goal);
    }

    // ---------- A* / Dijkstra ----------
    record QItem(int node, double f) {}

    static class Result {
        List<Integer> path;
        double cost;
        int expanded;
        List<Integer> visited;   // expansion order, only when requested
    }

    /** Default search (A*, rover, noon); kept for the desktop viewer. */
    static Result astar(int s, int t) {
        Result r = search(s, t, CostModel.DEFAULT, true, false);
        return r.path == null ? null : r;
    }

    /**
     * Best path from s to t. useHeuristic=false turns A* into Dijkstra. Always returns a Result:
     * path == null means there is no connection; expanded/visited are filled either way.
     */
    static Result search(int s, int t, CostModel model, boolean useHeuristic, boolean recordVisited) {
        double[] g = new double[n];
        Arrays.fill(g, Double.POSITIVE_INFINITY);
        int[] parent = new int[n];
        Arrays.fill(parent, -1);
        boolean[] closed = new boolean[n];
        Result r = new Result();
        if (recordVisited) r.visited = new ArrayList<>();

        PriorityQueue<QItem> open = new PriorityQueue<>(Comparator.comparingDouble(QItem::f));
        g[s] = 0;
        open.add(new QItem(s, useHeuristic ? h(s, t) : 0));

        while (!open.isEmpty()) {
            int u = open.poll().node();
            if (closed[u]) continue;
            closed[u] = true;
            r.expanded++;
            if (recordVisited) r.visited.add(u);
            if (u == t) {
                LinkedList<Integer> path = new LinkedList<>();
                for (int x = t; x != -1; x = parent[x]) path.addFirst(x);
                r.path = path;
                r.cost = g[t];
                return r;
            }

            for (int v : neigh[u]) {
                if (closed[v]) continue;
                double c = edgeCost(u, v, model);
                if (Double.isInfinite(c)) continue;
                double ng = g[u] + c;
                if (ng < g[v]) {
                    g[v] = ng;
                    parent[v] = u;
                    open.add(new QItem(v, ng + (useHeuristic ? h(v, t) : 0)));
                }
            }
        }
        return r;
    }

    // ---------- Route export: GeoJSON in the file's coordinates ----------
    static void export(Result r, String file) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",");
        sb.append(String.format(Locale.US, "\"properties\":{\"cost\":%.2f,\"cells\":%d},", r.cost, r.path.size()));
        sb.append("\"geometry\":{\"type\":\"LineString\",\"coordinates\":[");
        for (int k = 0; k < r.path.size(); k++) {
            int i = r.path.get(k);
            if (k > 0) sb.append(",");
            sb.append(String.format(Locale.US, "[%.8f,%.8f]", ocx[i], ocy[i]));
        }
        sb.append("]}}]}");
        Files.writeString(Paths.get(file), sb.toString());

        try (PrintWriter w = new PrintWriter(file.replaceAll("\\.\\w+$", "") + "_cells.csv")) {
            w.println("order,id");
            for (int k = 0; k < r.path.size(); k++) w.println(k + "," + ids[r.path.get(k)]);
        }
    }

    // ---------- main ----------
    // Click mode:  java HexAStar grid.geojson
    // By id:       java HexAStar grid.geojson START_ID GOAL_ID [route.geojson]
    public static void main(String[] args) throws IOException {
        String file = args.length > 0 ? args[0] : "grid.geojson";
        load(file);
        Path layers = Paths.get(file).resolveSibling("trek_layers.csv");
        if (Files.exists(layers)) System.out.println("Trek layers matched: " + loadLayers(layers));
        buildNeighbors();
        buildIndex();
        computeSlopeIfMissing();

        int total = 0;
        for (int[] a : neigh) total += a.length;
        System.out.printf(Locale.US, "Cells: %d, mean neighbour count: %.2f%n", n, (double) total / n);

        int open = 0, nan = 0;
        for (int i = 0; i < n; i++) {
            if (Double.isNaN(slope[i])) { nan++; continue; }
            if (slope[i] + K_SIGMA * sigma[i] <= THETA_MAX) open++;
        }
        System.out.printf(Locale.US, "Passable cells: %d of %d, without data: %d%n", open, n, nan);

        if (args.length >= 3) {
            Integer s = idIndex.get(args[1]), t = idIndex.get(args[2]);
            if (s == null || t == null) {
                System.out.println("Unknown start or goal id");
                return;
            }
            Result r = astar(s, t);
            if (r == null) System.out.println("No path found.");
            else {
                String out = args.length > 3 ? args[3] : "route.geojson";
                export(r, out);
                System.out.printf(Locale.US, "Cells: %d, cost: %.1f. Saved: %s%n", r.path.size(), r.cost, out);
            }
            Viz.show(s, t);
        } else {
            Viz.show(-1, -1);
        }
    }

    // =====================================================================
    //  Map window: pick start/goal with the mouse
    // =====================================================================
    static class Viz extends JPanel {
        int start, goal;
        Result res;
        String status = "Left click = start, right click = goal";
        double minX = 1e300, maxX = -1e300, minY = 1e300, maxY = -1e300;
        double eMin = 1e300, eMax = -1e300, sMin = 1e300, sMax = -1e300;
        double scale = 1, offX = 0, offY = 0;
        boolean fitted = false, byElev = true;
        Point press;

        Viz(int s, int t) {
            start = s;
            goal = t;
            for (int i = 0; i < n; i++) {
                if (Double.isNaN(cx[i])) continue;
                minX = Math.min(minX, cx[i]); maxX = Math.max(maxX, cx[i]);
                minY = Math.min(minY, cy[i]); maxY = Math.max(maxY, cy[i]);
                if (!Double.isNaN(elev[i]))  { eMin = Math.min(eMin, elev[i]);  eMax = Math.max(eMax, elev[i]); }
                if (!Double.isNaN(slope[i])) { sMin = Math.min(sMin, slope[i]); sMax = Math.max(sMax, slope[i]); }
            }
            setBackground(Color.BLACK);
            setPreferredSize(new Dimension(1100, 800));
            setFocusable(true);
            if (start >= 0 && goal >= 0) res = astar(start, goal);

            addMouseWheelListener(e -> {
                double f = e.getPreciseWheelRotation() < 0 ? 1.15 : 1 / 1.15;
                offX = e.getX() - (e.getX() - offX) * f;
                offY = e.getY() - (e.getY() - offY) * f;
                scale *= f;
                repaint();
            });
            addMouseListener(new MouseAdapter() {
                public void mousePressed(MouseEvent e) {
                    press = e.getPoint();
                    requestFocusInWindow();
                }

                public void mouseReleased(MouseEvent e) {
                    if (press == null || press.distance(e.getPoint()) > 4) return;
                    int c = nearest(e.getX(), e.getY());
                    if (c < 0) return;
                    if (SwingUtilities.isLeftMouseButton(e)) start = c;
                    else if (SwingUtilities.isRightMouseButton(e)) goal = c;
                    recompute();
                }
            });
            addMouseMotionListener(new MouseMotionAdapter() {
                public void mouseDragged(MouseEvent e) {
                    offX += e.getX() - press.x;
                    offY += e.getY() - press.y;
                    press = e.getPoint();
                    repaint();
                }
            });
            addKeyListener(new KeyAdapter() {
                public void keyPressed(KeyEvent e) {
                    char c = Character.toLowerCase(e.getKeyChar());
                    if (c == 'e') byElev = true;
                    if (c == 's') byElev = false;
                    if (c == 'r') fit();
                    if (c == 'c') { start = goal = -1; res = null; status = "Left click = start, right click = goal"; }
                    if (c == 'v' && res != null) Tablet3D.show(res, start, goal);
                    if (c == 'x' && res != null) {
                        try {
                            export(res, "route.geojson");
                            status += "  | saved route.geojson";
                        } catch (IOException ex) {
                            status = "Write error: " + ex.getMessage();
                        }
                    }
                    repaint();
                }
            });
        }

        void recompute() {
            res = null;
            if (start >= 0 && goal >= 0) {
                long t0 = System.nanoTime();
                res = astar(start, goal);
                double ms = (System.nanoTime() - t0) / 1e6;
                status = res == null
                        ? "No path found (id " + ids[start] + " -> " + ids[goal] + ")"
                        : String.format(Locale.US, "id %s -> %s | cells: %d | cost: %.1f | %.1f ms",
                                ids[start], ids[goal], res.path.size(), res.cost, ms);
                System.out.println(status);
            } else if (start >= 0) status = "Start: id " + ids[start] + ". Pick the goal (right click).";
            else if (goal >= 0) status = "Goal: id " + ids[goal] + ". Pick the start (left click).";
            repaint();
        }

        int nearest(int mx, int my) {
            double x = (mx - offX) / scale + minX, y = maxY - (my - offY) / scale;
            int best = -1;
            double bd = Double.MAX_VALUE;
            for (int i = 0; i < n; i++) {
                if (Double.isNaN(cx[i])) continue;
                double d = sq(cx[i] - x) + sq(cy[i] - y);
                if (d < bd) { bd = d; best = i; }
            }
            return (best >= 0 && Math.sqrt(bd) <= HEX_EDGE * 1.5) ? best : -1;
        }

        void fit() {
            double w = Math.max(1, getWidth()), h = Math.max(1, getHeight());
            double pad = 2 * HEX_EDGE;
            scale = Math.min(w / (maxX - minX + 2 * pad), h / (maxY - minY + 2 * pad));
            offX = (w - (maxX - minX) * scale) / 2;
            offY = (h - (maxY - minY) * scale) / 2;
            fitted = true;
        }

        double sx(double x) { return (x - minX) * scale + offX; }

        double sy(double y) { return (maxY - y) * scale + offY; }

        static Color ramp(double t) {
            t = Math.max(0, Math.min(1, t));
            Color[] c = { new Color(30, 60, 160), new Color(40, 150, 90), new Color(230, 210, 80),
                          new Color(150, 100, 50), Color.WHITE };
            double p = t * (c.length - 1);
            int i = Math.min((int) p, c.length - 2);
            double f = p - i;
            return new Color(
                (int) (c[i].getRed()   + f * (c[i + 1].getRed()   - c[i].getRed())),
                (int) (c[i].getGreen() + f * (c[i + 1].getGreen() - c[i].getGreen())),
                (int) (c[i].getBlue()  + f * (c[i + 1].getBlue()  - c[i].getBlue())));
        }

        @Override
        protected void paintComponent(Graphics g0) {
            super.paintComponent(g0);
            if (!fitted) fit();
            Graphics2D g = (Graphics2D) g0;
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

            Path2D.Double poly = new Path2D.Double();
            double lo = byElev ? eMin : sMin, hi = byElev ? eMax : sMax;
            for (int i = 0; i < n; i++) {
                if (px[i].length == 0) continue;
                double val = byElev ? elev[i] : slope[i];
                g.setColor(Double.isNaN(val) ? Color.DARK_GRAY : ramp((val - lo) / Math.max(1e-9, hi - lo)));
                poly.reset();
                for (int k = 0; k < px[i].length; k++) {
                    double X = sx(px[i][k]), Y = sy(py[i][k]);
                    if (k == 0) poly.moveTo(X, Y); else poly.lineTo(X, Y);
                }
                poly.closePath();
                g.fill(poly);
            }

            if (res != null && res.path.size() > 1) {
                g.setStroke(new BasicStroke(3f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
                g.setColor(new Color(255, 120, 0));
                Path2D.Double line = new Path2D.Double();
                for (int k = 0; k < res.path.size(); k++) {
                    int i = res.path.get(k);
                    if (k == 0) line.moveTo(sx(cx[i]), sy(cy[i])); else line.lineTo(sx(cx[i]), sy(cy[i]));
                }
                g.draw(line);
            }
            g.setStroke(new BasicStroke(1f));
            if (start >= 0) marker(g, start, Color.GREEN, "START");
            if (goal >= 0) marker(g, goal, Color.CYAN, "GOAL");

            g.setColor(Color.WHITE);
            g.setFont(new Font("SansSerif", Font.PLAIN, 13));
            g.drawString((byElev ? "Elevation, m: " + (int) eMin + " .. " + (int) eMax
                                 : "Slope, deg: " + String.format(Locale.US, "%.1f .. %.1f", sMin, sMax))
                    + "   [E] elevation [S] slope [R] reset view [C] clear [X] save route.geojson [V] 3D view", 10, 20);
            g.drawString(status, 10, 40);
        }

        void marker(Graphics2D g, int i, Color c, String label) {
            double X = sx(cx[i]), Y = sy(cy[i]);
            g.setColor(c);
            g.fill(new Ellipse2D.Double(X - 6, Y - 6, 12, 12));
            g.setColor(Color.BLACK);
            g.draw(new Ellipse2D.Double(X - 6, Y - 6, 12, 12));
            g.setColor(Color.WHITE);
            g.drawString(label + " (" + ids[i] + ")", (float) X + 9, (float) Y - 6);
        }

        static void show(int s, int t) {
            SwingUtilities.invokeLater(() -> {
                JFrame f = new JFrame("Mars hex A*");
                f.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
                Viz v = new Viz(s, t);
                f.add(v);
                f.pack();
                f.setLocationRelativeTo(null);
                f.setVisible(true);
                v.requestFocusInWindow();
            });
        }
    }
}
