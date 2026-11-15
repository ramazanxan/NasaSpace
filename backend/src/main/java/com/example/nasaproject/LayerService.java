package com.example.nasaproject;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.IntToDoubleFunction;

/**
 * Analysis layers: the catalog (GET /layers) and hexagon PNGs (GET /layers/{id}.png).
 * The same stops colour the PNG and the frontend legend.
 */
@Service
public class LayerService {

    /** A colour stop: value in the layer's unit, #rrggbb colour, opacity 0..1 used in the PNG, label. */
    public record Stop(double value, String color, double opacity, String label) {}

    public record Layer(String id, String title, String unit, String description, String howToRead, String source,
                        boolean timeDependent, boolean modeDependent, List<Stop> stops) {}

    public record Catalog(double[] bbox, List<Layer> layers) {}

    static final double RISK_BLOCKED = 4.5;
    private static final int MAX_CACHE = 40;
    public static final int DEFAULT_WIDTH = 2048;

    private final GridLoader loader;
    private final Map<String, Layer> layers = new LinkedHashMap<>();
    private final Map<String, byte[]> cache = new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, byte[]> e) { return size() > MAX_CACHE; }
    };

    public LayerService(GridLoader loader) {
        this.loader = loader;
        add(new Layer("risk", "Traversability", "",
                "Cost factor the route planner applies in each cell for the chosen profile and hour; dark red cells are closed.",
                "Green is easy going, amber and rust cost more, dark red cannot be entered.",
                "Combined from slope (grid), MOLA elevation, TES dust index and TES thermal inertia",
                true, true, List.of(
                        new Stop(1.0, "#3f7f5f", 0.55, "easy"),
                        new Stop(2.0, "#d4a15a", 0.6, "moderate"),
                        new Stop(3.5, "#b8613a", 0.65, "hard"),
                        new Stop(RISK_BLOCKED, "#5a1f1f", 0.8, "blocked"))));
        add(new Layer("slope", "Slope", "deg",
                "Mean slope of each cell from the team's zonal statistics of the Trek slope data.",
                "Clear cells are flat; amber passes the rover limit of 15 deg, rust and red are steep.",
                "Slope statistics on the hex grid",
                false, false, List.of(
                        new Stop(0, "#d4a15a", 0.05, "0"),
                        new Stop(15, "#d4a15a", 0.6, "15"),
                        new Stop(25, "#b8613a", 0.7, "25"),
                        new Stop(35, "#6e1a1a", 0.8, "35+"))));
        add(new Layer("dust", "Dust cover", "",
                "TES dust index decoded from the Trek colour tiles: 0 is dust-free rock, 1 is heavily dust-covered.",
                "Blue is clean surface, amber is partly dusty, red is thick dust that astronauts must avoid above 0.7.",
                "MGS TES, Global Dust Index (" + TrekLayerImporter.DUST + ")",
                false, false, List.of(
                        new Stop(0, "#3b5b8c", 0.6, "clean"),
                        new Stop(0.5, "#d4a15a", 0.6, "0.5"),
                        new Stop(1, "#c2452d", 0.7, "dusty"))));
        add(new Layer("thermal-inertia", "Thermal inertia", "J m-2 K-1 s-1/2",
                "TES thermal inertia: how slowly the ground heats and cools. The absolute scale is approximate.",
                "Violet is loose dust and sand, teal is mixed ground, yellow is rock and crusted surfaces.",
                "MGS TES, Global Thermal Inertia (" + TrekLayerImporter.THERMAL_INERTIA + ")",
                false, false, List.of(
                        new Stop(30, "#6a4fb3", 0.6, "low"),
                        new Stop(415, "#3fa7a0", 0.6, "mid"),
                        new Stop(800, "#e0c04a", 0.65, "high"))));
        add(new Layer("temperature", "Surface temperature", "C",
                "Modelled surface temperature at the chosen local hour, from latitude and TES thermal inertia.",
                "Blue is too cold for the rover (below -95 C), teal is cold, amber and red are mild.",
                "Simplified model on MGS TES, Global Thermal Inertia (" + TrekLayerImporter.THERMAL_INERTIA + ")",
                true, false, List.of(
                        new Stop(-110, "#2b3a8c", 0.6, "-110"),
                        new Stop(-60, "#4fa3a0", 0.6, "-60"),
                        new Stop(-20, "#d4a15a", 0.6, "-20"),
                        new Stop(10, "#c2452d", 0.65, "10"))));
        add(new Layer("elevation", "Elevation", "m",
                "MOLA elevation relative to the Mars areoid, averaged per cell.",
                "Blue basins are low, green is near datum, amber highlands and pale volcano summits are high.",
                "MGS MOLA Global DEM (" + TrekLayerImporter.MOLA + ")",
                false, false, List.of(
                        new Stop(-8000, "#2b3a8c", 0.6, "-8 km"),
                        new Stop(0, "#3f7f5f", 0.6, "0"),
                        new Stop(8000, "#d4a15a", 0.6, "8 km"),
                        new Stop(21000, "#f2efe9", 0.7, "21 km"))));
    }

    private void add(Layer l) { layers.put(l.id(), l); }

    public Catalog catalog() {
        requireReady();
        return new Catalog(bbox(), List.copyOf(layers.values()));
    }

    static double[] bbox() {
        return new double[]{RoutingService.r4(HexAStar.minLon), RoutingService.r4(HexAStar.minLat),
                RoutingService.r4(HexAStar.maxLon), RoutingService.r4(HexAStar.maxLat)};
    }

    /** PNG bytes for a layer; mode and hour matter only for time/mode-dependent layers. */
    public byte[] png(String id, String mode, Double hourParam, Integer widthParam) {
        requireReady();
        Layer layer = layers.get(id);
        if (layer == null)
            throw new ApiException(HttpStatus.NOT_FOUND, "LAYER_NOT_FOUND",
                    "There is no layer with this id. Use one of: " + String.join(", ", layers.keySet()) + ".");
        MobilityProfile profile = RoutingService.parseMode(mode);
        double hour = Math.round(RoutingService.parseHour(hourParam) * 2) / 2.0;
        int width = widthParam == null ? DEFAULT_WIDTH : widthParam;
        if (width < 256 || width > 4096)
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PARAMETER", "The width must be from 256 to 4096 pixels.");

        String key = id + "|" + width
                + (layer.modeDependent() ? "|" + profile.id : "")
                + (layer.timeDependent() ? "|" + hour : "");
        synchronized (cache) {
            byte[] hit = cache.get(key);
            if (hit != null) return hit;
        }
        byte[] bytes = render(layer, new CostModel(profile, hour), width);
        synchronized (cache) {
            cache.put(key, bytes);
        }
        return bytes;
    }

    private void requireReady() {
        if (!loader.isReady())
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "GRID_NOT_READY", "The grid is still loading. Try again in a few seconds.");
    }

    /** Value of cell i in the layer's unit; NaN = transparent. */
    static IntToDoubleFunction valueOf(String id, CostModel m) {
        return switch (id) {
            case "risk" -> i -> {
                String b = m.blockedBy(i);
                if (CostModel.NO_DATA.equals(b)) return Double.NaN;
                return b != null ? RISK_BLOCKED : m.cellFactor(i);
            };
            case "slope" -> i -> HexAStar.slope[i];
            case "dust" -> i -> HexAStar.dust[i];
            case "thermal-inertia" -> i -> HexAStar.ti[i];
            case "temperature" -> i -> Double.isNaN(HexAStar.tiNorm[i]) ? Double.NaN : m.tempK(i) - CostModel.KELVIN;
            case "elevation" -> i -> HexAStar.elev[i];
            default -> i -> Double.NaN;
        };
    }

    /** Equirectangular RGBA image of the grid bbox, one filled hexagon per cell. */
    static byte[] render(Layer layer, CostModel m, int width) {
        double w0 = HexAStar.minLon, e0 = HexAStar.maxLon, s0 = HexAStar.minLat, n0 = HexAStar.maxLat;
        int height = (int) Math.round(width * (n0 - s0) / (e0 - w0));
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_OFF);
            double sx = width / (e0 - w0), sy = height / (n0 - s0);
            IntToDoubleFunction val = valueOf(layer.id(), m);
            List<Stop> stops = layer.stops();
            Path2D.Double poly = new Path2D.Double();
            for (int i = 0; i < HexAStar.n; i++) {
                double[] xs = HexAStar.plon[i], ys = HexAStar.plat[i];
                if (xs.length == 0) continue;
                double v = val.applyAsDouble(i);
                if (Double.isNaN(v)) continue;
                g.setColor(color(stops, v));
                poly.reset();
                for (int k = 0; k < xs.length; k++) {
                    double x = (xs[k] - w0) * sx, y = (n0 - ys[k]) * sy;
                    if (k == 0) poly.moveTo(x, y); else poly.lineTo(x, y);
                }
                poly.closePath();
                g.fill(poly);
            }
        } finally {
            g.dispose();
        }
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            ImageIO.write(img, "png", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Linear interpolation between stops (colour and opacity), clamped at the ends. */
    static Color color(List<Stop> stops, double v) {
        Stop first = stops.get(0), last = stops.get(stops.size() - 1);
        if (v <= first.value()) return rgba(first.color(), first.opacity(), first.color(), first.opacity(), 0);
        if (v >= last.value()) return rgba(last.color(), last.opacity(), last.color(), last.opacity(), 0);
        int k = 1;
        while (stops.get(k).value() < v) k++;
        Stop a = stops.get(k - 1), b = stops.get(k);
        double t = (v - a.value()) / (b.value() - a.value());
        return rgba(a.color(), a.opacity(), b.color(), b.opacity(), t);
    }

    private static Color rgba(String ca, double oa, String cb, double ob, double t) {
        int a = Integer.parseInt(ca.substring(1), 16), b = Integer.parseInt(cb.substring(1), 16);
        int r = mix((a >> 16) & 255, (b >> 16) & 255, t);
        int gg = mix((a >> 8) & 255, (b >> 8) & 255, t);
        int bb = mix(a & 255, b & 255, t);
        int al = (int) Math.round(255 * (oa + (ob - oa) * t));
        return new Color(r, gg, bb, Math.max(0, Math.min(255, al)));
    }

    private static int mix(int x, int y, double t) { return (int) Math.round(x + (y - x) * t); }
}
