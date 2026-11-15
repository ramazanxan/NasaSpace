package com.example.nasaproject;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Loads the grid into the static HexAStar arrays once at startup:
 * load -> Trek layers -> buildNeighbors -> buildIndex -> computeSlopeIfMissing.
 * Afterwards the data is only read, so searches are safe from parallel requests.
 *
 * <p>Trek layers come from {@code mars.layers-file} (checked in, so startup needs no network). If the file is
 * missing the importer is tried online once; if that fails the backend runs on slope only.
 */
@Component
public class GridLoader implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(GridLoader.class);
    private static final Object LOCK = new Object();
    private static String loadedFrom;

    private final String gridFile;
    private final String layersFile;
    private final boolean importIfMissing;
    private volatile boolean ready = false;

    public GridLoader(@Value("${mars.grid-file:data/grid.geojson}") String gridFile,
                      @Value("${mars.layers-file:data/trek_layers.csv}") String layersFile,
                      @Value("${mars.import-if-missing:true}") boolean importIfMissing) {
        this.gridFile = gridFile;
        this.layersFile = layersFile;
        this.importIfMissing = importIfMissing;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        ensureLoaded(gridFile, layersFile, importIfMissing);
        ready = true;
    }

    /** Loads the grid and layers once per JVM (tests and the application share the static data). */
    static void ensureLoaded(String gridFile, String layersFile, boolean importIfMissing) throws Exception {
        synchronized (LOCK) {
            String key = gridFile + "|" + layersFile;
            if (key.equals(loadedFrom)) return;
            long t0 = System.currentTimeMillis();
            HexAStar.load(gridFile);
            Path csv = Paths.get(layersFile);
            if (!Files.exists(csv) && importIfMissing) {
                log.info("{} not found, importing the Trek layers online", csv);
                try {
                    TrekLayerImporter.importTo(csv);
                } catch (Exception e) {
                    log.warn("Trek import failed ({}); running on slope only", e.toString());
                }
            }
            if (Files.exists(csv)) {
                try {
                    int matched = HexAStar.loadLayers(csv);
                    log.info("Trek layers: {} cells matched from {}", matched, csv);
                } catch (Exception e) {
                    log.warn("Could not read {} ({}); running on slope only", csv, e.toString());
                }
            } else {
                log.warn("No Trek layers file at {}; running on slope only", csv);
            }
            HexAStar.buildNeighbors();
            HexAStar.buildIndex();
            HexAStar.computeSlopeIfMissing();
            loadedFrom = key;
            log.info("Grid loaded: {} cells in {} ms (elevation={}, dust={}, thermalInertia={})", HexAStar.n,
                    System.currentTimeMillis() - t0, HexAStar.hasElev, HexAStar.hasDust, HexAStar.hasTi);
        }
    }

    public boolean isReady() { return ready; }
}
