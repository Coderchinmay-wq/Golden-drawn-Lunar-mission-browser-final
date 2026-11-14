import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getHorizonProfile } from './server/horizon';
import {
  buildValidationReport,
  computeLandingHeatmap,
  computeSamplesAndMetrics,
} from './server/metrics';
import type {
  ComputeRequest,
  ComputeResponse,
  HorizonMode,
  LunarSite,
  PanelType,
  SiteComputationResult,
} from './src/types/mission';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');

// In-memory LRU-bounded cache keyed by (sites, start, end, stepMinutes, horizon_mode, earth_margin, panel_type)
const computeCache = new Map<string, ComputeResponse>();
const MAX_CACHE_ENTRIES = 120;

function loadPresetSites(): LunarSite[] {
  const raw = fs.readFileSync(path.join(DATA_DIR, 'preset_sites.json'), 'utf8');
  return JSON.parse(raw);
}

function validateAndBuildTimestamps(
  startIso: string,
  endIso: string,
  stepMinutes: number
): Date[] {
  const t0 = new Date(startIso);
  const t1 = new Date(endIso);
  if (Number.isNaN(t0.getTime()) || Number.isNaN(t1.getTime())) {
    throw new Error('Invalid start or end timestamp.');
  }
  if (t1.getTime() <= t0.getTime()) {
    throw new Error('End timestamp must be strictly after start timestamp.');
  }
  if (stepMinutes < 10 || stepMinutes > 360) {
    throw new Error('Step size must be between 10 and 360 minutes.');
  }
  const spanDays = (t1.getTime() - t0.getTime()) / 86400000;
  if (spanDays > 731) {
    throw new Error('Maximum supported date range is 2 years (731 days).');
  }
  const maxPoints = 20000;
  const estPoints = Math.floor((t1.getTime() - t0.getTime()) / (stepMinutes * 60000)) + 1;
  if (estPoints > maxPoints) {
    throw new Error(
      `Requested ${estPoints} steps exceeds safe limit (${maxPoints}). Increase step size or shorten date range.`
    );
  }
  const out: Date[] = [];
  for (let ms = t0.getTime(); ms <= t1.getTime(); ms += stepMinutes * 60000) {
    out.push(new Date(ms));
  }
  return out;
}

function validateSite(site: LunarSite): void {
  if (typeof site.lat !== 'number' || site.lat < -90 || site.lat > 90) {
    throw new Error(`Invalid latitude for ${site.name}: ${site.lat} (must be -90..90).`);
  }
  if (typeof site.lon !== 'number' || site.lon < -180 || site.lon > 360) {
    throw new Error(`Invalid longitude for ${site.name}: ${site.lon} (must be -180..360).`);
  }
  if (typeof site.heightKm !== 'number' || site.heightKm < -15 || site.heightKm > 25) {
    throw new Error(`Invalid heightKm for ${site.name}: ${site.heightKm}.`);
  }
}

