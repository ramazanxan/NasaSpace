package com.example.nasaproject;

import java.util.List;

/** Backend state and model parameters, to check that everything has loaded. */
public record GridInfo(boolean ready, int cellCount, double[] bbox, double hexEdgeMeters, String mapCrs,
                       String coordinateOrder, Layers layers, List<Profile> profiles,
                       List<DataSource> dataSources, List<String> modelNotes) {

    /** Which indicators are loaded. Without the Trek layers the model runs on slope only. */
    public record Layers(boolean slope, boolean elevation, boolean dust, boolean thermalInertia) {}

    public record Profile(String id, String label, double maxSlopeDeg, double slopeSigmaMargin,
                          Double maxDustIndex, double minSurfaceTempC, double metersPerSol) {}

    public record DataSource(String id, String title, String trekLayer, String note) {}
}
