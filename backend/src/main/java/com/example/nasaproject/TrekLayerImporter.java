package com.example.nasaproject;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.awt.image.ColorModel;
import java.awt.image.IndexColorModel;
import java.awt.image.Raster;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.PrintWriter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Imports NASA Mars Trek raster layers onto the hex grid and writes {@code data/trek_layers.csv}
 * ({@code id,elev_m,ti_norm,dust_index}; an empty field means no data).
 *
 * <p>Tiles: {@code https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{row}/{col}.png},
 * geographic tiling with 2x1 tiles of 256 px at z=0, row 0 at the north, col 0 at lon -180.
 * <ul>
 *   <li>Elevation: MOLA, 8-bit grey + alpha, z=3. height = -8201 + grey/255 * 29430 m; alpha 0 = no data.</li>
 *   <li>Thermal inertia: TES, colour ramp, z=1. Violet (hue 270) = lowest, red (hue 0) = highest;
 *       ti_norm = (270 - hue)/270. Trek publishes no numeric legend for these tiles, so the physical value
 *       30 + ti_norm * 770 J m^-2 K^-1 s^-1/2 is an approximation.</li>
 *   <li>Dust: TES dust index, colour ramp blended with grey hillshade, z=2. Red = dust-covered (1),
 *       blue/violet = dust-free (0); dust_index = 1 - hue/270. Grey (low saturation) = no data.</li>
 * </ul>
 * Each cell value is the mean of valid samples on a regular grid of points inside the hexagon.
 *
 * <p>Run: {@code java -cp target/classes com.example.nasaproject.TrekLayerImporter [grid.geojson] [out.csv]}
 */
public final class TrekLayerImporter {

    static final String TILE_URL = "https://trek.nasa.gov/tiles/Mars/EQ/%s/1.0.0/default/default028mm/%d/%d/%d.png";
    static final String MOLA = "mola128_mola64_merge_90Nto90S_SimpleC_clon0";
    static final String THERMAL_INERTIA = "TES_Thermal_Inertia";
    static final String DUST = "tes_ruffdust";
    static final double ELEV_MIN = -8201.0, ELEV_MAX = 21229.0;
    static final int TILE = 256;
    /** Sample points per cell side (SAMPLES x SAMPLES points over the cell bbox, those inside the hexagon count). */
    static final int SAMPLES = 12;

    private TrekLayerImporter() {}

    /** Decodes one RGBA pixel to a value; NaN means no data. */
    interface Decoder { double decode(int r, int g, int b, int a); }

    // ---------- Pixel decoding ----------

    static double elevation(int r, int g, int b, int a) {
        if (a == 0) return Double.NaN;
        return ELEV_MIN + r / 255.0 * (ELEV_MAX - ELEV_MIN);
    }

    /** Hue (deg 0..360), saturation and value (0..1) of an RGB pixel. */
    static double[] hsv(int r, int g, int b) {
        int max = Math.max(r, Math.max(g, b)), min = Math.min(r, Math.min(g, b));
        double v = max / 255.0, s = max == 0 ? 0 : (max - min) / (double) max, h;
        int d = max - min;
        if (d == 0) h = 0;
        else if (max == r) h = 60.0 * (((g - b) / (double) d) % 6);
        else if (max == g) h = 60.0 * ((b - r) / (double) d + 2);
        else h = 60.0 * ((r - g) / (double) d + 4);
        if (h < 0) h += 360;
        return new double[]{h, s, v};
    }

    /** Thermal inertia, normalised 0 (violet, lowest) .. 1 (red, highest). Magenta-reds (hue > 300) wrap to red. */
    static double thermalInertiaNorm(int r, int g, int b, int a) {
        if (a < 128) return Double.NaN;
        double[] hsv = hsv(r, g, b);
        if (hsv[1] < 0.15 || hsv[2] < 0.08) return Double.NaN;
        double h = hsv[0] > 300 ? 0 : hsv[0];
        return HexAStar.clamp((270 - h) / 270, 0, 1);
    }

