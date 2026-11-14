import React, { useEffect, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import { CalendarSearch, Camera, RefreshCw } from 'lucide-react';
import type { HorizonMode, LunarSite, SiteHeatmapSeries } from '../types/mission';

interface LandingDateHeatmapProps {
  sites: LunarSite[];
  missionDays: number;
  horizonMode: HorizonMode;
  earthMarginDeg: number;
  onSelectLandingDate: (landingDateIso: string) => void;
}

export const LandingDateHeatmap: React.FC<LandingDateHeatmapProps> = ({
  sites,
  missionDays,
  horizonMode,
  earthMarginDeg,
  onSelectLandingDate,
}) => {
  const [year, setYear] = useState('2027');
  const [series, setSeries] = useState<SiteHeatmapSeries[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);

  const loadSweep = async () => {
    if (sites.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/heatmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sites,
          yearStart: `${year}-01-01T00:00:00Z`,
          missionDays,
          horizon_mode: horizonMode,
          earth_margin: earthMarginDeg,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Heatmap sweep failed');
      setSeries(json.series || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to compute landing sweep');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSweep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, missionDays, horizonMode, earthMarginDeg, year]);

  useEffect(() => {
    if (!plotRef.current || series.length === 0) return;
    const x = series[0].cells.map((c) => c.landingDateIso);
    const y = series.map((s) => s.site.shortName || s.site.name);
    const z = series.map((s) => s.cells.map((c) => c.bothVisiblePct));
    const customdata = series.map((s) =>
      s.cells.map(
        (c) =>
          `Landing: ${c.landingDateIso}<br>Both (Sun+Earth): ${c.bothVisiblePct}%<br>Sunlit: ${c.sunlitAnyPct}%<br>Earth DTE: ${c.earthVisiblePct}%<br>Longest Night: ${c.longestDarknessHours} h`
      )
    );

    const el = plotRef.current;
    Plotly.newPlot(
      el,
      [
        {
          type: 'heatmap',
          x,
          y,
          z,
          customdata,
          hovertemplate: '%{y}<br>%{customdata}<extra></extra>',
          colorscale: [
            [0.0, '#0F172A'],
            [0.25, '#1E3A5F'],
            [0.5, '#0891B2'],
            [0.75, '#10B981'],
            [1.0, '#FBBF24'],
          ],
          zmin: 0,
          zmax: 100,
          colorbar: {
            title: { text: 'Both %', side: 'right' },
            tickfont: { color: '#CBD5E1' },
          },
          xgap: 1,
          ygap: 2,
        },
      ],
      {
        paper_bgcolor: '#0B101B',
        plot_bgcolor: '#07090E',
        font: { color: '#CBD5E1', family: 'IBM Plex Mono, monospace', size: 11 },
        margin: { l: 145, r: 70, t: 28, b: 48 },
        xaxis: {
          title: { text: `Landing Date (${year}, ${missionDays}-day window)` },
          gridcolor: '#1E293B',
        },
        yaxis: { automargin: true },
      },
      { responsive: true, displaylogo: false }
    );

    // Click any heatmap cell to load that exact landing window into the workspace
    const plotlyEl = el as unknown as {
      on?: (ev: string, fn: (d: { points?: Array<{ x?: string }> }) => void) => void;
    };
    plotlyEl.on?.('plotly_click', (evt) => {
      const dateStr = evt?.points?.[0]?.x;
      if (dateStr) {
        onSelectLandingDate(dateStr);
      }
    });
  }, [series, missionDays, year, onSelectLandingDate]);

  // Identify top-scoring landing date per site
  const recommendations = series.map((s) => {
    const best = s.cells.reduce(
      (acc, cur) => (cur.bothVisiblePct > acc.bothVisiblePct ? cur : acc),
      s.cells[0]
    );
    return { site: s.site, best };
  });

  const handleExportPng = async () => {
    if (!plotRef.current) return;
    await Plotly.downloadImage(plotRef.current, {
      format: 'png',
      width: 1200,
      height: 500,
      filename: `clps_landing_heatmap_${year}`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 inline-flex items-center gap-2">
            <CalendarSearch className="w-4 h-4 text-emerald-400" />
            Landing Date Finder ({missionDays}-Day Mission Score)
          </h3>
          <p className="text-xs text-slate-400">
            Click any cell on the heatmap to load that exact {missionDays}-day landing window into your timeline and 3D Sky Dome.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            aria-label="Sweep year"
            className="bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs font-mono-tabular text-slate-200"
          >
            <option value="2026">2026</option>
            <option value="2027">2027</option>
            <option value="2028">2028</option>
            <option value="2029">2029</option>
          </select>

          <button
            type="button"
            onClick={loadSweep}
            disabled={loading}
            className="px-2.5 py-1.5 rounded-md text-xs bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Rescan
          </button>

          <button
            type="button"
            onClick={handleExportPng}
            className="px-2.5 py-1.5 rounded-md text-xs bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5" />
            PNG
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-800 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-[#0B101B] p-2 relative min-h-[320px]">
        {loading && (
          <div className="absolute inset-0 bg-[#07090E]/80 flex items-center justify-center z-10 text-xs text-slate-300 font-mono-tabular">
            Scanning 365 lunar days across {sites.length} site(s)…
          </div>
        )}
        <div ref={plotRef} className="w-full h-[320px]" />
      </div>

      {recommendations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {recommendations.map(({ site, best }) =>
            best ? (
              <button
                key={site.id}
                type="button"
                onClick={() => onSelectLandingDate(best.landingDateIso)}
                className="text-left p-3 rounded-lg border border-slate-800 bg-[#0B101B] hover:border-emerald-700 transition-colors"
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-100 inline-flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: site.color }}
                    />
                    {site.shortName || site.name}
                  </span>
                  <span className="font-mono-tabular text-emerald-400">
                    Peak {best.bothVisiblePct}%
                  </span>
                </div>
                <div className="text-xs font-mono-tabular text-slate-400">
                  Best Launch: {best.landingDateIso} · Sun {best.sunlitAnyPct}% · Earth {best.earthVisiblePct}%
                </div>
              </button>
            ) : null
          )}
        </div>
      )}
    </div>
  );
};
