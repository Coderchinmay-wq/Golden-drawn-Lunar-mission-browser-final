import React from 'react';
import { Radio, Sun } from 'lucide-react';
import type { SiteComputationResult } from '../types/mission';

interface ExplainBarProps {
  results: SiteComputationResult[];
  activeSampleIdx: number;
  selectedSiteId: string;
  startIso: string;
  endIso: string;
  expertMode: boolean;
  earthMarginDeg: number;
  horizonMode: 'smooth' | 'terrain';
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const ExplainBar: React.FC<ExplainBarProps> = ({
  results,
  activeSampleIdx,
  selectedSiteId,
  startIso,
  endIso,
  expertMode,
  earthMarginDeg,
  horizonMode,
}) => {
  const primary = results.find((r) => r.site.id === selectedSiteId) || results[0];
  if (!primary) return null;

  const samples = primary.samples;
  const cur = samples[Math.min(activeSampleIdx, Math.max(0, samples.length - 1))];
  const m = primary.metrics;

  const isSunnyNow = cur ? cur.sunVisibleFraction > 0 : false;
  const canSeeEarthNow = cur ? cur.earthVisible : false;

  return (
    <section
      aria-label="Mission Explanation"
      className="rounded-lg border border-slate-800 bg-[#0B101B] p-4 space-y-3"
    >
      {!expertMode ? (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="text-xs font-medium text-slate-400">
              Plain-English Summary · {primary.site.name}
            </div>
            <p className="text-sm text-slate-100 leading-relaxed">
              At <span className="font-semibold">{primary.site.name}</span> between{' '}
              <span className="font-mono-tabular text-slate-200">{fmtShortDate(startIso)}</span> and{' '}
              <span className="font-mono-tabular text-slate-200">{fmtShortDate(endIso)}</span>, the Sun is
              visible <span className="font-mono-tabular font-semibold text-amber-400">{m.sunlitAnyPct.toFixed(0)}%</span>{' '}
              of the time and Earth is visible{' '}
              <span className="font-mono-tabular font-semibold text-cyan-400">{m.earthVisiblePct.toFixed(0)}%</span>{' '}
              of the time (both together{' '}
              <span className="font-mono-tabular font-semibold text-emerald-400">{m.bothVisiblePct.toFixed(0)}%</span>).
              The longest continuous night is{' '}
              <span className="font-mono-tabular font-semibold text-slate-100">
                {m.longestDarknessHours.toFixed(0)} hours
              </span>
              .
            </p>
          </div>

          {cur && (
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div
                className={`px-3.5 py-2 rounded-md border text-xs ${
                  isSunnyNow
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
              >
                <div className="inline-flex items-center gap-1.5 font-semibold">
                  <Sun className="w-3.5 h-3.5" />
                  {isSunnyNow ? 'Sunny Right Now' : 'In Shadow Now'}
                </div>
                <div className="font-mono-tabular text-[11px] mt-0.5">
                  Disk {(cur.sunVisibleFraction * 100).toFixed(0)}% · El {cur.sunElDeg.toFixed(2)}°
                </div>
              </div>

              <div
                className={`px-3.5 py-2 rounded-md border text-xs ${
                  canSeeEarthNow
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
              >
                <div className="inline-flex items-center gap-1.5 font-semibold">
                  <Radio className="w-3.5 h-3.5" />
                  {canSeeEarthNow ? 'Can See Earth Now' : 'Earth Blocked Now'}
                </div>
                <div className="font-mono-tabular text-[11px] mt-0.5">
                  El {cur.earthElDeg.toFixed(2)}° vs Mask {cur.horizonEarthElDeg.toFixed(2)}°
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-200">
              Expert Telemetry Brief · {primary.site.name} ({primary.site.lat.toFixed(3)}°,{' '}
              {primary.site.lon.toFixed(3)}°, {primary.site.heightKm.toFixed(2)} km)
            </span>
            <span className="font-mono-tabular text-slate-400">
              Frame: MOON_ME → ENU · Horizon:{' '}
              {horizonMode === 'terrain' ? 'LRO LOLA 150 km Ray-March' : 'Smooth Sphere 0°'} · DTE
              Margin: {earthMarginDeg}°
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
            <div>
              <div className="text-[11px] text-slate-400">Sun (&gt;0% / 100%)</div>
              <div className="text-sm font-mono-tabular font-semibold text-amber-400">
                {m.sunlitAnyPct.toFixed(1)}% / {m.sunlitFullPct.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Earth DTE</div>
              <div className="text-sm font-mono-tabular font-semibold text-cyan-400">
                {m.earthVisiblePct.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Simultaneous Both</div>
              <div className="text-sm font-mono-tabular font-semibold text-emerald-400">
                {m.bothVisiblePct.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Max Continuous Night</div>
              <div className="text-sm font-mono-tabular font-semibold text-slate-100">
                {m.longestDarknessHours.toFixed(1)} h
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Max DTE Blackout</div>
              <div className="text-sm font-mono-tabular font-semibold text-slate-100">
                {m.longestEarthBlackoutHours.toFixed(1)} h
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Mean Panel Power</div>
              <div className="text-sm font-mono-tabular font-semibold text-slate-100">
                {(m.avgPowerFraction * 100).toFixed(1)}% P_rated
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
            Source note: {primary.site.sourceNote}
          </div>
        </div>
      )}
    </section>
  );
};
