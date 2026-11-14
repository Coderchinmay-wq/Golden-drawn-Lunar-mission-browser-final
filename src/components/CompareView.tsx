import React, { useEffect, useMemo, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import { ArrowDownUp, Camera, Check } from 'lucide-react';
import type { SiteComputationResult } from '../types/mission';

interface CompareViewProps {
  results: SiteComputationResult[];
  expertMode: boolean;
}

type SortKey =
  | 'name'
  | 'sunlitAnyPct'
  | 'sunlitHalfPct'
  | 'sunlitFullPct'
  | 'earthVisiblePct'
  | 'bothVisiblePct'
  | 'longestDarknessHours'
  | 'longestEarthBlackoutHours'
  | 'avgPowerFraction';

export const CompareView: React.FC<CompareViewProps> = ({ results, expertMode }) => {
  const radarRef = useRef<HTMLDivElement | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('bothVisiblePct');
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = useMemo(() => {
    const arr = [...results];
    arr.sort((a, b) => {
      if (sortKey === 'name') {
        return sortDesc
          ? b.site.name.localeCompare(a.site.name)
          : a.site.name.localeCompare(b.site.name);
      }
      const va = a.metrics[sortKey];
      const vb = b.metrics[sortKey];
      return sortDesc ? vb - va : va - vb;
    });
    return arr;
  }, [results, sortKey, sortDesc]);

  const bestValues = useMemo(() => {
    if (results.length === 0) return null;
    return {
      sunlitAnyPct: Math.max(...results.map((r) => r.metrics.sunlitAnyPct)),
      sunlitHalfPct: Math.max(...results.map((r) => r.metrics.sunlitHalfPct)),
      sunlitFullPct: Math.max(...results.map((r) => r.metrics.sunlitFullPct)),
      earthVisiblePct: Math.max(...results.map((r) => r.metrics.earthVisiblePct)),
      bothVisiblePct: Math.max(...results.map((r) => r.metrics.bothVisiblePct)),
      longestDarknessHours: Math.min(...results.map((r) => r.metrics.longestDarknessHours)),
      longestEarthBlackoutHours: Math.min(
        ...results.map((r) => r.metrics.longestEarthBlackoutHours)
      ),
      avgPowerFraction: Math.max(...results.map((r) => r.metrics.avgPowerFraction)),
    };
  }, [results]);

  useEffect(() => {
    if (!radarRef.current || results.length === 0) return;

    const totalH = Math.max(1, results[0].metrics.totalHours);
    const categories = [
      'Sunlit %',
      'Earth DTE %',
      'Both (Power+DTE) %',
      'Night Resilience',
      'Comms Continuity',
      'Sunlit %',
    ];

    const traces: Plotly.Data[] = results.map((r) => {
      const m = r.metrics;
      const nightRes = Math.max(0, 100 - (100 * m.longestDarknessHours) / totalH);
      const commCont = Math.max(0, 100 - (100 * m.longestEarthBlackoutHours) / totalH);
      const values = [
        m.sunlitAnyPct,
        m.earthVisiblePct,
        m.bothVisiblePct,
        Number(nightRes.toFixed(1)),
        Number(commCont.toFixed(1)),
        m.sunlitAnyPct,
      ];
      return {
        type: 'scatterpolar',
        r: values,
        theta: categories,
        fill: 'toself',
        opacity: 0.65,
        name: r.site.shortName || r.site.name,
        line: { color: r.site.color, width: 2.2 },
      };
    });

    Plotly.newPlot(
      radarRef.current,
      traces,
      {
        paper_bgcolor: '#0B101B',
        plot_bgcolor: '#0B101B',
        font: { color: '#CBD5E1', family: 'IBM Plex Mono, monospace', size: 11 },
        margin: { l: 60, r: 60, t: 36, b: 36 },
        polar: {
          bgcolor: '#07090E',
          radialaxis: {
            visible: true,
            range: [0, 100],
            gridcolor: '#1E293B',
            linecolor: '#334155',
            tickfont: { size: 9 },
          },
          angularaxis: {
            gridcolor: '#1E293B',
            linecolor: '#334155',
          },
        },
        legend: { orientation: 'h', y: -0.1, font: { size: 11 } },
      },
      { responsive: true, displaylogo: false }
    );
  }, [results]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      // For darkness/blackout, lower is better so default ascending
      setSortDesc(key !== 'longestDarknessHours' && key !== 'longestEarthBlackoutHours');
    }
  };

  const handleExportPng = async () => {
    if (!radarRef.current) return;
    await Plotly.downloadImage(radarRef.current, {
      format: 'png',
      width: 900,
      height: 700,
      filename: 'clps_site_comparison_radar',
    });
  };

  const renderHeaderBtn = (key: SortKey, label: string, alignRight = true) => (
    <button
      type="button"
      onClick={() => handleSort(key)}
      className={`inline-flex items-center gap-1 font-medium hover:text-slate-100 whitespace-nowrap ${
        alignRight ? 'justify-end w-full' : ''
      } ${sortKey === key ? 'text-cyan-400' : 'text-slate-400'}`}
    >
      <span>{label}</span>
      <ArrowDownUp className="w-3 h-3 opacity-70" />
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Sortable Comparison Table */}
      <div className="rounded-lg border border-slate-800 bg-[#0B101B] overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-900/80 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">{renderHeaderBtn('name', 'Landing Site', false)}</th>
              <th className="px-3 py-3 text-right">{renderHeaderBtn('sunlitAnyPct', 'Sun >0%')}</th>
              {expertMode && (
                <>
                  <th className="px-3 py-3 text-right">{renderHeaderBtn('sunlitHalfPct', 'Sun >50%')}</th>
                  <th className="px-3 py-3 text-right">{renderHeaderBtn('sunlitFullPct', 'Sun 100%')}</th>
                </>
              )}
              <th className="px-3 py-3 text-right">{renderHeaderBtn('earthVisiblePct', 'Earth DTE %')}</th>
              <th className="px-3 py-3 text-right">{renderHeaderBtn('bothVisiblePct', 'Both %')}</th>
              <th className="px-3 py-3 text-right">
                {renderHeaderBtn('longestDarknessHours', 'Longest Night')}
              </th>
              <th className="px-3 py-3 text-right">
                {renderHeaderBtn('longestEarthBlackoutHours', 'Longest Blackout')}
              </th>
              {expertMode && (
                <th className="px-3 py-3 text-right">
                  {renderHeaderBtn('avgPowerFraction', 'Avg Power')}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {sorted.map((r) => {
              const m = r.metrics;
              const isBest = (val: number, best?: number) =>
                best !== undefined && results.length > 1 && Math.abs(val - best) < 0.01;

              return (
                <tr key={r.site.id} className="hover:bg-slate-900/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: r.site.color }}
                      />
                      <div>
                        <div className="font-semibold text-slate-100">{r.site.name}</div>
                        <div className="text-[11px] font-mono-tabular text-slate-500">
                          {r.site.lat.toFixed(2)}°, {r.site.lon.toFixed(1)}° · {r.site.heightKm.toFixed(2)} km
                        </div>
                      </div>
                    </div>
                  </td>

                  <td
                    className={`px-3 py-3 text-right font-mono-tabular ${
                      isBest(m.sunlitAnyPct, bestValues?.sunlitAnyPct)
                        ? 'text-emerald-400 font-semibold'
                        : 'text-slate-200'
                    }`}
                  >
                    {isBest(m.sunlitAnyPct, bestValues?.sunlitAnyPct) && (
                      <Check className="w-3 h-3 inline mr-1" />
                    )}
                    {m.sunlitAnyPct.toFixed(1)}%
                  </td>

                  {expertMode && (
                    <>
                      <td className="px-3 py-3 text-right font-mono-tabular text-slate-300">
                        {m.sunlitHalfPct.toFixed(1)}%
                      </td>
                      <td className="px-3 py-3 text-right font-mono-tabular text-slate-300">
                        {m.sunlitFullPct.toFixed(1)}%
                      </td>
                    </>
                  )}

                  <td
                    className={`px-3 py-3 text-right font-mono-tabular ${
                      isBest(m.earthVisiblePct, bestValues?.earthVisiblePct)
                        ? 'text-emerald-400 font-semibold'
                        : 'text-slate-200'
                    }`}
                  >
                    {isBest(m.earthVisiblePct, bestValues?.earthVisiblePct) && (
                      <Check className="w-3 h-3 inline mr-1" />
                    )}
                    {m.earthVisiblePct.toFixed(1)}%
                  </td>

                  <td
                    className={`px-3 py-3 text-right font-mono-tabular ${
                      isBest(m.bothVisiblePct, bestValues?.bothVisiblePct)
                        ? 'text-emerald-400 font-semibold'
                        : 'text-slate-200'
                    }`}
                  >
                    {isBest(m.bothVisiblePct, bestValues?.bothVisiblePct) && (
                      <Check className="w-3 h-3 inline mr-1" />
                    )}
                    {m.bothVisiblePct.toFixed(1)}%
                  </td>

                  <td
                    className={`px-3 py-3 text-right font-mono-tabular ${
                      isBest(m.longestDarknessHours, bestValues?.longestDarknessHours)
                        ? 'text-emerald-400 font-semibold'
                        : 'text-slate-200'
                    }`}
                  >
                    {m.longestDarknessHours.toFixed(1)} h
                  </td>

                  <td
                    className={`px-3 py-3 text-right font-mono-tabular ${
                      isBest(m.longestEarthBlackoutHours, bestValues?.longestEarthBlackoutHours)
                        ? 'text-emerald-400 font-semibold'
                        : 'text-slate-200'
                    }`}
                  >
                    {m.longestEarthBlackoutHours.toFixed(1)} h
                  </td>

                  {expertMode && (
                    <td className="px-3 py-3 text-right font-mono-tabular text-slate-200">
                      {(m.avgPowerFraction * 100).toFixed(1)}%
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Multi-Site Radar Chart */}
      <div className="rounded-lg border border-slate-800 bg-[#0B101B] p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Multi-Site Tradeoff Radar
            </h3>
            <p className="text-xs text-slate-400">
              Higher outward reach indicates stronger illumination, communications, and continuous survival margins.
            </p>
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
        <div ref={radarRef} className="w-full h-[380px]" />
      </div>
    </div>
  );
};
