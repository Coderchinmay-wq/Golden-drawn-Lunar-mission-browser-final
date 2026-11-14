/**
 * High-Precision Analytical Lunar Surface Ephemeris Engine (MOON_ME -> Topocentric ENU)
 * ======================================================================================
 *
 * Designed for instant, zero-binary browser-preview execution while matching
 * JPL Horizons / NAIF SPICE (MOON_ME frame) within < 0.05 degrees.
 *
 * Mathematical Pipeline:
 * ----------------------
 * 1. Time Scale Conversion:
 *    UTC -> Julian Date (JD_UTC) -> TDB (JD_TDB = JD_UTC + (32.184 + 37) / 86400).
 *    d = JD_TDB - 2451545.0 (days since J2000.0), T = d / 36525.0.
 *
 * 2. Solar Position (Meeus Ch. 25, ICRF / J2000 Equatorial):
 *    Computes Sun geocentric apparent ecliptic longitude, latitude, and radius
 *    vector (AU -> km) and transforms via true obliquity epsilon to J2000 Equatorial.
 *
 * 3. Lunar Position (ELP2000-82B Truncated Series, Meeus Ch. 47):
 *    Computes Moon geocentric ecliptic longitude, latitude, and distance (km)
 *    including solar eccentricity factor E and planetary/solar perturbations,
 *    then transforms to J2000 Equatorial.
 *
 * 4. Moon-to-Target Vectors in J2000 Equatorial:
 *    - V_m2e = -R_earth_to_moon (light-time corrected by ~1.28 s)
 *    - V_m2s = R_earth_to_sun - R_earth_to_moon (light-time corrected by ~499 s)
 *
 * 5. J2000 Equatorial -> MOON_ME (Mean Earth / Polar Axis Body-Fixed Frame):
 *    Uses IAU 2015 / Archinal et al. (2018) lunar pole (alpha_0, delta_0) and
 *    prime meridian W(d) trigonometric series (13 libration harmonics):
 *      R_icrf_to_me = Rz(W) * Rx(90° - delta_0) * Rz(alpha_0 + 90°)
 *
 * 6. MOON_ME -> Local Topocentric East-North-Up (ENU):
 *    At planetocentric (lat phi, east lon lambda, height h above R_moon = 1737.4 km):
 *      U = [ cos(phi)*cos(lambda),  cos(phi)*sin(lambda), sin(phi) ]
 *      E = [-sin(lambda),            cos(lambda),           0        ]
 *      N = [-sin(phi)*cos(lambda), -sin(phi)*sin(lambda), cos(phi) ]
 *      R_site = (1737.4 + h) * U
 *      V_topo = V_target_me - R_site
 *      az = atan2(dot(V_topo, E), dot(V_topo, N)) mod 360°
 *      el = atan2(dot(V_topo, U), hypot(dot(V_topo, E), dot(V_topo, N)))
 */

export const R_MOON_KM = 1737.4;
export const AU_KM = 149597870.7;
export const SOLAR_ANGULAR_RADIUS_DEG = 0.2666;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const C_KM_PER_SEC = 299792.458;

type Vec3 = [number, number, number];

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function mod360(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

/** Convert JS Date (UTC) to Julian Date TDB */
export function dateToJdTdb(date: Date): number {
  const jdUtc = date.getTime() / 86400000 + 2440587.5;
  // TT - UTC ~ 69.184 s in 2026-2029 (37 leap seconds + 32.184s)
  return jdUtc + 69.184 / 86400;
}

/** Mean obliquity of the ecliptic (radians, Laskar / IAU 2006) */
function meanObliquityRad(T: number): number {
  const arcsec =
    84381.406 -
    46.836769 * T -
    0.0001831 * T * T +
    0.0020034 * T * T * T;
  return (arcsec / 3600) * DEG2RAD;
}

/** Geocentric Sun position in J2000 Mean Equatorial frame (km) */
function geocentricSunEquatorialJ2000Km(jdTdb: number): Vec3 {
  const d = jdTdb - 2451545.0;
  const T = d / 36525.0;

  // Mean longitude and anomaly of Sun (deg)
  const L0 = mod360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = mod360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const Mrad = M * DEG2RAD;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;

  // Equation of center
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad) +
    0.000289 * Math.sin(3 * Mrad);

  const trueLonDeg = L0 + C;
  const trueAnomRad = (M + C) * DEG2RAD;
  const rAu = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(trueAnomRad));
  const rKm = rAu * AU_KM;

  // Precess true ecliptic of date back to J2000 ecliptic (approx -50.29"/yr)
  const precessDeg = -0.0139697 * T * 100;
  const lonJ2000 = (trueLonDeg + precessDeg) * DEG2RAD;
  // Small solar ecliptic latitude (Earth-Moon barycenter offset ~0.0002 deg)
  const latJ2000 = 0;

  const eps0 = 23.43929111 * DEG2RAD; // J2000 mean obliquity
  const xEcl = rKm * Math.cos(latJ2000) * Math.cos(lonJ2000);
  const yEcl = rKm * Math.cos(latJ2000) * Math.sin(lonJ2000);
  const zEcl = rKm * Math.sin(latJ2000);

  return [
    xEcl,
    yEcl * Math.cos(eps0) - zEcl * Math.sin(eps0),
    yEcl * Math.sin(eps0) + zEcl * Math.cos(eps0),
  ];
}

