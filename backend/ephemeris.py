"""
Lunar Surface Ephemeris Engine (NAIF SPICE + Skyfield Fallback)
==============================================================

Computes apparent azimuth and elevation of the Sun and Earth from any lunar
surface site (lat, lon, height_km) using the MOON_ME (Mean Earth / Polar Axis)
body-fixed reference frame.

Mathematical Pipeline (for team lead review):
--------------------------------------------
1. Site Cartesian Vector in MOON_ME:
   Given planetocentric latitude phi, east longitude lambda, and height h above
   the reference lunar sphere R_moon = 1737.4 km:
       r = R_moon + h
       x = r * cos(phi) * cos(lambda)
       y = r * cos(phi) * sin(lambda)
       z = r * sin(phi)

2. Target Vector from Lunar Surface Site:
   Using SPICE spkpos(target, et, "MOON_ME", "LT+S", "MOON") we obtain the
   light-time & stellar-aberration corrected Moon-center-to-target vector V_m2t
   expressed in MOON_ME. Subtracting the site vector gives the topocentric
   target vector:
       V_s2t = V_m2t - R_site

3. MOON_ME -> Local Topocentric East-North-Up (ENU) Basis:
   At (phi, lambda), the unit outward normal (Up), East, and North vectors in
   MOON_ME are:
       U = [ cos(phi)*cos(lambda),  cos(phi)*sin(lambda), sin(phi) ]
       E = [-sin(lambda),            cos(lambda),           0        ]
       N = [-sin(phi)*cos(lambda), -sin(phi)*sin(lambda), cos(phi) ]
   Note: E x N = U (right-handed local horizon frame).
   Projecting V_s2t onto {E, N, U}:
       v_e = dot(V_s2t, E)
       v_n = dot(V_s2t, N)
       v_u = dot(V_s2t, U)

4. Azimuth & Elevation:
   - Azimuth (0 deg = North, increasing clockwise toward East = 90 deg):
       az = atan2(v_e, v_n) mod 360 deg
   - Elevation (above local horizontal tangent plane):
       el = atan2(v_u, sqrt(v_e^2 + v_n^2))
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple

import numpy as np

R_MOON_KM = 1737.4
SOLAR_ANGULAR_RADIUS_DEG = 0.2666  # Mean Sun angular radius at 1 AU (~959.6 arcsec)

KERNEL_FILES = [
    "naif0012.tls",
    "de440s.bsp",
    "pck00011.tpc",
    "moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf",
]


@dataclass
class EphemerisPoint:
    timestamp_iso: str
    sun_az_deg: float
    sun_el_deg: float
    earth_az_deg: float
    earth_el_deg: float


def enu_basis(lat_deg: float, lon_deg: float) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return unit (East, North, Up) basis vectors in MOON_ME."""
    phi = math.radians(lat_deg)
    lam = math.radians(lon_deg)
    sin_p, cos_p = math.sin(phi), math.cos(phi)
    sin_l, cos_l = math.sin(lam), math.cos(lam)

    east = np.array([-sin_l, cos_l, 0.0], dtype=np.float64)
    north = np.array([-sin_p * cos_l, -sin_p * sin_l, cos_p], dtype=np.float64)
    up = np.array([cos_p * cos_l, cos_p * sin_l, sin_p], dtype=np.float64)
    return east, north, up


def vector_to_az_el(vec_moon_me: np.ndarray, lat_deg: float, lon_deg: float, height_km: float) -> Tuple[float, float]:
    """
    Convert a Moon-centered target vector (km, in MOON_ME) to topocentric
    (azimuth_deg, elevation_deg) from a surface site.
    """
    east, north, up = enu_basis(lat_deg, lon_deg)
    site_pos = (R_MOON_KM + height_km) * up
    topo = vec_moon_me - site_pos

    v_e = float(np.dot(topo, east))
    v_n = float(np.dot(topo, north))
    v_u = float(np.dot(topo, up))

    az_deg = math.degrees(math.atan2(v_e, v_n)) % 360.0
    horiz = math.hypot(v_e, v_n)
    el_deg = math.degrees(math.atan2(v_u, horiz))
    return az_deg, el_deg


