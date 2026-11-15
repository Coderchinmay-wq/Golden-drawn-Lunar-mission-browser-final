import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Calendar,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Pause,
  Play,
  Plus,
  Share2,
  Sliders,
  Trash2,
} from 'lucide-react';
import { CompareView } from './components/CompareView';
import { EducatorOverlay } from './components/EducatorOverlay';
import { ElevationChart } from './components/ElevationChart';
import { ExplainBar } from './components/ExplainBar';
import { GlossaryTooltip } from './components/GlossaryTooltip';
import { LandingDateHeatmap } from './components/LandingDateHeatmap';
import { SiteMap } from './components/SiteMap';
import { SkyDome3D } from './components/SkyDome3D';
import { TimelineChart } from './components/TimelineChart';
import { ValidationView } from './components/ValidationView';
import { GLOSSARY, type LessonConfig } from './data/glossaryAndLessons';
import type {
  ComputeResponse,
  HorizonMode,
  LunarSite,
  PanelType,
  WorkspaceTab,
} from './types/mission';
import {
  exportComputeCsv,
  exportComputeJson,
  exportOnePagePdfSummary,
} from './utils/exportHelpers';

const CUSTOM_PALETTE = ['#F59E0B', '#06B6D4', '#10B981', '#A78BFA', '#FB7185'];

const DEFAULT_FALLBACK_SITES: LunarSite[] = [
  {
    id: 'shackleton_rim',
    name: 'Shackleton Crater Rim',
    shortName: 'Shackleton Rim',
    lat: -89.68,
    lon: 129.0,
    heightKm: 1.54,
    color: '#F59E0B',
    sourceNote: 'NASA Artemis III Candidate Region (Peak Near Shackleton, 89.68°S, 129.0°E).',
    isPreset: true,
  },
];

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