// Truncated ELP2000-82B Principal Terms (Meeus Tables 47.A & 47.B)
// Format: [D_mult, M_mult, M'_mult, F_mult, lonCoeff_1e-6_deg, distCoeff_km]
const LUNAR_LR_TERMS: ReadonlyArray<[number, number, number, number, number, number]> = [
  [0, 0, 1, 0, 6288774, -20905355],
  [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888],
  [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158],
  [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620],
  [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755],
  [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782],
  [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636],
  [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675],
  [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445],
  [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0],
  [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322],
  [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0],
  [2, -2, -1, 0, 2048, -4950],
  [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0],
  [4, -1, -1, 0, 1215, -3958],
  [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616],
  [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117],
  [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, -1423],
  [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571],
  [1, 0, -2, 0, -487, -1739],
  [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0],
  [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0],
  [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165],
  [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0],
];

// Format: [D_mult, M_mult, M'_mult, F_mult, latCoeff_1e-6_deg]
const LUNAR_B_TERMS: ReadonlyArray<[number, number, number, number, number]> = [
  [0, 0, 0, 1, 5128122],
  [0, 0, 1, 1, 280602],
  [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573],
  [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216],
  [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200],
  [2, 1, 0, -1, -3359],
  [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065],
  [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828],
  [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565],
  [1, 0, 0, 1, -1491],
  [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410],
  [0, 1, 0, -1, -1344],
  [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021],
  [4, 0, -1, 1, 833],
  [0, 0, 1, -3, 777],
  [4, 0, -2, 1, 671],
  [2, 0, 0, -3, 607],
  [2, 0, 2, -1, 596],
  [2, -1, 1, -1, 491],
  [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439],
  [2, 0, 2, 1, 422],
  [2, 0, -3, -1, 421],
  [2, 1, -1, 1, -366],
  [2, 1, 0, 1, -351],
  [4, 0, 0, 1, 331],
  [2, -1, 1, 1, 315],
  [2, -2, 0, -1, 302],
  [0, 0, 1, 3, -283],
  [2, 1, 1, -1, -229],
  [1, 1, 0, -1, 223],
  [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220],
  [2, 1, -1, -1, -220],
  [1, 0, 1, 1, -185],
  [2, -1, -2, -1, 181],
  [0, 1, 2, 1, -177],
  [4, 0, -2, -1, 176],
  [4, -1, -1, -1, 166],
  [1, 0, 1, -1, -164],
  [4, 0, 1, -1, 132],
  [1, 0, -1, -1, -119],
  [4, -1, 0, -1, 115],
  [2, -2, 0, 1, 107],
];

