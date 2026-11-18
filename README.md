# CLPS Lunar Mission Browser (Chandrahasa CLPS Lunar Browser)

An interactive lunar south pole mission planning and educational observatory built for the **NASA Space Apps Challenge 2026**. Pick candidate NASA Artemis / CLPS landing sites and date ranges to inspect Sun illumination, Direct-to-Earth (DTE) radio line-of-sight windows, LRO LOLA terrain horizon masking, and optimal launch dates.

## 🚀 Live Website
[Open CLPS Lunar Mission Browser](https://chandrahas-clps.onrender.com/?mode=simple&tab=timeline&start=2027-03-01T00%3A00%3A00Z&end=2027-03-15T00%3A00%3A00Z&step=60&horizon=terrain&margin=0&panel=vertical_tracking&days=14&sites=%5B%7B%22id%22%3A%22shackleton_rim%22%7D%5D)

## 📂 Project Resources

- [Presentations](https://github.com/Coderchinmay-wq/Golden-drawn-Lunar-mission-browser-final/blob/bfd7e812105d29ab30ff5b4944533567073ec06b/PPTs%20and%20other%20docs/google%20drive%20link%20for%20all%20folders.md)
- [Datasets & Sources](PPTs%20and%20other%20docs/Sources%20datas%20link.md)

## 💻 Source Code
- Frontend: [src/](src/)
- Backend: [backend/](backend/)
- Server: [server/](server/)

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

$$\mathbf{V}_{\text{topo}} = \mathbf{V}_{\text{target, MOON\-ME}} - (R_{\text{moon}} + h)\mathbf{U}$$

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
[AI Used in Our Projects](PPTs%20and%20other%20docs/AI%20used%20in%20our%20projects.md)