class LunarEphemerisEngine:
    """
    Unified ephemeris engine: prefers NAIF SPICE (spiceypy + MOON_ME kernels)
    and automatically falls back to Skyfield / JPL DE if kernels are missing.
    """

    def __init__(self, kernel_dir: str | Path | None = None):
        self.kernel_dir = Path(kernel_dir or Path(__file__).parent / "spice_kernels")
        self.mode = "uninitialized"
        self._spice = None
        self._sf_ts = None
        self._sf_eph = None
        self._init_backend()

    def _init_backend(self) -> None:
        # 1. Try NAIF SPICE first
        try:
            import spiceypy as spice

            missing = [k for k in KERNEL_FILES if not (self.kernel_dir / k).exists()]
            if not missing:
                spice.kclear()
                for k in KERNEL_FILES:
                    spice.furnsh(str(self.kernel_dir / k))
                self._spice = spice
                self.mode = "spice"
                return
        except Exception:
            pass

        # 2. Fallback to Skyfield
        try:
            from skyfield.api import load

            self._sf_ts = load.timescale()
            self._sf_eph = load("de421.bsp")
            self.mode = "skyfield"
            return
        except Exception:
            self.mode = "unavailable"

    def compute_az_el(
        self,
        lat_deg: float,
        lon_deg: float,
        height_km: float,
        timestamps_utc: List[datetime],
    ) -> List[EphemerisPoint]:
        """Compute Sun and Earth (az, el) for a list of UTC datetimes."""
        if self.mode == "spice":
            return self._compute_spice(lat_deg, lon_deg, height_km, timestamps_utc)
        if self.mode == "skyfield":
            return self._compute_skyfield(lat_deg, lon_deg, height_km, timestamps_utc)
        raise RuntimeError(
            "Neither NAIF SPICE kernels nor Skyfield DE ephemeris are available. "
            "Run backend/download_kernels.sh first."
        )

    def _compute_spice(
        self,
        lat_deg: float,
        lon_deg: float,
        height_km: float,
        timestamps_utc: List[datetime],
    ) -> List[EphemerisPoint]:
        spice = self._spice
        results: List[EphemerisPoint] = []
        for dt in timestamps_utc:
            dt_utc = dt.astimezone(timezone.utc)
            iso = dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
            et = spice.str2et(dt_utc.strftime("%Y-%m-%d %H:%M:%S UTC"))

            # Light-time + stellar aberration corrected target vectors from Moon center in MOON_ME
            sun_pos, _ = spice.spkpos("SUN", et, "MOON_ME", "LT+S", "MOON")
            earth_pos, _ = spice.spkpos("EARTH", et, "MOON_ME", "LT+S", "MOON")

            sun_az, sun_el = vector_to_az_el(np.asarray(sun_pos), lat_deg, lon_deg, height_km)
            earth_az, earth_el = vector_to_az_el(np.asarray(earth_pos), lat_deg, lon_deg, height_km)

            results.append(
                EphemerisPoint(
                    timestamp_iso=iso,
                    sun_az_deg=sun_az,
                    sun_el_deg=sun_el,
                    earth_az_deg=earth_az,
                    earth_el_deg=earth_el,
                )
            )
        return results

    def _compute_skyfield(
        self,
        lat_deg: float,
        lon_deg: float,
        height_km: float,
        timestamps_utc: List[datetime],
    ) -> List[EphemerisPoint]:
        from skyfield.api import PlanetaryConstants

        ts = self._sf_ts
        eph = self._sf_eph
        moon = eph["moon"]
        sun = eph["sun"]
        earth = eph["earth"]

        # Load lunar PA/ME orientation frame via Skyfield PlanetaryConstants if available,
        # otherwise use J2000 -> IAU_MOON analytical frame approximation.
        pc = PlanetaryConstants()
        # Note: When SPICE kernels are downloaded, self.mode == "spice" is always preferred.
        t = ts.from_datetimes([dt.astimezone(timezone.utc) for dt in timestamps_utc])
        moon_to_sun = (sun - moon).at(t).position.km
        moon_to_earth = (earth - moon).at(t).position.km

        results: List[EphemerisPoint] = []
        for idx, dt in enumerate(timestamps_utc):
            # Approximate MOON_ME rotation via IAU 2015 lunar pole & prime meridian
            jd = t[idx].tdb
            d = jd - 2451545.0
            T = d / 36525.0
            e1 = math.radians(125.045 - 0.0529921 * d)
            e2 = math.radians(250.089 - 0.1059842 * d)
            e3 = math.radians(260.008 + 13.0120009 * d)
            e4 = math.radians(176.625 + 13.3407154 * d)
            e6 = math.radians(311.589 + 26.4057084 * d)
            e10 = math.radians(15.134 - 0.1589763 * d)
            e13 = math.radians(25.762 + 1.3291182 * d)

            ra = math.radians(
                269.9949 + 0.0031 * T - 3.8787 * math.sin(e1) - 0.1204 * math.sin(e2)
                + 0.0700 * math.sin(e3) - 0.0172 * math.sin(e4) + 0.0072 * math.sin(e6)
                - 0.0052 * math.sin(e10) + 0.0043 * math.sin(e13)
            )
            dec = math.radians(
                66.5392 + 0.0130 * T + 1.5419 * math.cos(e1) + 0.0239 * math.cos(e2)
                - 0.0278 * math.cos(e3) + 0.0068 * math.cos(e4) - 0.0029 * math.cos(e6)
                + 0.0009 * math.cos(e10) + 0.0008 * math.cos(e13)
            )
            w = math.radians(
                38.3213 + 13.17635815 * d - 1.4e-12 * d * d
                + 3.5610 * math.sin(e1) + 0.1208 * math.sin(e2) - 0.0642 * math.sin(e3)
                + 0.0158 * math.sin(e4) + 0.0252 * math.sin(e13) - 0.0066 * math.sin(e6)
            )

            # IAU body-fixed rotation Rz(w) * Rx(90 - dec) * Rz(ra + 90)
            a = ra + math.pi / 2.0
            b = math.pi / 2.0 - dec
            rz_a = np.array([[math.cos(a), math.sin(a), 0], [-math.sin(a), math.cos(a), 0], [0, 0, 1]])
            rx_b = np.array([[1, 0, 0], [0, math.cos(b), math.sin(b)], [0, -math.sin(b), math.cos(b)]])
            rz_w = np.array([[math.cos(w), math.sin(w), 0], [-math.sin(w), math.cos(w), 0], [0, 0, 1]])
            rot = rz_w @ rx_b @ rz_a

            sun_me = rot @ moon_to_sun[:, idx]
            earth_me = rot @ moon_to_earth[:, idx]

            s_az, s_el = vector_to_az_el(sun_me, lat_deg, lon_deg, height_km)
            e_az, e_el = vector_to_az_el(earth_me, lat_deg, lon_deg, height_km)

            results.append(
                EphemerisPoint(
                    timestamp_iso=dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    sun_az_deg=s_az,
                    sun_el_deg=s_el,
                    earth_az_deg=e_az,
                    earth_el_deg=e_el,
                )
            )
        return results
