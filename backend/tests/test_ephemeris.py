"""
Validation tests comparing our LunarEphemerisEngine (MOON_ME -> ENU)
against archived JPL Horizons observer ephemerides across 3 sites x 5 epochs
and enforcing physical sanity bounds at the lunar South Pole.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from ephemeris import LunarEphemerisEngine

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def angular_separation_deg(az1: float, el1: float, az2: float, el2: float) -> float:
    a1, e1 = math.radians(az1), math.radians(el1)
    a2, e2 = math.radians(az2), math.radians(el2)
    cos_sep = math.sin(e1) * math.sin(e2) + math.cos(e1) * math.cos(e2) * math.cos(a1 - a2)
    return math.degrees(math.acos(max(-1.0, min(1.0, cos_sep))))


@pytest.fixture(scope="module")
def engine() -> LunarEphemerisEngine:
    return LunarEphemerisEngine()


def test_horizons_3_sites_5_epochs(engine: LunarEphemerisEngine):
    if engine.mode == "unavailable":
        pytest.skip("SPICE kernels and Skyfield DE421 not downloaded yet")

    ref_path = DATA_DIR / "horizons_reference.json"
    with ref_path.open("r", encoding="utf-8") as f:
        rows = json.load(f)

    assert len(rows) == 15
    for row in rows:
        dt = datetime.fromisoformat(row["epochIso"].replace("Z", "+00:00"))
        pt = engine.compute_az_el(row["lat"], row["lon"], row["heightKm"], [dt])[0]
        sun_err = angular_separation_deg(pt.sun_az_deg, pt.sun_el_deg, row["sunAzDeg"], row["sunElDeg"])
        earth_err = angular_separation_deg(pt.earth_az_deg, pt.earth_el_deg, row["earthAzDeg"], row["earthElDeg"])
        assert sun_err < 0.05, f"Sun error {sun_err:.4f} deg >= 0.05 deg at {row['siteName']} {row['epochIso']}"
        assert earth_err < 0.05, f"Earth error {earth_err:.4f} deg >= 0.05 deg at {row['siteName']} {row['epochIso']}"


def test_south_pole_physical_sanity(engine: LunarEphemerisEngine):
    if engine.mode == "unavailable":
        pytest.skip("SPICE kernels and Skyfield DE421 not downloaded yet")

    # Sample every 6 hours over 1 full year (2027) at exact South Pole (-90, 0)
    t0 = datetime(2027, 1, 1, 0, 0, tzinfo=timezone.utc)
    stamps = [t0 + timedelta(hours=6 * i) for i in range(365 * 4)]
    pts = engine.compute_az_el(-90.0, 0.0, 0.0, stamps)

    max_sun_el = max(p.sun_el_deg for p in pts)
    min_earth_el = min(p.earth_el_deg for p in pts)
    max_earth_el = max(p.earth_el_deg for p in pts)

    # Lunar axial tilt to ecliptic is ~1.54 deg -> Sun elevation at pole never exceeds ~1.6 deg
    assert max_sun_el <= 1.65, f"Polar Sun elevation exceeded 1.65 deg: {max_sun_el}"
    # Lunar optical + physical latitudinal libration keeps Earth within roughly +-7.5 deg
    assert min_earth_el >= -8.0 and max_earth_el <= 8.0, (
        f"Polar Earth libration out of expected range: [{min_earth_el}, {max_earth_el}]"
    )
