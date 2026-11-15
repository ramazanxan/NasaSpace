package com.example.nasaproject;

import java.util.Locale;

/**
 * Who travels: limits (what blocks a cell) and weights (how much each indicator adds to the cost factor).
 * All weights are dimensionless and multiply terms that are already normalised to roughly 0..1.
 */
public enum MobilityProfile {

    //        id           label        maxSlope sigmaK  maxDust minTempC  m/sol    A    B    LAM  W_DUST W_SOFT W_COLD
    ROVER("rover", "Rover", 15.0, 2.0, null, -95.0, 150.0, 3.0, 1.5, 1.5, 0.8, 1.0, 1.0),
    ASTRONAUT("astronaut", "Astronaut", 25.0, 2.0, 0.7, -80.0, 6000.0, 2.0, 1.0, 1.0, 1.5, 0.3, 1.5);

    /** Lowercase id used in the API ("rover" / "astronaut"). */
    public final String id;
    public final String label;
    /** A cell is closed when slopeMean + slopeSigmaMargin * slopeStdev exceeds this, degrees. */
    public final double maxSlopeDeg;
    public final double slopeSigmaMargin;
    /** Cells dustier than this are closed; null means dust only adds a penalty. */
    public final Double maxDustIndex;
    /** Cells colder than this at the departure hour are closed, deg C. */
    public final double minSurfaceTempC;
    public final double metersPerSol;
    /** Weight of the uphill term A*(up/maxSlope)^2. */
    public final double wUphill;
    /** Weight of the downhill term B*(down/maxSlope)^2. */
    public final double wDownhill;
    /** Weight of the roughness term LAM*sigma/maxSlope. */
    public final double wRoughness;
    /** Weight of the dust term W_DUST*dust^2. */
    public final double wDust;
    /** Weight of the loose-ground term W_SOFT*soft (soft from thermal inertia). */
    public final double wSoft;
    /** Weight of the near-cold-limit term W_COLD*coldPenalty. */
    public final double wCold;

    MobilityProfile(String id, String label, double maxSlopeDeg, double slopeSigmaMargin, Double maxDustIndex,
                    double minSurfaceTempC, double metersPerSol, double wUphill, double wDownhill,
                    double wRoughness, double wDust, double wSoft, double wCold) {
        this.id = id;
        this.label = label;
        this.maxSlopeDeg = maxSlopeDeg;
        this.slopeSigmaMargin = slopeSigmaMargin;
        this.maxDustIndex = maxDustIndex;
        this.minSurfaceTempC = minSurfaceTempC;
        this.metersPerSol = metersPerSol;
        this.wUphill = wUphill;
        this.wDownhill = wDownhill;
        this.wRoughness = wRoughness;
        this.wDust = wDust;
        this.wSoft = wSoft;
        this.wCold = wCold;
    }

    /** Parses "rover" / "astronaut" (case-insensitive); null or blank gives ROVER; unknown gives null. */
    public static MobilityProfile parse(String s) {
        if (s == null || s.isBlank()) return ROVER;
        String k = s.trim().toLowerCase(Locale.ROOT);
        for (MobilityProfile p : values()) if (p.id.equals(k)) return p;
        return null;
    }
}
