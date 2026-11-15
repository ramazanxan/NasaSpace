package com.example.nasaproject;

/**
 * Immutable per-request view of the cost model: a mobility profile plus the local solar hour of departure.
 * Reads only the shared, load-once arrays of {@link HexAStar}, so any number of searches may run in parallel.
 *
 * <p>Surface temperature is a simplified model built on the TES thermal inertia layer (not a measured
 * temperature): {@code T(hour) = Tmean(lat) + Amp(ti) * cos(2*pi*(hour - 13)/24)} with
 * {@code Tmean(lat) = 215 K - 50 K * sin^2(lat)} and {@code Amp = 20 K + 60 K * (1 - tiNorm)}.
 * Low thermal inertia (dust, sand) heats and cools fast: passable around midday, too cold at night.
 * Rock (high thermal inertia) stays moderate. The departure-hour temperature is applied to the whole route;
 * seasons, dust storms and travel time are not modelled.
 */
public record CostModel(MobilityProfile profile, double hour) {

    public static final CostModel DEFAULT = new CostModel(MobilityProfile.ROVER, 12.0);

    public static final double KELVIN = 273.15;
    /** Temperature model constants, K. */
    public static final double T_EQUATOR = 215.0, T_POLE_DROP = 50.0, AMP_BASE = 20.0, AMP_LOOSE = 60.0;
    /** Local solar hour of the daily temperature peak. */
    public static final double PEAK_HOUR = 13.0;
    /** Within this many K above the profile's limit the cold penalty rises from 0 to 1. */
    public static final double COLD_MARGIN_K = 15.0;
    /** Assumptions for cells without data. */
    public static final double DEFAULT_TI_NORM = 0.5, DEFAULT_DUST = 0.3;
    /** Approximate thermal inertia scale of the Trek colour tiles, J m^-2 K^-1 s^-1/2. */
    public static final double TI_MIN = 30.0, TI_SPAN = 770.0;

    public static final String SLOPE = "SLOPE", DUST = "DUST", COLD = "COLD", NO_DATA = "NO_DATA";

    /** Surface temperature, K, for a latitude (deg), normalised thermal inertia (0..1) and local hour. */
    public static double surfaceTempK(double latDeg, double tiNorm, double hour) {
        double s = Math.sin(Math.toRadians(latDeg));
        double mean = T_EQUATOR - T_POLE_DROP * s * s;
        double amp = AMP_BASE + AMP_LOOSE * (1 - HexAStar.clamp(tiNorm, 0, 1));
        return mean + amp * Math.cos(2 * Math.PI * (hour - PEAK_HOUR) / 24.0);
    }

    /** Normalised thermal inertia 0..1 converted to the approximate physical scale. */
    public static double tiUnits(double tiNorm) { return TI_MIN + tiNorm * TI_SPAN; }

    /** Thermal inertia used by the model for cell i (falls back to the mid value when there is no data). */
    double tiNormOrDefault(int i) {
        double t = HexAStar.tiNorm[i];
        return Double.isNaN(t) ? DEFAULT_TI_NORM : t;
    }

    double dustOrDefault(int i) {
        double d = HexAStar.dust[i];
        return Double.isNaN(d) ? DEFAULT_DUST : d;
    }

    /** Modelled surface temperature of cell i at this hour, K; NaN when the thermal inertia layer is not loaded. */
    public double tempK(int i) {
        if (!HexAStar.hasTi) return Double.NaN;
        return surfaceTempK(HexAStar.ocy[i], tiNormOrDefault(i), hour);
    }

    public double slopeWithMargin(int i) {
        return HexAStar.slope[i] + profile.slopeSigmaMargin * HexAStar.sigma[i];
    }

    /** Why cell i is closed to this profile at this hour, or null when it is passable. */
    public String blockedBy(int i) {
        if (Double.isNaN(HexAStar.slope[i])) return NO_DATA;
        if (slopeWithMargin(i) > profile.maxSlopeDeg) return SLOPE;
        if (profile.maxDustIndex != null && HexAStar.hasDust) {
            double d = HexAStar.dust[i];
            if (!Double.isNaN(d) && d > profile.maxDustIndex) return DUST;
        }
        double t = tempK(i);
        if (!Double.isNaN(t) && t < profile.minSurfaceTempC + KELVIN) return COLD;
        return null;
    }

    /** 0 when comfortably warm, rising to 1 at the profile's cold limit. */
    public double coldPenalty(int i) {
        double t = tempK(i);
        if (Double.isNaN(t)) return 0;
        double margin = t - (profile.minSurfaceTempC + KELVIN);
        return HexAStar.clamp((COLD_MARGIN_K - margin) / COLD_MARGIN_K, 0, 1);
    }

    /** Loose ground 0..1 from thermal inertia: below TI_REF the ground is treated as soft. */
    public double soft(int i) {
        if (!HexAStar.hasTi) return 0;
        double tiu = tiUnits(tiNormOrDefault(i));
        return HexAStar.clamp((HexAStar.TI_REF - tiu) / HexAStar.TI_REF, 0, 1);
    }

    /** Dust index used in the cost (0 when the dust layer is not loaded). */
    public double dustForCost(int i) {
        return HexAStar.hasDust ? dustOrDefault(i) : 0;
    }

    /** Direction-free cost factor of entering cell i (no uphill/downhill terms); NaN when blocked. */
    public double cellFactor(int i) {
        if (blockedBy(i) != null) return Double.NaN;
        return HexAStar.factor(-1, i, 1, this);
    }
}
