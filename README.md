# CLPS Lunar Mission Browser (Chandrahasa CLPS)

An interactive lunar south pole mission planning and educational observatory built for the **NASA Space Apps Challenge 2026**. Pick candidate NASA Artemis / CLPS landing sites and date ranges to inspect Sun illumination, Direct-to-Earth (DTE) radio line-of-sight windows, LRO LOLA terrain horizon masking, and optimal launch dates.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                React + Vite + TypeScript Frontend                    │
│  • South Pole Stereographic SiteMap (Moon Trek WMTS + LOLA Relief)   │
│  • 3D Sky Dome (Three.js WebGL2) & 2D Polar Plot                     │
│  • Gantt Timeline · Elevation & Power Charts · Compare Radar         │
│  • Landing Date Finder Heatmap · Validation Table · Educator Mode    │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ REST (/api/*) + URL State Sync
        ┌──────────────────────────┴──────────────────────────┐
        ▼                                                     ▼
┌──────────────────────────────┐            ┌──────────────────────────┐
│  Live Runtime (Express + TS) │            │  NASA SPICE Backend      │
│  Port 3000 (Instant Preview) │            │  Python 3.11 + FastAPI   │
│  • ELP2000-82B + IAU 2015    │            │  • spiceypy (MOON_ME)    │
│    MOON_ME (<0.01° Horizons) │            │  • Skyfield fallback     │
│  • LOLA Horizon Ray-Marcher  │            │  • GeoTIFF LOLA DEM      │
└──────────────────────────────┘            └──────────────────────────┘
```

---

## Mathematical Formulation

### 1. Body-Fixed MOON_ME to Local Topocentric East-North-Up (ENU)

For a site at planetocentric latitude $\phi$, east longitude $\lambda$, and height $h$ above $R_{\text{moon}} = 1737.4\text{ km}$:

$$\mathbf{U} = [\cos\phi \cos\lambda,\; \cos\phi \sin\lambda,\; \sin\phi]$$

$$\mathbf{E} = [-\sin\lambda,\; \cos\lambda,\; 0]$$

$$\mathbf{N} = [-\sin\phi \cos\lambda,\; -\sin\phi \sin\lambda,\; \cos\phi]$$

$$\mathbf{V}_{\text{topo}} = \mathbf{V}_{\text{target, MOON\_ME}} - (R_{\text{moon}} + h)\mathbf{U}$$

$$\text{Azimuth} = \text{atan2}(\mathbf{V}_{\text{topo}}\cdot\mathbf{E},\; \mathbf{V}_{\text{topo}}\cdot\mathbf{N}) \bmod 360^\circ$$

$$\text{Elevation} = \text{atan2}\left(\mathbf{V}_{\text{topo}}\cdot\mathbf{U},\; \sqrt{(\mathbf{V}_{\text{topo}}\cdot\mathbf{E})^2 + (\mathbf{V}_{\text{topo}}\cdot\mathbf{N})^2}\right)$$

### 2. Solar Disk Visible Fraction ($R_\odot \approx 0.2666^\circ$)

With $\Delta e = e_\odot - e_{\text{horizon}}$ and $u = \text{clamp}(\Delta e / R_\odot, -1, 1)$:

$$f_{\text{visible}} = \frac{1}{2} + \frac{\arcsin(u) + u\sqrt{1 - u^2}}{\pi}$$

### 3. Terrain Horizon Ray-Marching (Lunar Curvature)

Sampling out to $150\text{ km}$ along each $1^\circ$ azimuth bin:

$$e_{\text{terrain}}(d) = \text{atan2}\left(h_{\text{target}} - h_{\text{obs}} - \frac{d^2}{2 R_{\text{moon}}},\; d\right)$$
---

## Setup & Running

### Option A: Live Full-Stack Preview (Node + TypeScript, Port 3000)
```bash
npm install
npm run dev
```

### Option B: Python 3.11 + FastAPI + NAIF SPICE Backend
```bash
cd backend
chmod +x download_kernels.sh
./download_kernels.sh
pip install -r requirements.txt
pytest -v
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Option C: One-Command Docker Compose
```bash
docker compose up --build
```

---

## Data Sources & Credits
- **NAIF / JPL Horizons DE441**: Ephemeris validation truth data (`MOON_ME` frame, kernels `naif0012.tls`, `de440s.bsp`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`).
- **LRO LOLA**: Lunar Orbiter Laser Altimeter south pole elevation profiles and crater topography.
- **NASA Moon Trek WMTS**: South polar stereographic hillshade tiles (`trek.nasa.gov/tiles/Moon/SP/`).
- **Artemis III Candidate Regions**: Coordinates grounded against NASA Artemis III landing region literature.

---

## 2-Minute Demo Video Script
1. **0:00–0:20 (Hook & Simple Mode)**: Open on *Shackleton Crater Rim* in Simple Mode. Show the instant plain-English answer ("Is it sunny? Can it see Earth?") and scrub the timeline bar.
2. **0:20–0:45 (3D Sky Dome & Libration)**: Switch to *Sky View*, press *Animate*, and orbit the 3D dome to show the Sun skimming the crater horizon while Earth traces a vertical ±7° libration loop.
3. **0:45–1:15 (Compare & Expert Mode)**: Toggle *Expert Mode*, select *Malapert Massif* and *Mons Mouton* on the South Pole Map, and open *Compare* to contrast solar persistence vs. Earth DTE uptime and longest darkness hours.
4. **1:15–1:40 (Landing Date Finder & Validation)**: Open *Landing Date Finder* to scan 2027, click the peak emerald cell to snap the window, then show the *Validation* tab proving `< 0.01°` agreement with JPL Horizons.
5. **1:40–2:00 (Educator Mode & Export)**: Trigger *Share Link*, download the one-page *PDF Brief*, and spotlight *Educator Lessons* for classrooms.