function runCompute(body: ComputeRequest): ComputeResponse {
  if (!Array.isArray(body.sites) || body.sites.length === 0 || body.sites.length > 5) {
    throw new Error('Select between 1 and 5 sites.');
  }
  body.sites.forEach(validateSite);

  const key = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const hit = computeCache.get(key);
  if (hit) {
    return { ...hit, cached: true };
  }

  const timestamps = validateAndBuildTimestamps(body.start, body.end, body.stepMinutes);
  const results: SiteComputationResult[] = body.sites.map((site) => {
    const profile = getHorizonProfile(
      site.id,
      site.lat,
      site.lon,
      site.heightKm,
      body.horizon_mode
    );
    const { samples, metrics } = computeSamplesAndMetrics(
      site.lat,
      site.lon,
      site.heightKm,
      timestamps,
      profile,
      body.earth_margin,
      body.panel_type,
      body.stepMinutes
    );
    return {
      site,
      horizonProfileDeg: profile,
      samples,
      metrics,
    };
  });

  const payload: ComputeResponse = {
    params: body,
    computedAtIso: new Date().toISOString().replace('.000Z', 'Z'),
    cached: false,
    results,
  };

  if (computeCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = computeCache.keys().next().value;
    if (firstKey) computeCache.delete(firstKey);
  }
  computeCache.set(key, payload);
  return payload;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // GET /api/sites -> preset sites list
  app.get('/api/sites', (_req, res) => {
    res.json(loadPresetSites());
  });

  // GET /api/horizon/:siteId -> 360° horizon profile
  app.get('/api/horizon/:siteId', (req, res) => {
    const { siteId } = req.params;
    const mode = (req.query.mode === 'smooth' ? 'smooth' : 'terrain') as HorizonMode;
    const presets = loadPresetSites();
    const found = presets.find((s) => s.id === siteId);
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : found?.lat;
    const lon = req.query.lon !== undefined ? Number(req.query.lon) : found?.lon;
    const heightKm = req.query.heightKm !== undefined ? Number(req.query.heightKm) : found?.heightKm ?? 0;

    if (lat === undefined || lon === undefined || Number.isNaN(lat) || Number.isNaN(lon)) {
      res.status(404).json({ error: `Unknown site '${siteId}' and lat/lon not supplied.` });
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 360) {
      res.status(400).json({ error: 'Latitude must be -90..90 and longitude -180..360.' });
      return;
    }
    const profileDeg = getHorizonProfile(siteId, lat, lon, heightKm, mode);
    res.json({ siteId, mode, profileDeg });
  });

  // POST /api/compute -> time series + metrics + windows per site
  app.post('/api/compute', (req, res) => {
    try {
      const result = runCompute(req.body as ComputeRequest);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Compute failed' });
    }
  });

  // POST /api/heatmap -> year-long sweep of mission score vs landing date
  app.post('/api/heatmap', (req, res) => {
    try {
      const {
        sites,
        yearStart = '2027-01-01T00:00:00Z',
        missionDays = 14,
        horizon_mode = 'terrain',
        earth_margin = 0,
      } = req.body as {
        sites: LunarSite[];
        yearStart?: string;
        missionDays?: number;
        horizon_mode?: HorizonMode;
        earth_margin?: number;
      };
      if (!Array.isArray(sites) || sites.length === 0 || sites.length > 5) {
        throw new Error('Provide between 1 and 5 sites.');
      }
      sites.forEach(validateSite);
      const days = Math.max(1, Math.min(60, Number(missionDays) || 14));
      const series = sites.map((site) => {
        const profile = getHorizonProfile(
          site.id,
          site.lat,
          site.lon,
          site.heightKm,
          horizon_mode
        );
        const cells = computeLandingHeatmap(
          site.lat,
          site.lon,
          site.heightKm,
          yearStart,
          days,
          profile,
          earth_margin
        );
        return { site, cells };
      });
      res.json({ yearStart, missionDays: days, series });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Heatmap failed' });
    }
  });

  // GET /api/validation -> live comparison against JPL Horizons + polar sanity bounds
  app.get('/api/validation', (_req, res) => {
    try {
      res.json(buildValidationReport());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Validation failed' });
    }
  });

  // GET /api/export?format=csv|json -> download results
  app.get('/api/export', (req, res) => {
    try {
      const format = req.query.format === 'json' ? 'json' : 'csv';
      const siteId = String(req.query.site_id || 'shackleton_rim');
      const start = String(req.query.start || '2027-03-01T00:00:00Z');
      const end = String(req.query.end || '2027-03-15T00:00:00Z');
      const stepMinutes = Number(req.query.stepMinutes || 60);
      const horizonMode = (req.query.horizon_mode === 'smooth' ? 'smooth' : 'terrain') as HorizonMode;
      const earthMargin = Number(req.query.earth_margin || 0);
      const panelType = (
        req.query.panel_type === 'horizontal_fixed' ? 'horizontal_fixed' : 'vertical_tracking'
      ) as PanelType;

      const presets = loadPresetSites();
      const site = presets.find((s) => s.id === siteId) || presets[0];

      const computed = runCompute({
        sites: [site],
        start,
        end,
        stepMinutes,
        horizon_mode: horizonMode,
        earth_margin: earthMargin,
        panel_type: panelType,
      });

      if (format === 'json') {
        res.setHeader('Content-Disposition', `attachment; filename="clps_${site.id}.json"`);
        res.json(computed);
        return;
      }

      const header = [
        'site_id',
        'site_name',
        'timestamp_utc',
        'sun_az_deg',
        'sun_el_deg',
        'sun_visible_fraction',
        'earth_az_deg',
        'earth_el_deg',
        'earth_visible',
        'horizon_sun_el_deg',
        'horizon_earth_el_deg',
        'both_visible',
        'power_factor',
      ].join(',');

      const lines = [header];
      for (const r of computed.results) {
        for (const s of r.samples) {
          lines.push(
            [
              r.site.id,
              `"${r.site.name}"`,
              s.timestampIso,
              s.sunAzDeg,
              s.sunElDeg,
              s.sunVisibleFraction,
              s.earthAzDeg,
              s.earthElDeg,
              s.earthVisible,
              s.horizonSunElDeg,
              s.horizonEarthElDeg,
              s.bothVisible,
              s.powerFactor,
            ].join(',')
          );
        }
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="clps_${site.id}.csv"`);
      res.send(lines.join('\n'));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Export failed' });
    }
  });

  // Mount Vite middleware in development, static dist/ in production
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist'));
  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CLPS Lunar Mission Browser running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
