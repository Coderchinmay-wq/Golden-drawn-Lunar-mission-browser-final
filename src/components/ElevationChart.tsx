import React, { useEffect, useMemo, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import { Camera } from 'lucide-react';
import type { SiteComputationResult } from '../types/mission';

interface ElevationChartProps {
  results: SiteComputationResult[];
  activeSampleIdx: number;
  selectedSiteId: string;
  onSelectSiteId: (id: string) => void;
  earthMarginDeg: number;
  expertMode: boolean;
}

export const ElevationChart: React.FC<ElevationChartProps> = ({
  results,
  activeSampleIdx,
  selectedSiteId,
  onSelectSiteId,
  earthMarginDeg,
  expertMode,
}) => {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const powerChartRef = useRef<HTMLDivElement | null>(null);
  const [showAllSites, setShowAllSites] = useState(false);

  const activeResult = useMemo(
    () => results.find((r) => r.site.id === selectedSiteId) || results[0],
    [results, selectedSiteId]
  );

  useEffect(() => {
    if (!chartRef.current || results.length === 0) return;

    const traces: Plotly.Data[] = [];

    if (showAllSites && results.length > 1) {
      results.forEach((res) => {
        const x = res.samples.map((s) => s.timestampIso);
        traces.push(
          {
            type: 'scatter',
            mode: 'lines',
            name: `${res.site.shortName || res.site.name} Sun`,
            x,
            y: res.samples.map((s) => s.sunElDeg),
            line: { color: res.site.color, width: 2 },
          },
          {
            type: 'scatter',
            mode: 'lines',
            name: `${res.site.shortName || res.site.name} Earth`,
            x,
            y: res.samples.map((s) => s.earthElDeg),
            line: { color: res.site.color, width: 1.5, dash: 'dot' },
          }
        );
      });
    } else if (activeResult) {
      const x = activeResult.samples.map((s) => s.timestampIso);
      traces.push(
        {
          type: 'scatter',
          mode: 'lines',
          name: 'Sun Elevation (°)',
          x,
          y: activeResult.samples.map((s) => s.sunElDeg),
          line: { color: '#F59E0B', width: 2.5 },
        },
        {
          type: 'scatter',
          mode: 'lines',
          name: 'Horizon Mask @ Sun Azimuth',
          x,
          y: activeResult.samples.map((s) => s.horizonSunElDeg),
          line: { color: '#D97706', width: 1.5, dash: 'dash' },
          fill: 'tozeroy',
          fillcolor: 'rgba(217, 119, 6, 0.08)',
        },
        {
          type: 'scatter',
          mode: 'lines',
          name: 'Earth Elevation (°)',
          x,
          y: activeResult.samples.map((s) => s.earthElDeg),
          line: { color: '#06B6D4', width: 2.5 },
        },
        {
          type: 'scatter',
          mode: 'lines',
          name: `Earth Mask (+${earthMarginDeg}° margin)`,
          x,
          y: activeResult.samples.map((s) => s.horizonEarthElDeg + earthMarginDeg),
          line: { color: '#0891B2', width: 1.5, dash: 'dot' },
        }
      );
    }

    const activeSample =
      activeResult?.samples[Math.min(activeSampleIdx, Math.max(0, (activeResult?.samples.length ?? 1) - 1))];

    const shapes: Partial<Plotly.Shape>[] = [
      {
        type: 'line',
        xref: 'paper',
        x0: 0,
        x1: 1,
        y0: 0,
        y1: 0,
        line: { color: '#475569', width: 1, dash: 'solid' },
      },
    ];

    if (activeSample) {
      shapes.push({
        type: 'line',
        x0: activeSample.timestampIso,
        x1: activeSample.timestampIso,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: { color: '#F8FAFC', width: 1.5, dash: 'dot' },
      });
    }

    Plotly.newPlot(
      chartRef.current,
      traces,
      {
        paper_bgcolor: '#0B101B',
        plot_bgcolor: '#07090E',
        font: { color: '#CBD5E1', family: 'IBM Plex Mono, monospace', size: 11 },
        margin: { l: 55, r: 20, t: 24, b: 48 },
        hovermode: 'x unified',
        xaxis: {
          gridcolor: '#1E293B',
          linecolor: '#334155',
          title: { text: 'UTC Time', font: { size: 11 } },
        },
        yaxis: {
          gridcolor: '#1E293B',
          linecolor: '#334155',
          title: { text: 'Elevation (deg)', font: { size: 11 } },
        },
        shapes,
        legend: { orientation: 'h', y: 1.12, font: { size: 11 } },
      },
      { responsive: true, displaylogo: false }
    );
  }, [results, activeResult, activeSampleIdx, earthMarginDeg, showAllSites]);

  // Expert-mode Solar Power Factor chart
  useEffect(() => {
    if (!expertMode || !powerChartRef.current || results.length === 0) return;
    const traces: Plotly.Data[] = results.map((res) => ({
      type: 'scatter',
      mode: 'lines',
      name: `${res.site.shortName || res.site.name} Power`,
      x: res.samples.map((s) => s.timestampIso),
      y: res.samples.map((s) => Number((s.powerFactor * 100).toFixed(1))),
      line: { color: res.site.color, width: 2 },
      fill: results.length === 1 ? 'tozeroy' : 'none',
    }));

    Plotly.newPlot(
      powerChartRef.current,
      traces,
      {
        paper_bgcolor: '#0B101B',
        plot_bgcolor: '#07090E',
        font: { color: '#CBD5E1', family: 'IBM Plex Mono, monospace', size: 11 },
        margin: { l: 55, r: 20, t: 22, b: 38 },
        hovermode: 'x unified',
        xaxis: { gridcolor: '#1E293B', linecolor: '#334155' },
        yaxis: {
          gridcolor: '#1E293B',
          linecolor: '#334155',
          range: [0, 105],
          title: { text: 'Power (% Rated)', font: { size: 11 } },
        },
        legend: { orientation: 'h', y: 1.15, font: { size: 11 } },
      },
      { responsive: true, displaylogo: false }
    );
  }, [expertMode, results]);

  const handleExportPng = async () => {
    if (!chartRef.current) return;
    await Plotly.downloadImage(chartRef.current, {
      format: 'png',
      width: 1200,
      height: 600,
      filename: `clps_elevation_${activeResult?.site.id || 'sites'}`,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {!showAllSites &&
            results.map((r) => (
              <button
                key={r.site.id}
                type="button"
                onClick={() => onSelectSiteId(r.site.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                  r.site.id === activeResult?.site.id
                    ? 'bg-slate-800 border-slate-600 text-slate-100'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: r.site.color }}
                />
                {r.site.shortName || r.site.name}
              </button>
            ))}
        </div>

        <div className="flex items-center gap-2">
          {results.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAllSites((v) => !v)}
              className="px-2.5 py-1.5 rounded-md text-xs bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 whitespace-nowrap"
            >
              {showAllSites ? 'Single Site + Horizon Mask' : 'Overlay All Sites'}
            </button>
          )}

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

      <div className="rounded-lg border border-slate-800 bg-[#0B101B] p-2">
        <div ref={chartRef} className="w-full h-[380px]" />
      </div>

      {expertMode && (
        <div className="rounded-lg border border-slate-800 bg-[#0B101B] p-2">
          <div className="px-2 pt-1 text-xs font-medium text-slate-300">
            Solar Array Power Estimate (% of Rated Output)
          </div>
          <div ref={powerChartRef} className="w-full h-[210px]" />
        </div>
      )}
    </div>
  );
};