function addDaysIso(startDateStr: string, days: number): string {
  const ms = Date.parse(`${startDateStr}T00:00:00Z`) + days * 86400000;
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

export default function App() {
  const [presets, setPresets] = useState<LunarSite[]>(DEFAULT_FALLBACK_SITES);
  const [selectedSites, setSelectedSites] = useState<LunarSite[]>(DEFAULT_FALLBACK_SITES);
  const [focusedSiteId, setFocusedSiteId] = useState<string>('shackleton_rim');

  const [startIso, setStartIso] = useState<string>('2027-03-01T00:00:00Z');
  const [endIso, setEndIso] = useState<string>('2027-03-15T00:00:00Z');
  const [stepMinutes, setStepMinutes] = useState<number>(60);
  const [horizonMode, setHorizonMode] = useState<HorizonMode>('terrain');
  const [earthMarginDeg, setEarthMarginDeg] = useState<number>(0);
  const [panelType, setPanelType] = useState<PanelType>('vertical_tracking');
  const [missionDays, setMissionDays] = useState<number>(14);

  // Confirmed default: Dark Mission Control with Simple mode default
  const [expertMode, setExpertMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('timeline');
  const [showLessons, setShowLessons] = useState<boolean>(false);
  const [showGlossaryDrawer, setShowGlossaryDrawer] = useState<boolean>(false);

  const [computeData, setComputeData] = useState<ComputeResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Playback / time slider state
  const [activeSampleIdx, setActiveSampleIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Custom coordinate input form
  const [showCustomForm, setShowCustomForm] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>('Custom Landing Site');
  const [customLat, setCustomLat] = useState<string>('-89.20');
  const [customLon, setCustomLon] = useState<string>('45.0');
  const [customHeight, setCustomHeight] = useState<string>('1.0');
  const [formError, setFormError] = useState<string | null>(null);

  // 1. Load presets & hydrate state from URL parameters on first mount
  useEffect(() => {
    fetch('/api/sites')
      .then((r) => r.json())
      .then((loadedPresets: LunarSite[]) => {
        setPresets(loadedPresets);
        const params = new URLSearchParams(window.location.search);

        if (params.has('mode')) {
          setExpertMode(params.get('mode') === 'expert');
        }
        if (params.has('tab')) {
          const t = params.get('tab') as WorkspaceTab;
          if (['sky', 'timeline', 'elevation', 'compare', 'heatmap', 'validation'].includes(t)) {
            setActiveTab(t);
          }
        }
        if (params.has('start')) setStartIso(params.get('start')!);
        if (params.has('end')) setEndIso(params.get('end')!);
        if (params.has('step')) setStepMinutes(Number(params.get('step')) || 60);
        if (params.has('horizon')) {
          setHorizonMode(params.get('horizon') === 'smooth' ? 'smooth' : 'terrain');
        }
        if (params.has('margin')) setEarthMarginDeg(Number(params.get('margin')) || 0);
        if (params.has('panel')) {
          setPanelType(
            params.get('panel') === 'horizontal_fixed' ? 'horizontal_fixed' : 'vertical_tracking'
          );
        }
        if (params.has('days')) setMissionDays(Number(params.get('days')) || 14);

        const sitesParam = params.get('sites');
        if (sitesParam) {
          try {
            const parsed = JSON.parse(sitesParam) as Array<{
              id: string;
              name?: string;
              lat?: number;
              lon?: number;
              heightKm?: number;
            }>;
            const hydrated: LunarSite[] = parsed
              .slice(0, 5)
              .map((entry, idx) => {
                const match = loadedPresets.find((p) => p.id === entry.id);
                if (match) return match;
                return {
                  id: entry.id || `custom_${idx}`,
                  name: entry.name || `Custom (${entry.lat?.toFixed(2)}°, ${entry.lon?.toFixed(1)}°)`,
                  lat: entry.lat ?? -89.0,
                  lon: entry.lon ?? 0.0,
                  heightKm: entry.heightKm ?? 0.0,
                  color: CUSTOM_PALETTE[idx % CUSTOM_PALETTE.length],
                  sourceNote: 'User-defined custom coordinates.',
                  isPreset: false,
                };
              });
            if (hydrated.length > 0) {
              setSelectedSites(hydrated);
              setFocusedSiteId(hydrated[0].id);
              return;
            }
          } catch {
            // Fall back to default preset
          }
        }

        // Default initial selection: Shackleton Crater Rim for fast 3-click entry
        if (loadedPresets.length > 0) {
          setSelectedSites([loadedPresets[0]]);
          setFocusedSiteId(loadedPresets[0].id);
        }
      })
      .catch(() => {
        setErrorMsg('Failed to load preset lunar sites.');
      });
  }, []);

  // 2. Sync full state to URL for shareable links
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('mode', expertMode ? 'expert' : 'simple');
    params.set('tab', activeTab);
    params.set('start', startIso);
    params.set('end', endIso);
    params.set('step', String(stepMinutes));
    params.set('horizon', horizonMode);
    params.set('margin', String(earthMarginDeg));
    params.set('panel', panelType);
    params.set('days', String(missionDays));
    params.set(
      'sites',
      JSON.stringify(
        selectedSites.map((s) =>
          s.isPreset
            ? { id: s.id }
            : { id: s.id, name: s.name, lat: s.lat, lon: s.lon, heightKm: s.heightKm }
        )
      )
    );
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', nextUrl);
  }, [
    selectedSites,
    startIso,
    endIso,
    stepMinutes,
    horizonMode,
    earthMarginDeg,
    panelType,
    missionDays,
    expertMode,
    activeTab,
  ]);

  // 3. Recompute ephemeris & metrics whenever sites or mission parameters change
  useEffect(() => {
    if (selectedSites.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    fetch('/api/compute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sites: selectedSites,
        start: startIso,
        end: endIso,
        stepMinutes,
        horizon_mode: horizonMode,
        earth_margin: earthMarginDeg,
        panel_type: panelType,
      }),
    })
      .then(async (resp) => {
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || 'Computation failed');
        return json as ComputeResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setComputeData(data);
        setActiveSampleIdx((prev) =>
          Math.min(prev, Math.max(0, (data.results[0]?.samples.length || 1) - 1))
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Unable to compute ephemeris.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSites, startIso, endIso, stepMinutes, horizonMode, earthMarginDeg, panelType]);

  // 4. Playback animation timer
  const totalSteps = computeData?.results[0]?.samples.length ?? 0;
  useEffect(() => {
    if (!isPlaying || totalSteps <= 1) return;
    const timer = window.setInterval(() => {
      setActiveSampleIdx((idx) => (idx + 1 >= totalSteps ? 0 : idx + 1));
    }, 120);
    return () => clearInterval(timer);
  }, [isPlaying, totalSteps]);

  const handleTogglePreset = useCallback(
    (site: LunarSite) => {
      setSelectedSites((prev) => {
        const exists = prev.some((s) => s.id === site.id);
        if (exists) {
          if (prev.length === 1) return prev; // Keep at least 1 site selected
          const next = prev.filter((s) => s.id !== site.id);
          if (focusedSiteId === site.id) setFocusedSiteId(next[0].id);
          return next;
        }
        if (prev.length >= 5) return prev;
        setFocusedSiteId(site.id);
        return [...prev, site];
      });
    },
    [focusedSiteId]
  );

  const handleAddCustomCoords = useCallback(
    (lat: number, lon: number, heightKm: number, label?: string) => {
      setSelectedSites((prev) => {
        if (prev.length >= 5) return prev;
        const idx = prev.length;
        const newSite: LunarSite = {
          id: `custom_${Date.now()}_${idx}`,
          name: label || `Custom (${lat.toFixed(2)}°, ${lon.toFixed(1)}°)`,
          shortName: label || `Site ${lat.toFixed(1)}°`,
          lat,
          lon,
          heightKm,
          color: CUSTOM_PALETTE[idx % CUSTOM_PALETTE.length],
          sourceNote: `Custom coordinate pin (${lat.toFixed(3)}°, ${lon.toFixed(3)}°, elev ${heightKm.toFixed(2)} km).`,
          isPreset: false,
        };
        setFocusedSiteId(newSite.id);
        return [...prev, newSite];
      });
    },
    []
  );

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(customLat);
    const lon = Number(customLon);
    const h = Number(customHeight);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      setFormError('Latitude must be between -90° and +90°.');
      return;
    }
    if (Number.isNaN(lon) || lon < -180 || lon > 360) {
      setFormError('Longitude must be between -180° and +360°.');
      return;
    }
    if (Number.isNaN(h) || h < -15 || h > 25) {
      setFormError('Height must be between -15 km and +25 km.');
      return;
    }
    if (selectedSites.length >= 5) {
      setFormError('Maximum 5 sites allowed. Remove a site first.');
      return;
    }
    setFormError(null);
    handleAddCustomCoords(lat, lon, h, customName.trim() || undefined);
    setShowCustomForm(false);
  };

  const handleShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // Fallback: focus URL bar already updated via replaceState
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    }
  };

  const handleApplyLesson = (lesson: LessonConfig) => {
    const matched = lesson.setup.siteIds
      .map((id) => presets.find((p) => p.id === id))
      .filter((s): s is LunarSite => Boolean(s));
    if (matched.length > 0) {
      setSelectedSites(matched);
      setFocusedSiteId(matched[0].id);
    }
    setStartIso(lesson.setup.start);
    setEndIso(lesson.setup.end);
    setHorizonMode(lesson.setup.horizonMode);
    setEarthMarginDeg(lesson.setup.earthMargin);
    setActiveTab(lesson.setup.focusTab);
    setShowLessons(false);
    setActiveSampleIdx(0);
  };

  const handleSelectHeatmapDate = useCallback(
    (landingDateIso: string) => {
      setStartIso(`${landingDateIso}T00:00:00Z`);
      setEndIso(addDaysIso(landingDateIso, missionDays));
      setActiveSampleIdx(0);
      setActiveTab('timeline');
    },
    [missionDays]
  );

  const activeTimestampStr = useMemo(() => {
    const samples = computeData?.results[0]?.samples;
    if (!samples || samples.length === 0) return startIso.slice(0, 16).replace('T', ' ');
    const s = samples[Math.min(activeSampleIdx, samples.length - 1)];
    return s.timestampIso.slice(0, 16).replace('T', ' ');
  }, [computeData, activeSampleIdx, startIso]);

  return (
    <div className="min-h-screen flex flex-col bg-[#07090E] text-slate-100">
      {/* Top Bar Contract: 3 clean zones (Brand wordmark — 5 nav links — 1 primary Share Link CTA) */}
      <header className="border-b border-slate-800 bg-[#0B101B] px-4 lg:px-6 h-14 flex items-center justify-between gap-8 shrink-0">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setShowLessons(false);
            setActiveTab('timeline');
          }}
          className="text-base lg:text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          🌕 Chandrahasa CLPS Lunar Browser
        </a>

        <nav
          aria-label="Primary Workspace Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400"
        >
          <button
            type="button"
            onClick={() => {
              setShowLessons(false);
              if (!['sky', 'timeline', 'elevation'].includes(activeTab)) {
                setActiveTab('timeline');
              }
            }}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-100 ${
              !showLessons && ['sky', 'timeline', 'elevation'].includes(activeTab)
                ? 'text-slate-100 underline underline-offset-8 decoration-cyan-400'
                : ''
            }`}
          >
            Workspace
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLessons(false);
              setActiveTab('compare');
            }}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-100 ${
              !showLessons && activeTab === 'compare'
                ? 'text-slate-100 underline underline-offset-8 decoration-cyan-400'
                : ''
            }`}
          >
            Compare
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLessons(false);
              setActiveTab('heatmap');
            }}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-100 ${
              !showLessons && activeTab === 'heatmap'
                ? 'text-slate-100 underline underline-offset-8 decoration-cyan-400'
                : ''
            }`}
          >
            Date Finder
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLessons(false);
              setActiveTab('validation');
            }}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-100 ${
              !showLessons && activeTab === 'validation'
                ? 'text-slate-100 underline underline-offset-8 decoration-cyan-400'
                : ''
            }`}
          >
            Validation
          </button>
          <button
            type="button"
            onClick={() => setShowLessons((v) => !v)}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-100 ${
              showLessons ? 'text-cyan-400 underline underline-offset-8 decoration-cyan-400' : ''
            }`}
          >
            Lessons
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleShareLink}
            className="px-4 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            {copiedLink ? 'Link Copied' : 'Share Link'}
          </button>
        </div>
      </header>

      {/* Workspace Control Ribbon */}
      <div className="border-b border-slate-800/80 bg-[#07090E] px-4 lg:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Simple / Expert Segmented Toggle */}
          <div
            className="inline-flex items-center rounded-md bg-slate-900 border border-slate-800 p-0.5"
            role="group"
            aria-label="Detail level"
          >
            <button
              type="button"
              onClick={() => setExpertMode(false)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                !expertMode ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setExpertMode(true)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                expertMode ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Expert
            </button>
          </div>

          <span className="text-xs text-slate-400 hidden sm:inline font-mono-tabular">
            {selectedSites.length} site{selectedSites.length > 1 ? 's' : ''} ·{' '}
            {horizonMode === 'terrain' ? 'LOLA Terrain Mask' : 'Smooth Moon 0°'} · Step {stepMinutes}m
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLessons((v) => !v)}
            className="px-2.5 py-1.5 rounded-md border border-slate-800 bg-slate-900/70 text-xs text-slate-300 hover:border-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            Educator Tour
          </button>

          <button
            type="button"
            onClick={() => setShowGlossaryDrawer((v) => !v)}
            className="px-2.5 py-1.5 rounded-md border border-slate-800 bg-slate-900/70 text-xs text-slate-300 hover:border-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            Glossary
          </button>

          {computeData && (
            <div className="inline-flex items-center gap-1 border border-slate-800 rounded-md bg-slate-900/70 p-0.5">
              <span className="px-2 text-[11px] text-slate-400 inline-flex items-center gap-1">
                <Download className="w-3 h-3" /> Export:
              </span>
              <button
                type="button"
                onClick={() => exportComputeCsv(computeData)}
                className="px-2 py-1 text-xs rounded hover:bg-slate-800 text-slate-200 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-400" /> CSV
              </button>
              <button
                type="button"
                onClick={() => exportComputeJson(computeData)}
                className="px-2 py-1 text-xs rounded hover:bg-slate-800 text-slate-200 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <FileJson className="w-3 h-3 text-cyan-400" /> JSON
              </button>
              <button
                type="button"
                onClick={() => exportOnePagePdfSummary(computeData)}
                className="px-2 py-1 text-xs rounded hover:bg-slate-800 text-slate-200 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <FileText className="w-3 h-3 text-amber-400" /> PDF Brief
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Nav Bar */}
      <div className="flex md:hidden border-b border-slate-800 bg-[#0B101B] px-3 py-2 gap-2 overflow-x-auto">
        {(
          [
            ['timeline', 'Workspace'],
            ['compare', 'Compare'],
            ['heatmap', 'Date Finder'],
            ['validation', 'Validation'],
          ] as Array<[WorkspaceTab, string]>
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setShowLessons(false);
              setActiveTab(tab);
            }}
            className={`px-3 py-1 rounded text-xs whitespace-nowrap ${
              !showLessons && activeTab === tab
                ? 'bg-slate-800 text-slate-100 font-medium'
                : 'text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Glossary Reference Drawer */}
      {showGlossaryDrawer && (
        <div className="border-b border-slate-800 bg-[#0B101B] px-4 lg:px-6 py-4">
          <div className="max-w-[1440px] mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-100">
                Lunar Planning Glossary
              </h2>
              <button
                type="button"
                onClick={() => setShowGlossaryDrawer(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.values(GLOSSARY).map((g) => (
                <div
                  key={g.term}
                  className="p-3 rounded-md border border-slate-800 bg-[#07090E] space-y-1"
                >
                  <div className="text-xs font-semibold text-cyan-400">{g.term}</div>
                  <div className="text-xs text-slate-200">{g.shortDef}</div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">{g.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Split Console */}
      <div className="flex-1 max-w-[1480px] w-full mx-auto p-4 lg:p-6 flex flex-col lg:flex-row gap-5">
        {/* Left Panel: Plan Controls (330px on desktop) */}
        <aside className="w-full lg:w-[330px] shrink-0 space-y-4">
          {/* Site Picker Card */}
          <div className="rounded-lg border border-slate-800 bg-[#0B101B] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">1. Landing Sites</h2>
              <span className="text-xs font-mono-tabular text-slate-400">
                {selectedSites.length} / 5 selected
              </span>
            </div>

            <SiteMap
              presets={presets}
              selectedSites={selectedSites}
              onTogglePreset={handleTogglePreset}
              onAddCustomCoords={(lat, lon, h) => handleAddCustomCoords(lat, lon, h)}
            />

            {/* Preset Checklist */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-400">NASA South Pole Presets</div>
              <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                {presets.map((site) => {
                  const active = selectedSites.some((s) => s.id === site.id);
                  return (
                    <button
                      key={site.id}
                      type="button"
                      onClick={() => handleTogglePreset(site)}
                      className={`w-full text-left px-2.5 py-2 rounded-md border text-xs flex items-center justify-between gap-2 transition-colors ${
                        active
                          ? 'bg-slate-900 border-slate-600 text-slate-100'
                          : 'bg-[#07090E] border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{
                            backgroundColor: active ? site.color : 'transparent',
                            border: `1.5px solid ${site.color}`,
                          }}
                        />
                        <span className="truncate font-medium">{site.name}</span>
                      </span>
                      <span className="font-mono-tabular text-[11px] text-slate-500 shrink-0">
                        {site.lat.toFixed(2)}°, {site.lon.toFixed(1)}°
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Custom Sites List */}
            {selectedSites.some((s) => !s.isPreset) && (
              <div className="space-y-1 pt-1 border-t border-slate-800/80">
                <div className="text-xs font-medium text-slate-400">Custom Sites</div>
                {selectedSites
                  .filter((s) => !s.isPreset)
                  .map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs"
                    >
                      <span className="inline-flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="truncate text-slate-200">{s.name}</span>
                      </span>
                      <button
                        type="button"
                        disabled={selectedSites.length <= 1}
                        onClick={() =>
                          setSelectedSites((prev) => prev.filter((item) => item.id !== s.id))
                        }
                        aria-label={`Remove ${s.name}`}
                        className="text-slate-400 hover:text-rose-400 disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
            )}

            {/* Add Custom Coordinates Form Toggle */}
            <button
              type="button"
              onClick={() => setShowCustomForm((v) => !v)}
              className="w-full py-2 px-3 rounded-md border border-dashed border-slate-700 hover:border-slate-500 text-xs text-slate-300 inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Enter Custom Coordinates
            </button>

            {showCustomForm && (
              <form
                onSubmit={handleCustomSubmit}
                className="p-3 rounded-md border border-slate-800 bg-[#07090E] space-y-2.5 text-xs"
              >
                <div>
                  <label className="block text-slate-400 mb-1">Site Name</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1">Lat (°)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={customLat}
                      onChange={(e) => setCustomLat(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 font-mono-tabular text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Lon (°)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={customLon}
                      onChange={(e) => setCustomLon(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 font-mono-tabular text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Elev (km)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 font-mono-tabular text-slate-100"
                    />
                  </div>
                </div>
                {formError && <div className="text-rose-400 text-[11px]">{formError}</div>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCustomForm(false)}
                    className="px-2.5 py-1 text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded bg-cyan-500 text-slate-950 font-semibold"
                  >
                    Add Site
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Dates & Playback Card */}
          <div className="rounded-lg border border-slate-800 bg-[#0B101B] p-4 space-y-3.5">
            <h2 className="text-sm font-semibold text-slate-100 inline-flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              2. Mission Window & Time
            </h2>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Start (UTC)</label>
                <input
                  type="date"
                  value={toDateInputValue(startIso)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const nextStart = `${e.target.value}T00:00:00Z`;
                    setStartIso(nextStart);
                    if (Date.parse(endIso) <= Date.parse(nextStart)) {
                      setEndIso(addDaysIso(e.target.value, missionDays));
                    }
                  }}
                  className="w-full bg-[#07090E] border border-slate-800 rounded px-2 py-1.5 font-mono-tabular text-slate-200"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">End (UTC)</label>
                <input
                  type="date"
                  value={toDateInputValue(endIso)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setEndIso(`${e.target.value}T00:00:00Z`);
                  }}
                  className="w-full bg-[#07090E] border border-slate-800 rounded px-2 py-1.5 font-mono-tabular text-slate-200"
                />
              </div>
            </div>

            {/* Quick Duration Presets */}
            <div className="flex items-center gap-1.5">
              {[7, 14, 30, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => {
                    setMissionDays(days <= 60 ? days : 30);
                    setEndIso(addDaysIso(toDateInputValue(startIso), days));
                    if (days >= 90 && stepMinutes < 60) setStepMinutes(60);
                  }}
                  className="flex-1 py-1 rounded border border-slate-800 bg-[#07090E] hover:border-slate-700 text-[11px] font-mono-tabular text-slate-300"
                >
                  {days}d
                </button>
              ))}
            </div>

            {/* Time Playback Scrubber */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 inline-flex items-center gap-1.5 text-xs font-medium"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Pause' : 'Animate'}
                </button>
                <span className="font-mono-tabular text-[11px] text-cyan-400">
                  {activeTimestampStr} UTC
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={Math.max(0, totalSteps - 1)}
                value={Math.min(activeSampleIdx, Math.max(0, totalSteps - 1))}
                onChange={(e) => {
                  setIsPlaying(false);
                  setActiveSampleIdx(Number(e.target.value));
                }}
                aria-label="Mission time scrubber"
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Settings Card (Simple shows Horizon Mode; Expert reveals full engineering controls) */}
          <div className="rounded-lg border border-slate-800 bg-[#0B101B] p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-100 inline-flex items-center gap-2">
              <Sliders className="w-4 h-4 text-slate-400" />
              3. Environment Settings
            </h2>

            <div className="space-y-1.5 text-xs">
              <div className="text-slate-400">
                <GlossaryTooltip termKey="horizonMask" label="Horizon Model" />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setHorizonMode('terrain')}
                  className={`py-1.5 px-2.5 rounded border text-xs font-medium transition-colors ${
                    horizonMode === 'terrain'
                      ? 'bg-slate-800 border-cyan-500/60 text-slate-100'
                      : 'bg-[#07090E] border-slate-800 text-slate-400'
                  }`}
                >
                  LOLA Terrain
                </button>
                <button
                  type="button"
                  onClick={() => setHorizonMode('smooth')}
                  className={`py-1.5 px-2.5 rounded border text-xs font-medium transition-colors ${
                    horizonMode === 'smooth'
                      ? 'bg-slate-800 border-cyan-500/60 text-slate-100'
                      : 'bg-[#07090E] border-slate-800 text-slate-400'
                  }`}
                >
                  Smooth Moon (0°)
                </button>
              </div>
            </div>

            {expertMode && (
              <div className="space-y-3 pt-2 border-t border-slate-800/80 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Time Resolution (Step)</label>
                  <select
                    value={stepMinutes}
                    onChange={(e) => setStepMinutes(Number(e.target.value))}
                    className="w-full bg-[#07090E] border border-slate-800 rounded px-2.5 py-1.5 font-mono-tabular text-slate-200"
                  >
                    <option value={10}>10 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour (default)</option>
                    <option value={180}>3 hours</option>
                    <option value={360}>6 hours</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <GlossaryTooltip termKey="dte" label="Earth Antenna Margin" />
                    <span className="font-mono-tabular text-cyan-400">{earthMarginDeg}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={earthMarginDeg}
                    onChange={(e) => setEarthMarginDeg(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Solar Array Geometry</label>
                  <select
                    value={panelType}
                    onChange={(e) => setPanelType(e.target.value as PanelType)}
                    className="w-full bg-[#07090E] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                  >
                    <option value="vertical_tracking">Vertical Azimuth-Tracking (Polar)</option>
                    <option value="horizontal_fixed">Fixed Horizontal Deck</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Date Finder Mission Length (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={missionDays}
                    onChange={(e) =>
                      setMissionDays(Math.max(1, Math.min(60, Number(e.target.value) || 14)))
                    }
                    className="w-full bg-[#07090E] border border-slate-800 rounded px-2.5 py-1.5 font-mono-tabular text-slate-200"
                  />
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Visualization Column */}
        <main className="flex-1 min-w-0 space-y-4">
          {/* Educator Overlay */}
          {showLessons && (
            <EducatorOverlay
              onApplyLesson={handleApplyLesson}
              onClose={() => setShowLessons(false)}
            />
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div
              role="alert"
              className="rounded-lg border border-rose-800 bg-rose-950/50 px-4 py-3 text-xs text-rose-200"
            >
              {errorMsg}
            </div>
          )}

          {/* View Tab Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2.5">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist">
              {(
                [
                  ['timeline', 'Timeline'],
                  ['sky', 'Sky View (3D / Polar)'],
                  ['elevation', 'Elevation Charts'],
                  ['compare', 'Compare'],
                  ['heatmap', 'Landing Date Finder'],
                  ['validation', 'Validation'],
                ] as Array<[WorkspaceTab, string]>
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={!showLessons && activeTab === tab}
                  onClick={() => {
                    setShowLessons(false);
                    setActiveTab(tab);
                  }}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    !showLessons && activeTab === tab
                      ? 'bg-slate-800 text-slate-100 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {expertMode && (
              <div className="hidden xl:flex items-center gap-4 text-xs text-slate-400">
                <GlossaryTooltip termKey="azimuth" />
                <GlossaryTooltip termKey="elevation" />
                <GlossaryTooltip termKey="libration" />
              </div>
            )}
          </div>

          {/* Loading Skeleton or Active Visualization */}
          {loading && !computeData ? (
            <div className="rounded-lg border border-slate-800 bg-[#0B101B] p-8 space-y-4 animate-pulse">
              <div className="h-5 w-48 bg-slate-800 rounded" />
              <div className="h-64 w-full bg-slate-900 rounded" />
              <div className="h-10 w-full bg-slate-800 rounded" />
            </div>
          ) : (
            <>
              {activeTab === 'sky' && computeData && (
                <SkyDome3D
                  results={computeData.results}
                  activeSampleIdx={activeSampleIdx}
                  selectedSiteId={focusedSiteId}
                  onSelectSiteId={setFocusedSiteId}
                  earthMarginDeg={earthMarginDeg}
                />
              )}

              {activeTab === 'timeline' && computeData && (
                <TimelineChart
                  results={computeData.results}
                  activeSampleIdx={activeSampleIdx}
                  onSelectSampleIdx={(idx) => {
                    setIsPlaying(false);
                    setActiveSampleIdx(idx);
                  }}
                  expertMode={expertMode}
                />
              )}

              {activeTab === 'elevation' && computeData && (
                <ElevationChart
                  results={computeData.results}
                  activeSampleIdx={activeSampleIdx}
                  selectedSiteId={focusedSiteId}
                  onSelectSiteId={setFocusedSiteId}
                  earthMarginDeg={earthMarginDeg}
                  expertMode={expertMode}
                />
              )}

              {activeTab === 'compare' && computeData && (
                <CompareView results={computeData.results} expertMode={expertMode} />
              )}

              {activeTab === 'heatmap' && (
                <LandingDateHeatmap
                  sites={selectedSites}
                  missionDays={missionDays}
                  horizonMode={horizonMode}
                  earthMarginDeg={earthMarginDeg}
                  onSelectLandingDate={handleSelectHeatmapDate}
                />
              )}

              {activeTab === 'validation' && <ValidationView />}
            </>
          )}

          {/* Bottom Plain-English Explain / Expert Telemetry Tray */}
          {computeData && activeTab !== 'validation' && (
            <ExplainBar
              results={computeData.results}
              activeSampleIdx={activeSampleIdx}
              selectedSiteId={focusedSiteId}
              startIso={startIso}
              endIso={endIso}
              expertMode={expertMode}
              earthMarginDeg={earthMarginDeg}
              horizonMode={horizonMode}
            />
          )}
        </main>
      </div>

      {/* Quiet Attribution Footer */}
      <footer className="border-t border-slate-800/80 bg-[#07090E] px-4 lg:px-6 py-3 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <span>CLPS Lunar Mission Browser · NASA Space Apps Challenge 2026</span>
        <span>
          Data &amp; Ephemeris Credits: NAIF SPICE / JPL Horizons DE441 (MOON_ME) · LRO LOLA Topography · NASA Moon Trek WMTS
        </span>
      </footer>
    </div>
  );
}
