/**
 * Visibility Metrics, Solar Disk Fraction, Windows, Power Model & Validation
 * =========================================================================
 */

import fs from 'fs';
import path from 'path';
import {
  computeSunEarthAzEl,
  SOLAR_ANGULAR_RADIUS_DEG,
} from './ephemeris';
import type {
  HeatmapCell,
  HorizonsValidationRow,
  PanelType,
  SiteMetrics,
  TimeStepSample,
  ValidationReport,
  VisibilityWindow,
} from '../src/types/mission';

const DEG2RAD = Math.PI / 180;

/**
 * Circular-segment visible fraction of the solar disk (radius R = 0.2666 deg).
 * Let u = clamp((sunEl - horizonEl) / R, -1, 1):
 *   visibleFraction = 0.5 + (asin(u) + u * sqrt(1 - u^2)) / pi
 */
export function sunDiskVisibleFraction(sunElDeg: number, horizonElDeg: number): number {
  const dEl = sunElDeg - horizonElDeg;
  const r = SOLAR_ANGULAR_RADIUS_DEG;
  if (dEl >= r) return 1;
  if (dEl <= -r) return 0;
  const u = Math.max(-1, Math.min(1, dEl / r));
  const frac = 0.5 + (Math.asin(u) + u * Math.sqrt(Math.max(0, 1 - u * u))) / Math.PI;
  return Math.max(0, Math.min(1, frac));
}

export function horizonAtAzimuth(profile360: number[], azDeg: number): number {
  const norm = ((azDeg % 360) + 360) % 360;
  const i0 = Math.floor(norm) % 360;
  const i1 = (i0 + 1) % 360;
  const t = norm - Math.floor(norm);
  return profile360[i0] * (1 - t) + profile360[i1] * t;
}

/**
 * Simple solar power model relative to rated panel output:
 *   P / P_rated = visibleFraction * cos(incidenceAngle)
 * - vertical_tracking: vertical panel tracks Sun in azimuth -> incidence = |sunEl|
 * - horizontal_fixed: flat horizontal panel -> incidence = 90 - sunEl -> cos(i) = sin(sunEl)
 */
export function panelPowerFactor(
  sunElDeg: number,
  visibleFraction: number,
  panelType: PanelType
): number {
  if (visibleFraction <= 0 || sunElDeg <= -SOLAR_ANGULAR_RADIUS_DEG) return 0;
  const elRad = Math.max(0, sunElDeg) * DEG2RAD;
  if (panelType === 'horizontal_fixed') {
    return visibleFraction * Math.max(0, Math.sin(elRad));
  }
  return visibleFraction * Math.max(0, Math.cos(elRad));
}

function extractWindows(
  timestamps: string[],
  flags: boolean[],
  stepHours: number,
  type: 'sun' | 'earth' | 'both'
): VisibilityWindow[] {
  const windows: VisibilityWindow[] = [];
  let inWin = false;
  let startIdx = 0;

  for (let i = 0; i < flags.length; i++) {
    if (flags[i] && !inWin) {
      inWin = true;
      startIdx = i;
    } else if (!flags[i] && inWin) {
      inWin = false;
      windows.push({
        type,
        startIso: timestamps[startIdx],
        endIso: timestamps[i],
        durationHours: Number(((i - startIdx) * stepHours).toFixed(2)),
      });
    }
  }
  if (inWin) {
    windows.push({
      type,
      startIso: timestamps[startIdx],
      endIso: timestamps[flags.length - 1],
      durationHours: Number(((flags.length - startIdx) * stepHours).toFixed(2)),
    });
  }
  return windows;
}

function longestFalseRunHours(flags: boolean[], stepHours: number): number {
  let longest = 0;
  let cur = 0;
  for (const f of flags) {
    if (!f) {
      cur++;
      if (cur > longest) longest = cur;
    } else {
      cur = 0;
    }
  }
  return Number((longest * stepHours).toFixed(2));
}

