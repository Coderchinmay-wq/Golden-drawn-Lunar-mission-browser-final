/**
 * Lunar Horizon Masking Engine (Smooth Moon & LRO LOLA South Pole Ray-Marcher)
 * =============================================================================
 *
 * Computes a 360-bin (1-degree azimuth resolution, clockwise from North)
 * local terrain horizon elevation profile around a lunar site.
 *
 * Physics & Curvature Formula:
 * ----------------------------
 * For an observer at height h_obs (km) above R_moon = 1737.4 km looking along
 * azimuth A (deg) to a terrain sample at ground arc distance d (km) with
 * elevation h_target (km):
 *   curvature_drop = d^2 / (2 * R_moon)
 *   apparent_el = atan2(h_target - h_obs - curvature_drop, d)
 *
 * The horizon mask elevation at azimuth A is the maximum apparent_el over
 * all distances d from 0.8 km out to 150 km.
 */

import fs from 'fs';
import path from 'path';
import { R_MOON_KM } from './ephemeris';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

let cachedPrecomputed: Record<string, number[]> | null = null;

export function loadPrecomputedProfiles(): Record<string, number[]> {
  if (cachedPrecomputed) return cachedPrecomputed;
  const p = path.resolve(process.cwd(), 'data', 'precomputed_horizons.json');
  if (fs.existsSync(p)) {
    try {
      cachedPrecomputed = JSON.parse(fs.readFileSync(p, 'utf8'));
      return cachedPrecomputed || {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Calibrated analytical LRO LOLA South Pole DEM (elevation in km relative to 1737.4 km).
 * Models Shackleton Crater (~21 km dia, -4.1 km bowl, +1.45 km rim), de Gerlache,
 * Haworth, Shoemaker, Faustini, Nobile, Connecting Ridge, Malapert Massif (+4.85 km),
 * and Leibnitz Beta Plateau / Mons Mouton (+4.6 km).
 */
export function analyticLolaSouthPoleElevationKm(latDeg: number, lonDeg: number): number {
  const colatRad = (90 + latDeg) * DEG2RAD;
  const rPole = R_MOON_KM * Math.max(0, colatRad);
  const lonRad = lonDeg * DEG2RAD;
  const x = rPole * Math.sin(lonRad);
  const y = rPole * Math.cos(lonRad);

  const crater = (cx: number, cy: number, radKm: number, depthKm: number, rimKm: number) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d < radKm) {
      const u = d / radKm;
      return -depthKm * (1 - u * u) + rimKm * Math.pow(u, 4);
    }
    const rimDecay = Math.exp(-Math.pow((d - radKm) / (0.35 * radKm), 2));
    return rimKm * rimDecay;
  };

  const massif = (cx: number, cy: number, sx: number, sy: number, height: number) => {
    const dx = x - cx;
    const dy = y - cy;
    return height * Math.exp(-0.5 * ((dx / sx) ** 2 + (dy / sy) ** 2));
  };

  let h = 0;
  h += crater(7.5, -6.3, 10.5, 4.1, 1.45); // Shackleton
  h += crater(-45.0, 2.5, 16.0, 3.2, 1.15); // de Gerlache
  h += crater(-6.6, 75.5, 25.0, 3.4, 1.05); // Haworth
  h += crater(40.7, 40.7, 25.5, 3.5, 1.10); // Shoemaker
  h += crater(84.0, 8.8, 21.0, 2.9, 0.95); // Faustini
  h += crater(117.0, 86.5, 36.0, 3.6, 1.35); // Nobile
  h += massif(-11.5, -12.0, 14.0, 7.0, 1.35); // Connecting Ridge
  h += massif(5.7, 121.2, 22.0, 14.0, 4.75); // Malapert Massif
  h += massif(72.8, 117.6, 28.0, 24.0, 4.45); // Leibnitz Beta / Mons Mouton
  h += 0.32 * Math.sin(0.055 * x + 0.03 * y) * Math.cos(0.048 * y - 0.02 * x);
  h += 0.18 * Math.sin(0.14 * x - 0.11 * y);
  return h;
}

const RAY_DISTANCES_KM = [
  0.8, 1.5, 2.5, 4.0, 6.0, 9.0, 13.0, 18.0, 25.0, 35.0, 48.0, 65.0, 85.0, 110.0, 135.0, 150.0,
];

export function raymarchSouthPoleHorizon(
  latDeg: number,
  lonDeg: number,
  heightKm: number
): number[] {
  const lat0 = latDeg * DEG2RAD;
  const lon0 = lonDeg * DEG2RAD;
  // If user didn't supply explicit height on a custom site, use the DEM elevation if higher
  const obsHeightKm = heightKm !== 0 ? heightKm : analyticLolaSouthPoleElevationKm(latDeg, lonDeg);

  const profile: number[] = new Array(360);
  for (let az = 0; az < 360; az++) {
    const azRad = az * DEG2RAD;
    let maxEl = -2.5;
    for (const dKm of RAY_DISTANCES_KM) {
      const ang = dKm / R_MOON_KM;
      const sinLat =
        Math.sin(lat0) * Math.cos(ang) +
        Math.cos(lat0) * Math.sin(ang) * Math.cos(azRad);
      const tLat = Math.asin(Math.max(-1, Math.min(1, sinLat)));
      const tLon =
        lon0 +
        Math.atan2(
          Math.sin(azRad) * Math.sin(ang) * Math.cos(lat0),
          Math.cos(ang) - Math.sin(lat0) * Math.sin(tLat)
        );
      const hTarget = analyticLolaSouthPoleElevationKm(tLat * RAD2DEG, tLon * RAD2DEG);
      const curvatureDrop = (dKm * dKm) / (2 * R_MOON_KM);
      const elDeg = Math.atan2(hTarget - obsHeightKm - curvatureDrop, dKm) * RAD2DEG;
      if (elDeg > maxEl) maxEl = elDeg;
    }
    profile[az] = Number(maxEl.toFixed(3));
  }
  return profile;
}

export function getHorizonProfile(
  siteId: string,
  latDeg: number,
  lonDeg: number,
  heightKm: number,
  mode: 'smooth' | 'terrain'
): number[] {
  if (mode === 'smooth') {
    return new Array(360).fill(0);
  }
  const precomputed = loadPrecomputedProfiles();
  if (precomputed[siteId] && precomputed[siteId].length === 360) {
    return precomputed[siteId];
  }
  return raymarchSouthPoleHorizon(latDeg, lonDeg, heightKm);
}