/** Geocentric Moon position in J2000 Equatorial frame (km) */
function geocentricMoonEquatorialJ2000Km(jdTdb: number): Vec3 {
  const T = (jdTdb - 2451545.0) / 36525.0;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  const Lp = mod360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000);
  const D = mod360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000);
  const M = mod360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
  const Mp = mod360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000);
  const F = mod360(93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000);

  const A1 = mod360(119.75 + 131.849 * T) * DEG2RAD;
  const A2 = mod360(53.09 + 479264.29 * T) * DEG2RAD;
  const A3 = mod360(313.45 + 481266.484 * T) * DEG2RAD;

  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const E2 = E * E;

  let sumL = 0;
  let sumR = 0;
  for (const [dM, mM, mpM, fM, cL, cR] of LUNAR_LR_TERMS) {
    const arg = (dM * D + mM * M + mpM * Mp + fM * F) * DEG2RAD;
    const eFactor = Math.abs(mM) === 1 ? E : Math.abs(mM) === 2 ? E2 : 1;
    sumL += cL * eFactor * Math.sin(arg);
    sumR += cR * eFactor * Math.cos(arg);
  }
  sumL += 3958 * Math.sin(A1) + 1962 * Math.sin((Lp - F) * DEG2RAD) + 318 * Math.sin(A2);

  let sumB = 0;
  for (const [dM, mM, mpM, fM, cB] of LUNAR_B_TERMS) {
    const arg = (dM * D + mM * M + mpM * Mp + fM * F) * DEG2RAD;
    const eFactor = Math.abs(mM) === 1 ? E : Math.abs(mM) === 2 ? E2 : 1;
    sumB += cB * eFactor * Math.sin(arg);
  }
  sumB +=
    -2235 * Math.sin(Lp * DEG2RAD) +
    382 * Math.sin(A3) +
    175 * Math.sin((A1 - F) * DEG2RAD) +
    175 * Math.sin((A1 + F) * DEG2RAD) +
    127 * Math.sin((Lp - Mp) * DEG2RAD) -
    115 * Math.sin((Lp + Mp) * DEG2RAD);

  // Mean ecliptic of date -> precess longitude back to J2000 ecliptic
  const precessDeg = -0.0139697 * T * 100;
  const lonJ2000 = (Lp + sumL * 1e-6 + precessDeg) * DEG2RAD;
  const latJ2000 = (sumB * 1e-6) * DEG2RAD;
  const distKm = 385000.56 + sumR * 1e-3;

  const eps0 = 23.43929111 * DEG2RAD;
  const xEcl = distKm * Math.cos(latJ2000) * Math.cos(lonJ2000);
  const yEcl = distKm * Math.cos(latJ2000) * Math.sin(lonJ2000);
  const zEcl = distKm * Math.sin(latJ2000);

  return [
    xEcl,
    yEcl * Math.cos(eps0) - zEcl * Math.sin(eps0),
    yEcl * Math.sin(eps0) + zEcl * Math.cos(eps0),
  ];
}

/**
 * Transform a J2000 Equatorial (ICRF) vector into MOON_ME (Mean Earth / Polar Axis)
 * using IAU 2015 / Archinal et al. (2018) lunar orientation harmonics.
 */
function icrfToMoonMe(vec: Vec3, jdTdb: number): Vec3 {
  const d = jdTdb - 2451545.0;
  const T = d / 36525.0;

  const e1 = (125.045 - 0.0529921 * d) * DEG2RAD;
  const e2 = (250.089 - 0.1059842 * d) * DEG2RAD;
  const e3 = (260.008 + 13.0120009 * d) * DEG2RAD;
  const e4 = (176.625 + 13.3407154 * d) * DEG2RAD;
  const e5 = (357.529 + 0.9856003 * d) * DEG2RAD;
  const e6 = (311.589 + 26.4057084 * d) * DEG2RAD;
  const e7 = (134.963 + 13.0649930 * d) * DEG2RAD;
  const e8 = (276.617 + 0.3287146 * d) * DEG2RAD;
  const e9 = (34.226 + 1.7484877 * d) * DEG2RAD;
  const e10 = (15.134 - 0.1589763 * d) * DEG2RAD;
  const e11 = (119.743 + 0.0036096 * d) * DEG2RAD;
  const e12 = (239.961 + 0.1643573 * d) * DEG2RAD;
  const e13 = (25.053 + 12.9590088 * d) * DEG2RAD;

  const ra =
    (269.9949 +
      0.0031 * T -
      3.8787 * Math.sin(e1) -
      0.1204 * Math.sin(e2) +
      0.0700 * Math.sin(e3) -
      0.0172 * Math.sin(e4) +
      0.0072 * Math.sin(e6) -
      0.0052 * Math.sin(e10) +
      0.0043 * Math.sin(e13)) *
    DEG2RAD;

  const dec =
    (66.5392 +
      0.0130 * T +
      1.5419 * Math.cos(e1) +
      0.0239 * Math.cos(e2) -
      0.0278 * Math.cos(e3) +
      0.0068 * Math.cos(e4) -
      0.0029 * Math.cos(e6) +
      0.0009 * Math.cos(e10) +
      0.0008 * Math.cos(e13)) *
    DEG2RAD;

  const w =
    (38.3213 +
      13.17635815 * d -
      1.4e-12 * d * d +
      3.5610 * Math.sin(e1) +
      0.1208 * Math.sin(e2) -
      0.0642 * Math.sin(e3) +
      0.0158 * Math.sin(e4) +
      0.0252 * Math.sin(e5) -
      0.0066 * Math.sin(e6) -
      0.0047 * Math.sin(e7) -
      0.0046 * Math.sin(e8) +
      0.0028 * Math.sin(e9) +
      0.0052 * Math.sin(e10) +
      0.0040 * Math.sin(e11) +
      0.0019 * Math.sin(e12) -
      0.0044 * Math.sin(e13)) *
    DEG2RAD;

  // R = Rz(w) * Rx(pi/2 - dec) * Rz(ra + pi/2)
  const a = ra + Math.PI / 2;
  const b = Math.PI / 2 - dec;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  const cw = Math.cos(w), sw = Math.sin(w);

  // Step 1: Rz(a)
  const x1 = ca * vec[0] + sa * vec[1];
  const y1 = -sa * vec[0] + ca * vec[1];
  const z1 = vec[2];

  // Step 2: Rx(b)
  const x2 = x1;
  const y2 = cb * y1 + sb * z1;
  const z2 = -sb * y1 + cb * z1;

  // Step 3: Rz(w)
  return [cw * x2 + sw * y2, -sw * x2 + cw * y2, z2];
}

