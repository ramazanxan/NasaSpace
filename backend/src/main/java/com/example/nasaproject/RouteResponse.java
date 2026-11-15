package com.example.nasaproject;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * Routing response. Null numbers mean "no data for this cell".
 *
 * @param status          "OK" when a route was found; "NO_ROUTE" otherwise (see reason/blockedBy/message)
 * @param reason          on NO_ROUTE: START_BLOCKED | GOAL_BLOCKED | NO_CONNECTION; null on OK
 * @param blockedBy       for a blocked start/goal: SLOPE | DUST | COLD | NO_DATA
 * @param message         human-readable explanation (may be null)
 * @param mapCrs          coordinate system of the geometry
 * @param coordinateOrder coordinate order in the geometry
 * @param startCellId     cell actually used as the start
 * @param goalCellId      cell actually used as the goal
 * @param mode            mobility profile used
 * @param departureHour   local solar hour used for the temperature model
 * @param algorithm       "astar" | "dijkstra"
 * @param route           the route (null on NO_ROUTE)
 * @param metrics         route summary (null on NO_ROUTE)
 * @param visited         expanded cells as [lon, lat] in expansion order; present only when requested
 * @param warnings        data/assumption warnings to show to the user
 */
public record RouteResponse(
        String status,
        String reason,
        String blockedBy,
        String message,
        String mapCrs,
        String coordinateOrder,
        String startCellId,
        String goalCellId,
        String mode,
        double departureHour,
        String algorithm,
        Route route,
        Metrics metrics,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<double[]> visited,
        List<String> warnings) {

    /** geometry: GeoJSON LineString through the cell centres; cellIds and cells: the same cells in order. */
    public record Route(Geometry geometry, List<String> cellIds, List<Cell> cells, List<Segment> segments) {}

    /** GeoJSON geometry: type is always "LineString", coordinates = [[lon, lat], ...]. */
    public record Geometry(String type, List<double[]> coordinates) {}

    /**
     * One route cell in travel order.
     *
     * @param costFactor direction-free multiplier the cost model applies to distance in this cell (>= 1)
     * @param riskLevel  LOW | MODERATE | HIGH, from the slope margin and the cost factor (display only)
     */
    public record Cell(
            String cellId,
            double lon,
            double lat,
            double distanceFromStartM,
            Double elevationM,
            Double slopeMeanDeg,
            Double slopeWithMarginDeg,
            Double dustIndex,
            Double thermalInertia,
            Double surfaceTempC,
            Double costFactor,
            String riskLevel) {}

    /**
     * One step between neighbouring cells. Slope is taken from the DESTINATION cell (toCellId),
     * as in the HexAStar edge cost.
     *
     * @param distanceMeters     great-circle length of the step (centre to centre), metres
     * @param weightedCostMeters distanceMeters * cost factor of the edge (includes uphill/downhill)
     * @param slopeWithMarginDeg slopeMean + sigma margin * stdev: the value compared with the profile limit
     * @param riskLevel          LOW | MODERATE | HIGH (display only)
     */
    public record Segment(
            int index,
            String fromCellId,
            String toCellId,
            double distanceMeters,
            double weightedCostMeters,
            double slopeMeanDeg,
            double slopeStdevDeg,
            double slopeWithMarginDeg,
            String riskLevel) {}

    /**
     * @param distanceMeters        physical route length, metres
     * @param weightedCostMeters    weighted route cost (not the length)
     * @param maxSlopeWithMarginDeg max slopeWithMargin over the route cells
     * @param averageSlopeDeg       mean slopeMean over the route cells
     * @param riskLevel             worst riskLevel over the cells (an indicator, not a probability)
     * @param cellCount             number of cells in the route
     * @param maxAllowedSlopeDeg    slope limit of the profile
     * @param ascentMeters          total climb from MOLA elevations (null without elevation data)
     * @param descentMeters         total descent, positive (null without elevation data)
     * @param travelSols            distance / metres per sol of the profile, rounded to 0.1
     * @param maxDustIndex          dustiest cell on the route (null without dust data)
     * @param minSurfaceTempC       coldest modelled cell at the departure hour (null without the model)
     * @param maxSurfaceTempC       warmest modelled cell at the departure hour
     * @param expandedCells         cells the search expanded
     */
    public record Metrics(
            double distanceMeters,
            double weightedCostMeters,
            double maxSlopeWithMarginDeg,
            double averageSlopeDeg,
            String riskLevel,
            int cellCount,
            double maxAllowedSlopeDeg,
            Double ascentMeters,
            Double descentMeters,
            double travelSols,
            Double maxDustIndex,
            Double minSurfaceTempC,
            Double maxSurfaceTempC,
            int expandedCells) {}
}
