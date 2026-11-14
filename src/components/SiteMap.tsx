import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Globe2, MapPin } from 'lucide-react';
import type { LunarSite } from '../types/mission';

interface SiteMapProps {
  presets: LunarSite[];
  selectedSites: LunarSite[];
  onTogglePreset: (site: LunarSite) => void;
  onAddCustomCoords: (lat: number, lon: number, heightKm: number) => void;
  maxSites?: number;
}

const MAP_SIZE = 280;
const MAX_COLAT_DEG = 7.5; // Displays -90 deg (center) out to -82.5 deg (edge)
const R_MOON_KM = 1737.4;

function evalSouthPoleDemKm(latDeg: number, lonDeg: number): number {
  const colatRad = ((90 + latDeg) * Math.PI) / 180;
  const rPole = R_MOON_KM * Math.max(0, colatRad);
  const lonRad = (lonDeg * Math.PI) / 180;
  const x = rPole * Math.sin(lonRad);
  const y = rPole * Math.cos(lonRad);

  const crater = (cx: number, cy: number, radKm: number, depthKm: number, rimKm: number) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d < radKm) {
      const u = d / radKm;
      return -depthKm * (1 - u * u) + rimKm * Math.pow(u, 4);
    }
    return rimKm * Math.exp(-Math.pow((d - radKm) / (0.35 * radKm), 2));
  };

  const massif = (cx: number, cy: number, sx: number, sy: number, height: number) => {
    const dx = x - cx;
    const dy = y - cy;
    return height * Math.exp(-0.5 * ((dx / sx) ** 2 + (dy / sy) ** 2));
  };

  let h = 0;
  h += crater(7.5, -6.3, 10.5, 4.1, 1.45);
  h += crater(-45.0, 2.5, 16.0, 3.2, 1.15);
  h += crater(-6.6, 75.5, 25.0, 3.4, 1.05);
  h += crater(40.7, 40.7, 25.5, 3.5, 1.1);
  h += crater(84.0, 8.8, 21.0, 2.9, 0.95);
  h += crater(117.0, 86.5, 36.0, 3.6, 1.35);
  h += massif(-11.5, -12.0, 14.0, 7.0, 1.35);
  h += massif(5.7, 121.2, 22.0, 14.0, 4.75);
  h += massif(72.8, 117.6, 28.0, 24.0, 4.45);
  h += 0.32 * Math.sin(0.055 * x + 0.03 * y) * Math.cos(0.048 * y - 0.02 * x);
  h += 0.18 * Math.sin(0.14 * x - 0.11 * y);
  return h;
}

/** Project (lat, lon) onto South Polar Stereographic canvas (0°E at top / Earthward) */
function latLonToCanvas(lat: number, lon: number): { x: number; y: number } {
  const colat = Math.max(0, 90 + lat); // 0 at pole, 7.5 at edge
  const r = (colat / MAX_COLAT_DEG) * (MAP_SIZE * 0.46);
  const rad = (lon * Math.PI) / 180;
  return {
    x: MAP_SIZE / 2 + r * Math.sin(rad),
    y: MAP_SIZE / 2 - r * Math.cos(rad),
  };
}

/** Inverse South Polar projection from canvas (px, py) to (lat, lon) */
function canvasToLatLon(px: number, py: number): { lat: number; lon: number } {
  const dx = px - MAP_SIZE / 2;
  const dy = MAP_SIZE / 2 - py;
  const r = Math.hypot(dx, dy);
  const colat = Math.min(8.5, (r / (MAP_SIZE * 0.46)) * MAX_COLAT_DEG);
  const lat = Number((-90 + colat).toFixed(3));
  let lon = (Math.atan2(dx, dy) * 180) / Math.PI;
  lon = Number(lon.toFixed(2));
  return { lat, lon };
}