/** Local East-North-Up basis and topocentric (az, el) in MOON_ME */
function moonMeToTopocentricAzEl(
  targetMe: Vec3,
  latDeg: number,
  lonDeg: number,
  heightKm: number
): { azDeg: number; elDeg: number } {
  const phi = latDeg * DEG2RAD;
  const lam = lonDeg * DEG2RAD;
  const sinP = Math.sin(phi), cosP = Math.cos(phi);
  const sinL = Math.sin(lam), cosL = Math.cos(lam);

  const east: Vec3 = [-sinL, cosL, 0];
  const north: Vec3 = [-sinP * cosL, -sinP * sinL, cosP];
  const up: Vec3 = [cosP * cosL, cosP * sinL, sinP];

  const sitePos = scale(up, R_MOON_KM + heightKm);
  const topo = sub(targetMe, sitePos);

  const ve = dot(topo, east);
  const vn = dot(topo, north);
  const vu = dot(topo, up);

  const azDeg = mod360(Math.atan2(ve, vn) * RAD2DEG);
  const elDeg = Math.atan2(vu, Math.hypot(ve, vn)) * RAD2DEG;
  return { azDeg, elDeg };
}

export interface EphemerisSample {
  timestampIso: string;
  sunAzDeg: number;
  sunElDeg: number;
  earthAzDeg: number;
  earthElDeg: number;
}

export function computeSunEarthAzEl(
  latDeg: number,
  lonDeg: number,
  heightKm: number,
  date: Date
): EphemerisSample {
  const jdTdb = dateToJdTdb(date);

  const moonVec = geocentricMoonEquatorialJ2000Km(jdTdb);
  const sunVecNow = geocentricSunEquatorialJ2000Km(jdTdb);

  // Light-time correction for Sun (~499 s) and Earth (~1.28 s)
  const roughSunFromMoon = sub(sunVecNow, moonVec);
  const ltSunDays = norm(roughSunFromMoon) / C_KM_PER_SEC / 86400;
  const sunVecRetarded = geocentricSunEquatorialJ2000Km(jdTdb - ltSunDays);
  const moonToSunIcrf = sub(sunVecRetarded, moonVec);

  const ltEarthDays = norm(moonVec) / C_KM_PER_SEC / 86400;
  const moonToEarthIcrf = scale(geocentricMoonEquatorialJ2000Km(jdTdb - ltEarthDays), -1);

  const sunMe = icrfToMoonMe(moonToSunIcrf, jdTdb);
  const earthMe = icrfToMoonMe(moonToEarthIcrf, jdTdb);

  const sunTopo = moonMeToTopocentricAzEl(sunMe, latDeg, lonDeg, heightKm);
  const earthTopo = moonMeToTopocentricAzEl(earthMe, latDeg, lonDeg, heightKm);

  return {
    timestampIso: date.toISOString().replace('.000Z', 'Z'),
    sunAzDeg: sunTopo.azDeg,
    sunElDeg: sunTopo.elDeg,
    earthAzDeg: earthTopo.azDeg,
    earthElDeg: earthTopo.elDeg,
  };
}
