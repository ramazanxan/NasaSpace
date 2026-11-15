package com.example.nasaproject;

/**
 * Route request. Start and goal are given EITHER by cell id OR by coordinates (lon, lat).
 * When both are present the id wins.
 *
 * @param startCellId    id of the start cell (properties.id in the GeoJSON), e.g. "3681"
 * @param goalCellId     id of the goal cell
 * @param start          start point (snapped to the nearest cell)
 * @param goal           goal point (snapped to the nearest cell)
 * @param mode           "rover" (default) | "astronaut"
 * @param departureHour  local solar time of departure, 0..24 (default 12)
 * @param algorithm      "astar" (default) | "dijkstra"
 * @param includeVisited return expanded cells in expansion order (for the search replay)
 */
public record RouteRequest(String startCellId, String goalCellId, Point start, Point goal,
                           String mode, Double departureHour, String algorithm, Boolean includeVisited) {

    /** Point in the map coordinate system: lon = x, lat = y, degrees (Mars 2000). */
    public record Point(Double lon, Double lat) {}
}