    /** Dust index 0 (blue/violet, dust-free) .. 1 (red, dust-covered). Grey hillshade = no data. */
    static double dustIndex(int r, int g, int b, int a) {
        if (a < 128) return Double.NaN;
        double[] hsv = hsv(r, g, b);
        if (hsv[1] < 0.15 || hsv[2] < 0.08) return Double.NaN;
        double h = hsv[0] > 300 ? 0 : hsv[0];
        return 1 - HexAStar.clamp(h / 270, 0, 1);
    }

    // ---------- Tiles ----------

    /** One decoded tile: packed ARGB per pixel, or null when the tile does not exist. */
    record Tile(int[] argb) {}

    static final class Layer {
        final String name;
        final int z;
        final Decoder decoder;
        final Map<Long, Tile> tiles = new ConcurrentHashMap<>();

        Layer(String name, int z, Decoder decoder) {
            this.name = name;
            this.z = z;
            this.decoder = decoder;
        }

        double span() { return 180.0 / (1 << z); }

        int cols() { return 2 << z; }

        int rows() { return 1 << z; }

        long key(int row, int col) { return ((long) row << 32) | col; }

        /** Value at lon/lat, NaN when there is no data. Tiles must be prefetched. */
        double sample(double lon, double lat) {
            double span = span();
            double x = (lon + 180.0) / span, y = (90.0 - lat) / span;
            int col = (int) Math.floor(x), row = (int) Math.floor(y);
            col = Math.max(0, Math.min(cols() - 1, col));
            row = Math.max(0, Math.min(rows() - 1, row));
            Tile t = tiles.get(key(row, col));
            if (t == null || t.argb() == null) return Double.NaN;
            int px = (int) Math.max(0, Math.min(TILE - 1, Math.floor((x - col) * TILE)));
            int py = (int) Math.max(0, Math.min(TILE - 1, Math.floor((y - row) * TILE)));
            int c = t.argb()[py * TILE + px];
            return decoder.decode((c >> 16) & 255, (c >> 8) & 255, c & 255, (c >>> 24) & 255);
        }
    }

