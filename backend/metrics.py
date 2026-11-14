"""
Derived Mission Metrics, Solar Disk Fraction, Windows & Power Model
===================================================================

Mathematical Formulas:
----------------------
1. Solar Disk Visible Fraction (angular radius R_sun = 0.2666 deg):
   Let d_el = sun_el - horizon_el (signed angular height of Sun center above
   the local horizon in degrees).
   - If d_el >= R_sun:  fraction = 1.0 (full disk visible)
   - If d_el <= -R_sun: fraction = 0.0 (completely occluded)
   - Otherwise, compute the area fraction of a circular disk of radius R_sun
     above chord y = -d_el:
       x = clamp(-d_el / R_sun, -1, 1)
       occluded_frac = (acos(x) - x * sqrt(1 - x^2)) / pi
       Wait: when d_el > 0 (center above horizon), visible > 0.5:
       visible_frac = 1.0 - (acos(d_el / R_sun) - (d_el / R_sun)*sqrt(1 - (d_el/R_sun)^2)) / pi
       In compact unified form for u = d_el / R_sun in [-1, 1]:
       visible_frac = 0.5 + (asin(u) + u * sqrt(1 - u^2)) / pi

2. Earth DTE Visibility:
   earth_visible = earth_el > (horizon_el + earth_margin_deg)

3. Solar Panel Power Factor (normalized to P_rated = 1.0):
   - Vertical panel tracking in azimuth (standard polar lander configuration):
     Normal vector is horizontal toward Sun azimuth -> incidence angle = |sun_el|
     P / P_rated = visible_fraction * cos(sun_el)
   - Fixed horizontal panel:
     Normal vector points straight Up -> incidence angle = 90 deg - sun_el
     P / P_rated = visible_fraction * max(0, sin(sun_el))
"""

from __future__ import annotations

import math
from typing import Dict, List, Literal

from ephemeris import EphemerisPoint, SOLAR_ANGULAR_RADIUS_DEG


def sun_disk_visible_fraction(sun_el_deg: float, horizon_el_deg: float) -> float:
    d_el = sun_el_deg - horizon_el_deg
    r = SOLAR_ANGULAR_RADIUS_DEG
    if d_el >= r:
        return 1.0
    if d_el <= -r:
        return 0.0
    u = max(-1.0, min(1.0, d_el / r))
    frac = 0.5 + (math.asin(u) + u * math.sqrt(max(0.0, 1.0 - u * u))) / math.pi
    return max(0.0, min(1.0, frac))


def panel_power_factor(sun_el_deg: float, visible_frac: float, panel_type: str) -> float:
    if visible_frac <= 0.0 or sun_el_deg <= -SOLAR_ANGULAR_RADIUS_DEG:
        return 0.0
    el_rad = math.radians(max(0.0, sun_el_deg))
    if panel_type == "horizontal_fixed":
        return visible_frac * max(0.0, math.sin(el_rad))
    # Default: vertical_tracking (azimuth-tracking vertical solar array)
    return visible_frac * max(0.0, math.cos(el_rad))


def horizon_at_azimuth(profile_360: List[float], az_deg: float) -> float:
    az_norm = az_deg % 360.0
    i0 = int(math.floor(az_norm)) % 360
    i1 = (i0 + 1) % 360
    t = az_norm - math.floor(az_norm)
    return profile_360[i0] * (1.0 - t) + profile_360[i1] * t


def _extract_windows(
    timestamps: List[str],
    flags: List[bool],
    step_hours: float,
    win_type: str,
) -> List[Dict]:
    windows = []
    in_win = False
    start_idx = 0
    for i, flag in enumerate(flags):
        if flag and not in_win:
            in_win = True
            start_idx = i
        elif not flag and in_win:
            in_win = False
            dur = (i - start_idx) * step_hours
            windows.append(
                {
                    "type": win_type,
                    "startIso": timestamps[start_idx],
                    "endIso": timestamps[i],
                    "durationHours": round(dur, 2),
                }
            )
    if in_win:
        dur = (len(flags) - start_idx) * step_hours
        windows.append(
            {
                "type": win_type,
                "startIso": timestamps[start_idx],
                "endIso": timestamps[-1],
                "durationHours": round(dur, 2),
            }
        )
    return windows


def _longest_false_run_hours(flags: List[bool], step_hours: float) -> float:
    longest = 0
    cur = 0
    for flag in flags:
        if not flag:
            cur += 1
            if cur > longest:
                longest = cur
        else:
            cur = 0
    return round(longest * step_hours, 2)


def compute_site_samples_and_metrics(
    eph_points: List[EphemerisPoint],
    horizon_profile: List[float],
    earth_margin_deg: float,
    panel_type: Literal["vertical_tracking", "horizontal_fixed"],
    step_minutes: int,
) -> Dict:
    step_hours = step_minutes / 60.0
    samples = []
    sun_any_flags = []
    sun_half_flags = []
    sun_full_flags = []
    earth_flags = []
    both_flags = []
    power_vals = []
    timestamps = []

    for pt in eph_points:
        h_sun = horizon_at_azimuth(horizon_profile, pt.sun_az_deg)
        h_earth = horizon_at_azimuth(horizon_profile, pt.earth_az_deg)
        sun_frac = sun_disk_visible_fraction(pt.sun_el_deg, h_sun)
        earth_vis = pt.earth_el_deg > (h_earth + earth_margin_deg)
        both_vis = (sun_frac > 0.0) and earth_vis
        pwr = panel_power_factor(pt.sun_el_deg, sun_frac, panel_type)

        timestamps.append(pt.timestamp_iso)
        sun_any_flags.append(sun_frac > 0.0)
        sun_half_flags.append(sun_frac >= 0.5)
        sun_full_flags.append(sun_frac >= 0.999)
        earth_flags.append(earth_vis)
        both_flags.append(both_vis)
        power_vals.append(pwr)

        samples.append(
            {
                "timestampIso": pt.timestamp_iso,
                "sunAzDeg": round(pt.sun_az_deg, 4),
                "sunElDeg": round(pt.sun_el_deg, 4),
                "sunVisibleFraction": round(sun_frac, 4),
                "earthAzDeg": round(pt.earth_az_deg, 4),
                "earthElDeg": round(pt.earth_el_deg, 4),
                "earthVisible": earth_vis,
                "horizonSunElDeg": round(h_sun, 3),
                "horizonEarthElDeg": round(h_earth, 3),
                "bothVisible": both_vis,
                "powerFactor": round(pwr, 4),
            }
        )

    n = max(1, len(samples))
    windows = (
        _extract_windows(timestamps, sun_any_flags, step_hours, "sun")
        + _extract_windows(timestamps, earth_flags, step_hours, "earth")
        + _extract_windows(timestamps, both_flags, step_hours, "both")
    )

    metrics = {
        "sunlitAnyPct": round(100.0 * sum(sun_any_flags) / n, 2),
        "sunlitHalfPct": round(100.0 * sum(sun_half_flags) / n, 2),
        "sunlitFullPct": round(100.0 * sum(sun_full_flags) / n, 2),
        "earthVisiblePct": round(100.0 * sum(earth_flags) / n, 2),
        "bothVisiblePct": round(100.0 * sum(both_flags) / n, 2),
        "longestDarknessHours": _longest_false_run_hours(sun_any_flags, step_hours),
        "longestEarthBlackoutHours": _longest_false_run_hours(earth_flags, step_hours),
        "avgPowerFraction": round(sum(power_vals) / n, 4),
        "totalHours": round(n * step_hours, 2),
        "windows": windows,
    }

    return {"samples": samples, "metrics": metrics}
