import React, { useMemo, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import { Camera } from 'lucide-react';
import type { SiteComputationResult } from '../types/mission';

interface TimelineChartProps {
  results: SiteComputationResult[];
  activeSampleIdx: number;
  onSelectSampleIdx: (idx: number) => void;
  expertMode: boolean;
}

type StateCode = 'both' | 'sun' | 'earth' | 'dark';

function sampleState(sunFrac: number, earthVis: boolean): StateCode {
  const sun = sunFrac > 0;
  if (sun && earthVis) return 'both';
  if (sun) return 'sun';
  if (earthVis) return 'earth';
  return 'dark';
}

const STATE_META: Record<
  StateCode,
  { label: string; glyph: string; color: string; patternClass: string }
> = {
  both: {
    label: 'Both (Power + DTE)',
    glyph: '●',
    color: '#10B981',
    patternClass: 'pattern-both',
  },
  sun: {
    label: 'Sunlit Only',
    glyph: '☀',
    color: '#F59E0B',
    patternClass: 'pattern-sun',
  },
  earth: {
    label: 'Earth DTE Only',
    glyph: '◈',
    color: '#06B6D4',
    patternClass: 'pattern-earth',
  },
  dark: {
    label: 'Dark & No Link',
    glyph: '✕',
    color: '#334155',
    patternClass: 'pattern-dark',
  },
};

export const TimelineChart: React.FC<TimelineChartProps> = ({
  results,
  activeSampleIdx,
  onSelectSampleIdx,
  expertMode,
}) => {
  const hiddenPlotlyRef = useRef<HTMLDivElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    siteName: string;
    timestampIso: string;
    state: StateCode;
    sunEl: number;
    earthEl: number;
    sunFrac: number;
  } | null>(null);

  const segmentsBySite = useMemo(() => {
    return results.map((res) => {
      const samples = res.samples;
      if (samples.length === 0) return { res, segs: [] };

      const segs: Array<{
        state: StateCode;
        startIdx: number;
        endIdx: number;
        startIso: string;
        endIso: string;
      }> = [];

      let curState = sampleState(samples[0].sunVisibleFraction, samples[0].earthVisible);
      let startIdx = 0;

      for (let i = 1; i < samples.length; i++) {
        const st = sampleState(samples[i].sunVisibleFraction, samples[i].earthVisible);
        if (st !== curState) {
          segs.push({
            state: curState,
            startIdx,
            endIdx: i,
            startIso: samples[startIdx].timestampIso,
            endIso: samples[i].timestampIso,
          });
          curState = st;
          startIdx = i;
        }
      }
      segs.push({
        state: curState,
        startIdx,
        endIdx: samples.length,
        startIso: samples[startIdx].timestampIso,
        endIso: samples[samples.length - 1].timestampIso,
      });

      return { res, segs };
    });
  }, [results]);

  const totalSteps = results[0]?.samples.length || 1;
  const cursorPct = Math.min(100, Math.max(0, (activeSampleIdx / Math.max(1, totalSteps - 1)) * 100));

  const handleExportPng = async () => {
    if (!hiddenPlotlyRef.current || results.length === 0) return;
    // Render clean discrete heatmap strip in Plotly solely for high-res PNG export
    const zVal: Record<StateCode, number> = { dark: 0, earth: 1, sun: 2, both: 3 };
    const x = results[0].samples.map((s) => s.timestampIso);
    const y = results.map((r) => r.site.shortName || r.site.name);
    const z = results.map((r) =>
      r.samples.map((s) => zVal[sampleState(s.sunVisibleFraction, s.earthVisible)])
    );

    await Plotly.newPlot(
      hiddenPlotlyRef.current,
      [
        {
          type: 'heatmap',
          x,
          y,
          z,
          colorscale: [
            [0, '#334155'],
            [0.33, '#06B6D4'],
            [0.66, '#F59E0B'],
            [1, '#10B981'],
          ],
          showscale: false,
        },
      ],
      {
        title: { text: 'CLPS Visibility Timeline (Gray=None, Cyan=Earth, Amber=Sun, Green=Both)' },
        paper_bgcolor: '#0B101B',
        plot_bgcolor: '#07090E',
        font: { color: '#E2E8F0', family: 'IBM Plex Mono, monospace', size: 12 },
        margin: { l: 150, r: 30, t: 55, b: 60 },
      }
    );
    await Plotly.downloadImage(hiddenPlotlyRef.current, {
      format: 'png',
      width: 1200,
      height: 500,
      filename: 'clps_visibility_timeline',
    });
  };

  if (results.length === 0) return null;

  const firstTs = results[0].samples[0]?.timestampIso.slice(0, 16).replace('T', ' ') ?? '';
  const midTs =
    results[0].samples[Math.floor(totalSteps / 2)]?.timestampIso.slice(0, 16).replace('T', ' ') ?? '';
  const lastTs =
    results[0].samples[totalSteps - 1]?.timestampIso.slice(0, 16).replace('T', ' ') ?? '';

  return (
    <div className="space-y-4">
      {/* Legend & PNG export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
          {(['both', 'sun', 'earth', 'dark'] as StateCode[]).map((code) => (
            <span key={code} className="inline-flex items-center gap-2">
              <span
                className={`inline-block w-4 h-3 rounded-sm border border-slate-700 ${STATE_META[code].patternClass}`}
              />
              <span>
                <span className="font-mono mr-1">{STATE_META[code].glyph}</span>
                {STATE_META[code].label}
              </span>
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={handleExportPng}
          className="px-2.5 py-1.5 rounded-md text-xs bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Camera className="w-3.5 h-3.5" />
          PNG
        </button>
      </div>

      {/* Stacked Gantt Bars */}
      <div className="rounded-lg border border-slate-800 bg-[#0B101B] p-4 space-y-4">
        {segmentsBySite.map(({ res, segs }) => {
          const n = Math.max(1, res.samples.length);
          const curSample = res.samples[Math.min(activeSampleIdx, n - 1)];
          const curState = curSample
            ? sampleState(curSample.sunVisibleFraction, curSample.earthVisible)
            : 'dark';

          return (
            <div key={res.site.id} className="space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: res.site.color }}
                  />
                  <span className="font-semibold text-slate-100">{res.site.name}</span>
                  <span className="text-slate-500 font-mono-tabular">
                    {res.site.lat.toFixed(2)}°, {res.site.lon.toFixed(1)}°
                  </span>
                </div>
                <div className="flex items-center gap-4 font-mono-tabular text-slate-400">
                  <span className="text-amber-400">Sun {res.metrics.sunlitAnyPct.toFixed(1)}%</span>
                  <span className="text-cyan-400">Earth {res.metrics.earthVisiblePct.toFixed(1)}%</span>
                  <span className="text-emerald-400">Both {res.metrics.bothVisiblePct.toFixed(1)}%</span>
                  {expertMode && (
                    <span>Max Night {res.metrics.longestDarknessHours.toFixed(1)}h</span>
                  )}
                </div>
              </div>

              {/* Bar Track */}
              <div
                className="relative h-9 w-full rounded bg-[#07090E] border border-slate-800 overflow-hidden flex cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  onSelectSampleIdx(Math.round(ratio * Math.max(0, n - 1)));
                }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const idx = Math.min(n - 1, Math.round(ratio * Math.max(0, n - 1)));
                  const s = res.samples[idx];
                  if (s) {
                    setHoverInfo({
                      siteName: res.site.shortName || res.site.name,
                      timestampIso: s.timestampIso,
                      state: sampleState(s.sunVisibleFraction, s.earthVisible),
                      sunEl: s.sunElDeg,
                      earthEl: s.earthElDeg,
                      sunFrac: s.sunVisibleFraction,
                    });
                  }
                }}
                onMouseLeave={() => setHoverInfo(null)}
                role="slider"
                aria-label={`${res.site.name} mission timeline`}
                aria-valuemin={0}
                aria-valuemax={n - 1}
                aria-valuenow={activeSampleIdx}
              >
                {segs.map((seg, i) => {
                  const widthPct = ((seg.endIdx - seg.startIdx) / n) * 100;
                  return (
                    <div
                      key={i}
                      style={{ width: `${widthPct}%` }}
                      className={`h-full ${STATE_META[seg.state].patternClass} border-r border-[#07090E]/40 last:border-r-0`}
                      title={`${STATE_META[seg.state].label}: ${seg.startIso.slice(0, 16)} → ${seg.endIso.slice(0, 16)} UTC`}
                    />
                  );
                })}

                {/* Active Time Cursor */}
                <div
                  style={{ left: `${cursorPct}%` }}
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)] pointer-events-none"
                />
              </div>

              {curSample && (
                <div className="flex items-center justify-between text-[11px] font-mono-tabular text-slate-400">
                  <span>
                    Active: {STATE_META[curState].glyph} {STATE_META[curState].label}
                  </span>
                  <span>
                    Sun El {curSample.sunElDeg.toFixed(2)}° ({(curSample.sunVisibleFraction * 100).toFixed(0)}%) · Earth El{' '}
                    {curSample.earthElDeg.toFixed(2)}°
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* Shared Time Axis Labels */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] font-mono-tabular text-slate-500">
          <span>{firstTs} UTC</span>
          <span>{midTs} UTC</span>
          <span>{lastTs} UTC</span>
        </div>
      </div>

      {/* Live Hover Readout Strip */}
      <div className="min-h-[36px] rounded-md border border-slate-800 bg-[#0B101B] px-3 py-2 text-xs font-mono-tabular flex flex-wrap items-center justify-between gap-3">
        {hoverInfo ? (
          <>
            <span className="text-slate-200">
              {hoverInfo.siteName} · {hoverInfo.timestampIso.slice(0, 16).replace('T', ' ')} UTC
            </span>
            <span className="text-slate-300">
              {STATE_META[hoverInfo.state].glyph} {STATE_META[hoverInfo.state].label} · Sun El{' '}
              {hoverInfo.sunEl.toFixed(2)}° ({(hoverInfo.sunFrac * 100).toFixed(0)}%) · Earth El{' '}
              {hoverInfo.earthEl.toFixed(2)}°
            </span>
          </>
        ) : (
          <span className="text-slate-500">
            Hover any timeline bar for exact UTC elevations, or click to move the mission time cursor.
          </span>
        )}
      </div>

      {/* Windows Table in Expert Mode */}
      {expertMode && results[0] && (
        <div className="rounded-lg border border-slate-800 bg-[#0B101B] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200">
              Continuous Visibility Windows ({results[0].site.shortName || results[0].site.name})
            </h3>
            <span className="text-[11px] text-slate-400 font-mono-tabular">
              {results[0].metrics.windows.length} intervals
            </span>
          </div>
          <div className="max-h-52 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-900/70 text-slate-400 sticky top-0">
                <tr>
                  <th className="px-4 py-2 font-medium">Window Type</th>
                  <th className="px-4 py-2 font-medium">Start (UTC)</th>
                  <th className="px-4 py-2 font-medium">End (UTC)</th>
                  <th className="px-4 py-2 font-medium text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono-tabular">
                {results[0].metrics.windows.slice(0, 40).map((w, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40">
                    <td className="px-4 py-1.5">
                      <span
                        className={
                          w.type === 'both'
                            ? 'text-emerald-400'
                            : w.type === 'sun'
                            ? 'text-amber-400'
                            : 'text-cyan-400'
                        }
                      >
                        {w.type === 'both' ? '● Both' : w.type === 'sun' ? '☀ Sunlit' : '◈ Earth DTE'}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-slate-300">
                      {w.startIso.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-4 py-1.5 text-slate-300">
                      {w.endIso.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-4 py-1.5 text-right text-slate-200">
                      {w.durationHours.toFixed(1)} h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div ref={hiddenPlotlyRef} className="hidden" />
    </div>
  );
};
