"""
CLPS Lunar Mission Browser — FastAPI Backend
==========================================
Serves preset lunar sites, ephemeris & visibility computation, 360-deg LOLA
terrain horizon profiles, year-long landing date sweeps, CSV/JSON exports, and
JPL Horizons validation metrics, backed by SQLite caching.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator

from ephemeris import LunarEphemerisEngine
from horizon import get_horizon_profile
from metrics import compute_site_samples_and_metrics

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CACHE_DB = Path(__file__).resolve().parent / "ephemeris_cache.sqlite"
DEM_PATH = DATA_DIR / "ldem_80s_20m.tif"

app = FastAPI(title="CLPS Lunar Mission Browser API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = LunarEphemerisEngine()


def _init_cache() -> None:
    with sqlite3.connect(CACHE_DB) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS compute_cache (
                cache_key TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )


_init_cache()


class SiteInput(BaseModel):
    id: str
    name: str
    shortName: Optional[str] = None
    lat: float = Field(..., ge=-90.0, le=90.0)
    lon: float = Field(..., ge=-180.0, le=360.0)
    heightKm: float = Field(0.0, ge=-15.0, le=20.0)
    color: str = "#F59E0B"
    sourceNote: str = ""
    isPreset: bool = False


class ComputeRequest(BaseModel):
    sites: List[SiteInput] = Field(..., min_length=1, max_length=5)
    start: str
    end: str
    stepMinutes: int = Field(60, ge=10, le=360)
    horizon_mode: Literal["smooth", "terrain"] = "terrain"
    earth_margin: float = Field(0.0, ge=-5.0, le=30.0)
    panel_type: Literal["vertical_tracking", "horizontal_fixed"] = "vertical_tracking"

    @field_validator("end")
    @classmethod
    def check_dates(cls, v: str, info):
        start_s = info.data.get("start")
        if not start_s:
            return v
        t0 = datetime.fromisoformat(start_s.replace("Z", "+00:00"))
        t1 = datetime.fromisoformat(v.replace("Z", "+00:00"))
        if t1 <= t0:
            raise ValueError("end must be strictly after start")
        if (t1 - t0) > timedelta(days=731):
            raise ValueError("maximum allowed time span is 2 years")
        return v


def _build_timestamps(start_iso: str, end_iso: str, step_minutes: int) -> List[datetime]:
    t0 = datetime.fromisoformat(start_iso.replace("Z", "+00:00")).astimezone(timezone.utc)
    t1 = datetime.fromisoformat(end_iso.replace("Z", "+00:00")).astimezone(timezone.utc)
    if (t1 - t0) > timedelta(days=731):
        raise HTTPException(status_code=400, detail="Time range cannot exceed 2 years.")
    step = timedelta(minutes=step_minutes)
    out = []
    cur = t0
    while cur <= t1:
        out.append(cur)
        cur += step
    return out


def _cache_key(req: ComputeRequest) -> str:
    raw = json.dumps(req.model_dump(), sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@app.get("/api/sites")
def get_sites():
    with (DATA_DIR / "preset_sites.json").open("r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/horizon/{site_id}")
def get_site_horizon(
    site_id: str,
    lat: Optional[float] = Query(None, ge=-90.0, le=90.0),
    lon: Optional[float] = Query(None, ge=-180.0, le=360.0),
    heightKm: float = Query(0.0, ge=-15.0, le=20.0),
    mode: Literal["smooth", "terrain"] = "terrain",
):
    sites = get_sites()
    preset = next((s for s in sites if s["id"] == site_id), None)
    if preset:
        lat_v, lon_v, h_v = preset["lat"], preset["lon"], preset["heightKm"]
    elif lat is not None and lon is not None:
        lat_v, lon_v, h_v = lat, lon, heightKm
    else:
        raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found and lat/lon not provided")

    profile = get_horizon_profile(site_id, lat_v, lon_v, h_v, mode, DEM_PATH)
    return {"siteId": site_id, "mode": mode, "profileDeg": profile}


@app.post("/api/compute")
def compute(req: ComputeRequest):
    key = _cache_key(req)
    with sqlite3.connect(CACHE_DB) as conn:
        row = conn.execute("SELECT payload_json FROM compute_cache WHERE cache_key = ?", (key,)).fetchone()
        if row:
            payload = json.loads(row[0])
            payload["cached"] = True
            return payload

    timestamps = _build_timestamps(req.start, req.end, req.stepMinutes)
    results = []
    for site in req.sites:
        profile = get_horizon_profile(
            site.id, site.lat, site.lon, site.heightKm, req.horizon_mode, DEM_PATH
        )
        eph_pts = engine.compute_az_el(site.lat, site.lon, site.heightKm, timestamps)
        computed = compute_site_samples_and_metrics(
            eph_pts, profile, req.earth_margin, req.panel_type, req.stepMinutes
        )
        results.append(
            {
                "site": site.model_dump(),
                "horizonProfileDeg": profile,
                "samples": computed["samples"],
                "metrics": computed["metrics"],
            }
        )

    payload = {
        "params": req.model_dump(),
        "computedAtIso": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "cached": False,
        "engineMode": engine.mode,
        "results": results,
    }
    with sqlite3.connect(CACHE_DB) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO compute_cache (cache_key, payload_json, created_at) VALUES (?, ?, ?)",
            (key, json.dumps(payload), payload["computedAtIso"]),
        )
    return payload


@app.get("/api/export")
def export_results(
    format: Literal["csv", "json"] = "csv",
    site_id: str = "shackleton_rim",
    start: str = "2027-03-01T00:00:00Z",
    end: str = "2027-03-15T00:00:00Z",
    stepMinutes: int = Query(60, ge=10, le=360),
    horizon_mode: Literal["smooth", "terrain"] = "terrain",
    earth_margin: float = 0.0,
    panel_type: Literal["vertical_tracking", "horizontal_fixed"] = "vertical_tracking",
):
    sites = get_sites()
    site_obj = next((s for s in sites if s["id"] == site_id), sites[0])
    req = ComputeRequest(
        sites=[SiteInput(**site_obj)],
        start=start,
        end=end,
        stepMinutes=stepMinutes,
        horizon_mode=horizon_mode,
        earth_margin=earth_margin,
        panel_type=panel_type,
    )
    data = compute(req)
    if format == "json":
        return JSONResponse(content=data)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "site_id",
            "timestamp_utc",
            "sun_az_deg",
            "sun_el_deg",
            "sun_visible_fraction",
            "earth_az_deg",
            "earth_el_deg",
            "earth_visible",
            "horizon_sun_el_deg",
            "horizon_earth_el_deg",
            "both_visible",
            "power_factor",
        ]
    )
    for res in data["results"]:
        sid = res["site"]["id"]
        for s in res["samples"]:
            writer.writerow(
                [
                    sid,
                    s["timestampIso"],
                    s["sunAzDeg"],
                    s["sunElDeg"],
                    s["sunVisibleFraction"],
                    s["earthAzDeg"],
                    s["earthElDeg"],
                    s["earthVisible"],
                    s["horizonSunElDeg"],
                    s["horizonEarthElDeg"],
                    s["bothVisible"],
                    s["powerFactor"],
                ]
            )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=clps_{site_id}.csv"},
    )