    /** Reads a PNG into packed ARGB without colour-space conversion (grey tiles stay linear 0..255). */
    static int[] decodePng(byte[] bytes) throws IOException {
        BufferedImage img = ImageIO.read(new ByteArrayInputStream(bytes));
        if (img == null) throw new IOException("Not an image");
        int w = img.getWidth(), h = img.getHeight();
        if (w != TILE || h != TILE) throw new IOException("Unexpected tile size " + w + "x" + h);
        int[] out = new int[TILE * TILE];
        ColorModel cm = img.getColorModel();
        Raster ras = img.getRaster();
        int bands = ras.getNumBands();
        if (cm instanceof IndexColorModel || bands < 1 || bands > 4) {
            img.getRGB(0, 0, w, h, out, 0, w);
            return out;
        }
        int shift = Math.max(0, cm.getComponentSize(0) - 8);
        int[] px = new int[bands];
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++) {
                ras.getPixel(x, y, px);
                int r, g, b, a;
                if (bands <= 2) { r = g = b = px[0] >> shift; a = bands == 2 ? px[1] >> shift : 255; }
                else { r = px[0] >> shift; g = px[1] >> shift; b = px[2] >> shift; a = bands == 4 ? px[3] >> shift : 255; }
                out[y * w + x] = (a << 24) | (r << 16) | (g << 8) | b;
            }
        return out;
    }

    static byte[] fetch(HttpClient http, String url) throws IOException, InterruptedException {
        IOException last = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofSeconds(30))
                        .header("User-Agent", "NasaSpace-trek-importer/1.0")
                        .GET().build();
                HttpResponse<byte[]> resp = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
                if (resp.statusCode() == 404) return null;
                if (resp.statusCode() == 200) return resp.body();
                last = new IOException("HTTP " + resp.statusCode() + " for " + url);
            } catch (IOException e) {
                last = e;
            }
            Thread.sleep(500L * attempt);
        }
        throw last;
    }

    /** Downloads every tile of the layer that intersects the lon/lat box. */
    static void prefetch(Layer layer, HttpClient http, ExecutorService pool,
                         double west, double south, double east, double north) throws Exception {
        double span = layer.span();
        int c0 = Math.max(0, (int) Math.floor((west + 180) / span));
        int c1 = Math.min(layer.cols() - 1, (int) Math.floor((east + 180) / span));
        int r0 = Math.max(0, (int) Math.floor((90 - north) / span));
        int r1 = Math.min(layer.rows() - 1, (int) Math.floor((90 - south) / span));
        List<Future<?>> jobs = new ArrayList<>();
        for (int row = r0; row <= r1; row++)
            for (int col = c0; col <= c1; col++) {
                final int rr = row, cc = col;
                jobs.add(pool.submit(() -> {
                    String url = String.format(Locale.ROOT, TILE_URL, layer.name, layer.z, rr, cc);
                    byte[] png = fetch(http, url);
                    layer.tiles.put(layer.key(rr, cc), new Tile(png == null ? null : decodePng(png)));
                    return null;
                }));
            }
        for (Future<?> f : jobs) f.get();
        System.out.printf(Locale.ROOT, "  %s z=%d: %d tiles%n", layer.name, layer.z, jobs.size());
    }

    // ---------- Per-cell aggregation ----------

    static boolean inside(double[] xs, double[] ys, double x, double y) {
        boolean in = false;
        for (int i = 0, j = xs.length - 1; i < xs.length; j = i++)
            if ((ys[i] > y) != (ys[j] > y) && x < (xs[j] - xs[i]) * (y - ys[i]) / (ys[j] - ys[i]) + xs[i]) in = !in;
        return in;
    }

    /** Mean of valid samples of the layer inside cell i, NaN when none. */
    static double cellMean(Layer layer, int i) {
        double[] xs = HexAStar.plon[i], ys = HexAStar.plat[i];
        if (xs.length == 0) return Double.NaN;
        double w = Double.POSITIVE_INFINITY, e = Double.NEGATIVE_INFINITY, s = Double.POSITIVE_INFINITY, nn = Double.NEGATIVE_INFINITY;
        for (int k = 0; k < xs.length; k++) {
            w = Math.min(w, xs[k]); e = Math.max(e, xs[k]); s = Math.min(s, ys[k]); nn = Math.max(nn, ys[k]);
        }
        double sum = 0;
        int cnt = 0;
        for (int a = 0; a < SAMPLES; a++)
            for (int b = 0; b < SAMPLES; b++) {
                double lon = w + (a + 0.5) / SAMPLES * (e - w);
                double lat = s + (b + 0.5) / SAMPLES * (nn - s);
                if (!inside(xs, ys, lon, lat)) continue;
                double v = layer.sample(lon, lat);
                if (Double.isNaN(v)) continue;
                sum += v;
                cnt++;
            }
        return cnt == 0 ? Double.NaN : sum / cnt;
    }

    /** Imports all three layers for the grid already loaded in HexAStar and writes the CSV. */
    public static void importTo(Path out) throws Exception {
        if (HexAStar.n == 0) throw new IllegalStateException("Load the grid first");
        Layer elev = new Layer(MOLA, 3, TrekLayerImporter::elevation);
        Layer ti = new Layer(THERMAL_INERTIA, 1, TrekLayerImporter::thermalInertiaNorm);
        Layer dust = new Layer(DUST, 2, TrekLayerImporter::dustIndex);

        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15))
                .followRedirects(HttpClient.Redirect.NORMAL).build();
        ExecutorService pool = Executors.newFixedThreadPool(6);
        try {
            System.out.println("Downloading Trek tiles:");
            for (Layer l : List.of(elev, ti, dust))
                prefetch(l, http, pool, HexAStar.minLon, HexAStar.minLat, HexAStar.maxLon, HexAStar.maxLat);
        } finally {
            pool.shutdownNow();
        }

        int n = HexAStar.n;
        double[] e = new double[n], t = new double[n], d = new double[n];
        for (int i = 0; i < n; i++) {
            e[i] = cellMean(elev, i);
            t[i] = cellMean(ti, i);
            d[i] = cellMean(dust, i);
        }

        Path tmp = out.resolveSibling(out.getFileName() + ".tmp");
        if (out.getParent() != null) Files.createDirectories(out.getParent());
        try (PrintWriter w = new PrintWriter(Files.newBufferedWriter(tmp, StandardCharsets.UTF_8))) {
            w.print("id,elev_m,ti_norm,dust_index\n");
            for (int i = 0; i < n; i++)
                w.print(HexAStar.ids[i] + "," + fmt(e[i], "%.1f") + "," + fmt(t[i], "%.4f") + "," + fmt(d[i], "%.4f") + "\n");
        }
        Files.move(tmp, out, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        System.out.println("Written " + out.toAbsolutePath());
    }

    private static String fmt(double v, String f) {
        return Double.isNaN(v) ? "" : String.format(Locale.ROOT, f, v);
    }

    // ---------- Report ----------

    static void printStats(String name, double[] v) {
        int cnt = 0;
        double min = Double.POSITIVE_INFINITY, max = Double.NEGATIVE_INFINITY, sum = 0;
        for (double x : v) {
            if (Double.isNaN(x)) continue;
            cnt++;
            sum += x;
            min = Math.min(min, x);
            max = Math.max(max, x);
        }
        System.out.printf(Locale.ROOT, "%-16s coverage %5.1f%%  min %10.3f  mean %10.3f  max %10.3f%n",
                name, 100.0 * cnt / v.length, min, cnt == 0 ? Double.NaN : sum / cnt, max);
    }

    static void printCell(String label, double lon, double lat) {
        int i = HexAStar.nearestCell(lon, lat);
        if (i < 0) { System.out.println(label + ": outside the grid"); return; }
        System.out.printf(Locale.ROOT, "%-34s cell %s (%.2f, %.2f): elev %.0f m, ti_norm %.3f, dust %.3f%n",
                label, HexAStar.ids[i], HexAStar.ocx[i], HexAStar.ocy[i], HexAStar.elev[i], HexAStar.tiNorm[i], HexAStar.dust[i]);
    }

    public static void main(String[] args) throws Exception {
        String grid = args.length > 0 ? args[0] : "data/grid.geojson";
        Path out = Paths.get(args.length > 1 ? args[1] : "data/trek_layers.csv");
        long t0 = System.currentTimeMillis();
        HexAStar.load(grid);
        HexAStar.buildIndex();
        importTo(out);
        System.out.println("Matched cells: " + HexAStar.loadLayers(out));
        printStats("elev_m", HexAStar.elev);
        printStats("ti_norm", HexAStar.tiNorm);
        printStats("dust_index", HexAStar.dust);
        int hi = -1;
        for (int i = 0; i < HexAStar.n; i++)
            if (!Double.isNaN(HexAStar.elev[i]) && (hi < 0 || HexAStar.elev[i] > HexAStar.elev[hi])) hi = i;
        if (hi >= 0) printCell("Highest cell", HexAStar.ocx[hi], HexAStar.ocy[hi]);
        printCell("Olympus Mons summit (-133.8, 18.65)", -133.8, 18.65);
        printCell("Tharsis (-110, 0)", -110, 0);
        printCell("Valles Marineris floor (-72, -10)", -72, -10);
        printCell("Hellas is outside (70, -42)", 70, -42);
        System.out.printf(Locale.ROOT, "Done in %.1f s%n", (System.currentTimeMillis() - t0) / 1000.0);
    }
}
