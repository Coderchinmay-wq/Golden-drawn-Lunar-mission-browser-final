export type HorizonMode = 'smooth' | 'terrain';
export type PanelType = 'vertical_tracking' | 'horizontal_fixed';
export type WorkspaceTab =
  | 'sky'
  | 'timeline'
  | 'elevation'
  | 'compare'
  | 'heatmap'
  | 'validation';

export interface LunarSite {
  id: string;
  name: string;
  shortName?: string;
  lat: number;
  lon: number;
  heightKm: number;
  color: string;
  sourceNote: string;
  isPreset: boolean;
}

export interface TimeStepSample {
  timestampIso: string;
  sunAzDeg: number;
  sunElDeg: number;
  sunVisibleFraction: number; // 0..1 accounting for 0.267 deg solar disk angular radius
  earthAzDeg: number;
  earthElDeg: number;
  earthVisible: boolean;
  horizonSunElDeg: number;
  horizonEarthElDeg: number;
  bothVisible: boolean;
  powerFactor: number; // 0..1 relative to rated solar panel output
}

export interface VisibilityWindow {
  type: 'sun' | 'earth' | 'both';
  startIso: string;
  endIso: string;
  durationHours: number;
}

export interface SiteMetrics {
  sunlitAnyPct: number;
  sunlitHalfPct: number;
  sunlitFullPct: number;
  earthVisiblePct: number;
  bothVisiblePct: number;
  longestDarknessHours: number;
  longestEarthBlackoutHours: number;
  avgPowerFraction: number;
  totalHours: number;
  windows: VisibilityWindow[];
}

export interface SiteComputationResult {
  site: LunarSite;
  horizonProfileDeg: number[]; // 360 bins (0..359 deg azimuth clockwise from North)
  samples: TimeStepSample[];
  metrics: SiteMetrics;
}

export interface ComputeRequest {
  sites: LunarSite[];
  start: string;
  end: string;
  stepMinutes: number;
  horizon_mode: HorizonMode;
  earth_margin: number;
  panel_type: PanelType;
}

export interface ComputeResponse {
  params: ComputeRequest;
  computedAtIso: string;
  cached: boolean;
  results: SiteComputationResult[];
}

export interface HeatmapCell {
  landingDateIso: string;
  bothVisiblePct: number;
  sunlitAnyPct: number;
  earthVisiblePct: number;
  longestDarknessHours: number;
}

export interface SiteHeatmapSeries {
  site: LunarSite;
  cells: HeatmapCell[];
}

export interface HorizonsValidationRow {
  siteName: string;
  lat: number;
  lon: number;
  epochIso: string;
  horizonsSunAzDeg: number;
  horizonsSunElDeg: number;
  computedSunAzDeg: number;
  computedSunElDeg: number;
  sunAngularErrorDeg: number;
  horizonsEarthAzDeg: number;
  horizonsEarthElDeg: number;
  computedEarthAzDeg: number;
  computedEarthElDeg: number;
  earthAngularErrorDeg: number;
  passed: boolean;
}

export interface ValidationReport {
  toleranceDeg: number;
  maxSunErrorDeg: number;
  maxEarthErrorDeg: number;
  poleSanity: {
    sunMaxElDeg: number;
    sunWithinBounds: boolean;
    earthMinElDeg: number;
    earthMaxElDeg: number;
    earthWithinBounds: boolean;
  };
  rows: HorizonsValidationRow[];
}