export function computeSamplesAndMetrics(
  latDeg: number,
  lonDeg: number,
  heightKm: number,
  timestamps: Date[],
  horizonProfile: number[],
  earthMarginDeg: number,
  panelType: PanelType,
  stepMinutes: number
): { samples: TimeStepSample[]; metrics: SiteMetrics } {
  const stepHours = stepMinutes / 60;
  const samples: TimeStepSample[] = new Array(timestamps.length);
  const sunAny: boolean[] = new Array(timestamps.length);
  const sunHalf: boolean[] = new Array(timestamps.length);
  const sunFull: boolean[] = new Array(timestamps.length);
  const earthVisArr: boolean[] = new Array(timestamps.length);
  const bothArr: boolean[] = new Array(timestamps.length);
  const tsIso: string[] = new Array(timestamps.length);
  let powerSum = 0;

  for (let i = 0; i < timestamps.length; i++) {
    const eph = computeSunEarthAzEl(latDeg, lonDeg, heightKm, timestamps[i]);
    const hSun = horizonAtAzimuth(horizonProfile, eph.sunAzDeg);
    const hEarth = horizonAtAzimuth(horizonProfile, eph.earthAzDeg);
    const sunFrac = sunDiskVisibleFraction(eph.sunElDeg, hSun);
    const earthVis = eph.earthElDeg > hEarth + earthMarginDeg;
    const both = sunFrac > 0 && earthVis;
    const pwr = panelPowerFactor(eph.sunElDeg, sunFrac, panelType);

    tsIso[i] = eph.timestampIso;
    sunAny[i] = sunFrac > 0;
    sunHalf[i] = sunFrac >= 0.5;
    sunFull[i] = sunFrac >= 0.999;
    earthVisArr[i] = earthVis;
    bothArr[i] = both;
    powerSum += pwr;

    samples[i] = {
      timestampIso: eph.timestampIso,
      sunAzDeg: Number(eph.sunAzDeg.toFixed(4)),
      sunElDeg: Number(eph.sunElDeg.toFixed(4)),
      sunVisibleFraction: Number(sunFrac.toFixed(4)),
      earthAzDeg: Number(eph.earthAzDeg.toFixed(4)),
      earthElDeg: Number(eph.earthElDeg.toFixed(4)),
      earthVisible: earthVis,
      horizonSunElDeg: Number(hSun.toFixed(3)),
      horizonEarthElDeg: Number(hEarth.toFixed(3)),
      bothVisible: both,
      powerFactor: Number(pwr.toFixed(4)),
    };
  }

  const n = Math.max(1, samples.length);
  const count = (arr: boolean[]) => arr.reduce((acc, v) => acc + (v ? 1 : 0), 0);

  const windows = [
    ...extractWindows(tsIso, sunAny, stepHours, 'sun'),
    ...extractWindows(tsIso, earthVisArr, stepHours, 'earth'),
    ...extractWindows(tsIso, bothArr, stepHours, 'both'),
  ];

  const metrics: SiteMetrics = {
    sunlitAnyPct: Number(((100 * count(sunAny)) / n).toFixed(2)),
    sunlitHalfPct: Number(((100 * count(sunHalf)) / n).toFixed(2)),
    sunlitFullPct: Number(((100 * count(sunFull)) / n).toFixed(2)),
    earthVisiblePct: Number(((100 * count(earthVisArr)) / n).toFixed(2)),
    bothVisiblePct: Number(((100 * count(bothArr)) / n).toFixed(2)),
    longestDarknessHours: longestFalseRunHours(sunAny, stepHours),
    longestEarthBlackoutHours: longestFalseRunHours(earthVisArr, stepHours),
    avgPowerFraction: Number((powerSum / n).toFixed(4)),
    totalHours: Number((n * stepHours).toFixed(2)),
    windows,
  };

  return { samples, metrics };
}

/**
 * Year-long sweep for Landing Date Finder heatmap.
 * Evaluates a sliding mission window (missionDays) starting every 3 days across 365 days
 * using 2-hour sampling steps for sub-second speed across multiple sites.
 */
export function computeLandingHeatmap(
  latDeg: number,
  lonDeg: number,
  heightKm: number,
  yearStartIso: string,
  missionDays: number,
  horizonProfile: number[],
  earthMarginDeg: number
): HeatmapCell[] {
  const startMs = new Date(yearStartIso).getTime();
  const stepHours = 2;
  const totalDays = 365 + missionDays;
  const totalSteps = Math.ceil((totalDays * 24) / stepHours);

  const sunArr: boolean[] = new Array(totalSteps);
  const earthArr: boolean[] = new Array(totalSteps);
  const bothArr: boolean[] = new Array(totalSteps);

  for (let i = 0; i < totalSteps; i++) {
    const dt = new Date(startMs + i * stepHours * 3600000);
    const eph = computeSunEarthAzEl(latDeg, lonDeg, heightKm, dt);
    const hSun = horizonAtAzimuth(horizonProfile, eph.sunAzDeg);
    const hEarth = horizonAtAzimuth(horizonProfile, eph.earthAzDeg);
    const sunOk = sunDiskVisibleFraction(eph.sunElDeg, hSun) > 0;
    const earthOk = eph.earthElDeg > hEarth + earthMarginDeg;
    sunArr[i] = sunOk;
    earthArr[i] = earthOk;
    bothArr[i] = sunOk && earthOk;
  }

  const windowSteps = Math.max(1, Math.round((missionDays * 24) / stepHours));
  const cells: HeatmapCell[] = [];

  for (let day = 0; day < 365; day += 3) {
    const idx0 = Math.round((day * 24) / stepHours);
    const idx1 = Math.min(totalSteps, idx0 + windowSteps);
    const len = Math.max(1, idx1 - idx0);
    let sCount = 0;
    let eCount = 0;
    let bCount = 0;
    let darkRun = 0;
    let maxDark = 0;

    for (let j = idx0; j < idx1; j++) {
      if (sunArr[j]) {
        sCount++;
        darkRun = 0;
      } else {
        darkRun++;
        if (darkRun > maxDark) maxDark = darkRun;
      }
      if (earthArr[j]) eCount++;
      if (bothArr[j]) bCount++;
    }

    const dDate = new Date(startMs + day * 86400000).toISOString().slice(0, 10);
    cells.push({
      landingDateIso: dDate,
      bothVisiblePct: Number(((100 * bCount) / len).toFixed(1)),
      sunlitAnyPct: Number(((100 * sCount) / len).toFixed(1)),
      earthVisiblePct: Number(((100 * eCount) / len).toFixed(1)),
      longestDarknessHours: Number((maxDark * stepHours).toFixed(1)),
    });
  }

  return cells;
}