export const SiteMap: React.FC<SiteMapProps> = ({
  presets,
  selectedSites,
  onTogglePreset,
  onAddCustomCoords,
  maxSites = 5,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverCoords, setHoverCoords] = useState<{ lat: number; lon: number; elev: number } | null>(
    null
  );
  const [wmtsOverlay, setWmtsOverlay] = useState(true);
  const [wmtsLoaded, setWmtsLoaded] = useState(false);
  const wmtsImgRef = useRef<HTMLImageElement | null>(null);

  // Attempt loading NASA Moon Trek South Pole LOLA hillshade overview tile
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    // NASA Moon Trek South Polar RESTful WMTS endpoint
    img.src =
      'https://trek.nasa.gov/tiles/Moon/SP/LRO_LOLA_ClrShade_118m_SP/1.0.0/default/default028mm/0/0/0.png';
    img.onload = () => {
      wmtsImgRef.current = img;
      setWmtsLoaded(true);
    };
    img.onerror = () => {
      wmtsImgRef.current = null;
      setWmtsLoaded(false);
    };
  }, []);

  // Pre-render the deterministic LOLA South Pole hillshade terrain canvas once
  const hillshadeImageData = useMemo(() => {
    const data = new Uint8ClampedArray(MAP_SIZE * MAP_SIZE * 4);
    const eps = 0.04;
    for (let py = 0; py < MAP_SIZE; py++) {
      for (let px = 0; px < MAP_SIZE; px++) {
        const idx = (py * MAP_SIZE + px) * 4;
        const dx = px - MAP_SIZE / 2;
        const dy = MAP_SIZE / 2 - py;
        const distPx = Math.hypot(dx, dy);
        if (distPx > MAP_SIZE * 0.48) {
          data[idx] = 7;
          data[idx + 1] = 9;
          data[idx + 2] = 14;
          data[idx + 3] = 255;
          continue;
        }
        const { lat, lon } = canvasToLatLon(px, py);
        const h0 = evalSouthPoleDemKm(lat, lon);
        const hx = evalSouthPoleDemKm(lat, lon + eps);
        const hy = evalSouthPoleDemKm(Math.min(-80, lat + eps), lon);
        const slopeX = (hx - h0) * 14;
        const slopeY = (hy - h0) * 14;
        // Directional illumination from 315 deg
        const shade = Math.max(0.15, Math.min(1.0, 0.52 + 0.32 * slopeX - 0.32 * slopeY));
        const elevTint = Math.max(-18, Math.min(28, h0 * 6.5));
        const val = Math.max(12, Math.min(220, Math.round(shade * 105 + elevTint)));
        data[idx] = Math.round(val * 0.88);
        data[idx + 1] = Math.round(val * 0.94);
        data[idx + 2] = Math.min(240, Math.round(val * 1.06));
        data[idx + 3] = 255;
      }
    }
    return data;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = new ImageData(hillshadeImageData, MAP_SIZE, MAP_SIZE);
    ctx.putImageData(imgData, 0, 0);

    // Optional NASA Moon Trek WMTS tile blend when available
    if (wmtsOverlay && wmtsLoaded && wmtsImgRef.current) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(MAP_SIZE / 2, MAP_SIZE / 2, MAP_SIZE * 0.47, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.55;
      ctx.drawImage(wmtsImgRef.current, 0, 0, MAP_SIZE, MAP_SIZE);
      ctx.restore();
    }

    // Polar stereographic graticule rings (-88°, -86°, -84°)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
    ctx.lineWidth = 1;
    [88, 86, 84].forEach((latDeg) => {
      const r = ((90 - latDeg) / MAX_COLAT_DEG) * (MAP_SIZE * 0.46);
      ctx.beginPath();
      ctx.arc(MAP_SIZE / 2, MAP_SIZE / 2, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillText(`-${latDeg}°`, MAP_SIZE / 2 + 3, MAP_SIZE / 2 - r + 10);
    });

    // 0°E (Earthward) / 90°E / 180° / 90°W meridians
    ctx.beginPath();
    ctx.moveTo(MAP_SIZE / 2, 10);
    ctx.lineTo(MAP_SIZE / 2, MAP_SIZE - 10);
    ctx.moveTo(10, MAP_SIZE / 2);
    ctx.lineTo(MAP_SIZE - 10, MAP_SIZE / 2);
    ctx.stroke();

    ctx.fillStyle = '#38BDF8';
    ctx.font = '600 10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0°E (Earth)', MAP_SIZE / 2, 11);
    ctx.fillText('180°', MAP_SIZE / 2, MAP_SIZE - 4);
    ctx.textAlign = 'left';
    ctx.fillText('90°W', 6, MAP_SIZE / 2 - 4);
    ctx.textAlign = 'right';
    ctx.fillText('90°E', MAP_SIZE - 6, MAP_SIZE / 2 - 4);

    // Preset site markers (unselected muted, selected bright)
    presets.forEach((site) => {
      const pt = latLonToCanvas(site.lat, site.lon);
      const isSelected = selectedSites.some((s) => s.id === site.id);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isSelected ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? site.color : 'rgba(203, 213, 225, 0.55)';
      ctx.fill();
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeStyle = isSelected ? '#FFFFFF' : '#0F172A';
      ctx.stroke();
    });

    // Custom site markers
    selectedSites
      .filter((s) => !s.isPreset)
      .forEach((site) => {
        const pt = latLonToCanvas(site.lat, site.lon);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = site.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
      });
  }, [hillshadeImageData, presets, selectedSites, wmtsOverlay, wmtsLoaded]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * MAP_SIZE;
    const py = ((e.clientY - rect.top) / rect.height) * MAP_SIZE;
    const { lat, lon } = canvasToLatLon(px, py);
    const elev = Number(evalSouthPoleDemKm(lat, lon).toFixed(2));
    setHoverCoords({ lat, lon, elev });
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * MAP_SIZE;
    const py = ((e.clientY - rect.top) / rect.height) * MAP_SIZE;

    // Check if user clicked near a preset marker (within 10px)
    let closestPreset: LunarSite | null = null;
    let bestDist = 11;
    for (const p of presets) {
      const pt = latLonToCanvas(p.lat, p.lon);
      const d = Math.hypot(pt.x - px, pt.y - py);
      if (d < bestDist) {
        bestDist = d;
        closestPreset = p;
      }
    }
    if (closestPreset) {
      onTogglePreset(closestPreset);
      return;
    }

    if (selectedSites.length >= maxSites) return;
    const { lat, lon } = canvasToLatLon(px, py);
    const elev = Number(evalSouthPoleDemKm(lat, lon).toFixed(2));
    onAddCustomCoords(lat, lon, elev);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
          <Globe2 className="w-3.5 h-3.5 text-cyan-400" />
          South Pole Map (-90° to -82.5°)
        </span>
        <button
          type="button"
          onClick={() => setWmtsOverlay((v) => !v)}
          className="text-[11px] text-slate-400 hover:text-slate-200 underline underline-offset-2 whitespace-nowrap"
          title="Toggle NASA Moon Trek LOLA hillshade WMTS layer"
        >
          {wmtsLoaded ? (wmtsOverlay ? 'Moon Trek: On' : 'Moon Trek: Off') : 'LOLA Relief'}
        </button>
      </div>

      <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-[#07090E] flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={MAP_SIZE}
          height={MAP_SIZE}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverCoords(null)}
          onClick={handleClick}
          className="w-full max-w-[280px] aspect-square cursor-crosshair block"
          aria-label="Lunar South Pole stereographic map. Click to select a preset or drop a custom landing site."
        />
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono-tabular text-slate-400 min-h-[18px]">
        {hoverCoords ? (
          <span className="inline-flex items-center gap-1 text-slate-300">
            <Crosshair className="w-3 h-3 text-cyan-400" />
            {hoverCoords.lat.toFixed(2)}°, {hoverCoords.lon.toFixed(1)}° · {hoverCoords.elev > 0 ? '+' : ''}
            {hoverCoords.elev.toFixed(2)} km
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-slate-500">
            <MapPin className="w-3 h-3" />
            Click map to drop custom site ({selectedSites.length}/{maxSites})
          </span>
        )}
      </div>
    </div>
  );
};