function angularSepDeg(az1: number, el1: number, az2: number, el2: number): number {
  const c =
    Math.sin(el1 * DEG2RAD) * Math.sin(el2 * DEG2RAD) +
    Math.cos(el1 * DEG2RAD) * Math.cos(el2 * DEG2RAD) * Math.cos((az1 - az2) * DEG2RAD);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG2RAD;
}

export function buildValidationReport(): ValidationReport {
  const refPath = path.resolve(process.cwd(), 'data', 'horizons_reference.json');
  const rawRows: Array<{
    siteName: string;
    lon: number;
    lat: number;
    heightKm: number;
    epochIso: string;
    sunAzDeg: number;
    sunElDeg: number;
    earthAzDeg: number;
    earthElDeg: number;
  }> = JSON.parse(fs.readFileSync(refPath, 'utf8'));

  const toleranceDeg = 0.05;
  let maxSunErrorDeg = 0;
  let maxEarthErrorDeg = 0;

  const rows: HorizonsValidationRow[] = rawRows.map((r) => {
    const pt = computeSunEarthAzEl(r.lat, r.lon, r.heightKm, new Date(r.epochIso));
    const sunErr = angularSepDeg(pt.sunAzDeg, pt.sunElDeg, r.sunAzDeg, r.sunElDeg);
    const earthErr = angularSepDeg(pt.earthAzDeg, pt.earthElDeg, r.earthAzDeg, r.earthElDeg);
    maxSunErrorDeg = Math.max(maxSunErrorDeg, sunErr);
    maxEarthErrorDeg = Math.max(maxEarthErrorDeg, earthErr);
    return {
      siteName: r.siteName,
      lat: r.lat,
      lon: r.lon,
      epochIso: r.epochIso,
      horizonsSunAzDeg: r.sunAzDeg,
      horizonsSunElDeg: r.sunElDeg,
      computedSunAzDeg: Number(pt.sunAzDeg.toFixed(4)),
      computedSunElDeg: Number(pt.sunElDeg.toFixed(4)),
      sunAngularErrorDeg: Number(sunErr.toFixed(4)),
      horizonsEarthAzDeg: r.earthAzDeg,
      horizonsEarthElDeg: r.earthElDeg,
      computedEarthAzDeg: Number(pt.earthAzDeg.toFixed(4)),
      computedEarthElDeg: Number(pt.earthElDeg.toFixed(4)),
      earthAngularErrorDeg: Number(earthErr.toFixed(4)),
      passed: sunErr < toleranceDeg && earthErr < toleranceDeg,
    };
  });

  // Pole sanity check across 1 year (2027) at South Pole (-90, 0)
  const startPole = Date.UTC(2027, 0, 1, 0, 0, 0);
  let sunMaxElDeg = -90;
  let earthMinElDeg = 90;
  let earthMaxElDeg = -90;
  for (let h = 0; h < 365 * 24; h += 6) {
    const pt = computeSunEarthAzEl(-90, 0, 0, new Date(startPole + h * 3600000));
    if (pt.sunElDeg > sunMaxElDeg) sunMaxElDeg = pt.sunElDeg;
    if (pt.earthElDeg < earthMinElDeg) earthMinElDeg = pt.earthElDeg;
    if (pt.earthElDeg > earthMaxElDeg) earthMaxElDeg = pt.earthElDeg;
  }

  return {
    toleranceDeg,
    maxSunErrorDeg: Number(maxSunErrorDeg.toFixed(4)),
    maxEarthErrorDeg: Number(maxEarthErrorDeg.toFixed(4)),
    poleSanity: {
      sunMaxElDeg: Number(sunMaxElDeg.toFixed(3)),
      sunWithinBounds: sunMaxElDeg <= 1.65,
      earthMinElDeg: Number(earthMinElDeg.toFixed(3)),
      earthMaxElDeg: Number(earthMaxElDeg.toFixed(3)),
      earthWithinBounds: earthMinElDeg >= -8.0 && earthMaxElDeg <= 8.0,
    },
    rows,
  };
}
