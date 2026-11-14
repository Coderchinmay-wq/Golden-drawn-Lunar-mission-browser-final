export interface GlossaryTerm {
  term: string;
  shortDef: string;
  detail: string;
}

export const GLOSSARY: Record<string, GlossaryTerm> = {
  azimuth: {
    term: 'Azimuth',
    shortDef: 'Compass direction along the local horizon (0° = North, 90° = East).',
    detail:
      'Measured clockwise from true lunar North (0°). At the South Pole, every direction away from the pole points North along a meridian, so azimuth tracks longitude orientation.',
  },
  elevation: {
    term: 'Elevation',
    shortDef: 'Angular height above the flat horizontal tangent plane (-90° to +90°).',
    detail:
      '0° is the geometric horizon on a smooth sphere; positive values are above the horizon and negative values are below it. At the lunar South Pole, the Sun hovers within ±1.6° of 0°.',
  },
  libration: {
    term: 'Libration',
    shortDef: 'Apparent slow wobble of Earth in the lunar sky (±7° in elevation, ±8° in azimuth).',
    detail:
      'Because the Moon’s orbit is elliptical and tilted by ~6.7° to its equator, Earth traces a small figure-eight / ellipse in the lunar sky over each 27.3-day anomalistic and nodical cycle.',
  },
  horizonMask: {
    term: 'Horizon Mask',
    shortDef: '360° profile of surrounding crater rims and ridges that block low Sun or Earth rays.',
    detail:
      'Computed by ray-marching LRO LOLA elevation data out to ~150 km and subtracting lunar curvature drop (d² / 2R). A target is visible only when its elevation exceeds the terrain mask.',
  },
  dte: {
    term: 'Direct-to-Earth (DTE)',
    shortDef: 'Unobstructed line-of-sight radio link directly between the lander and Earth.',
    detail:
      'Unlike relay satellites, DTE requires Earth to clear local mountains plus any configured antenna elevation margin (e.g., 2° for terrain multipath clearance).',
  },
  sunFraction: {
    term: 'Solar Disk Fraction',
    shortDef: 'Fraction (0–100%) of the Sun’s 0.53° wide disk clearing the local horizon.',
    detail:
      'Because the Sun has an angular radius of ~0.267° (not a point source), partial illumination begins when the Sun center reaches 0.267° below the horizon.',
  },
};

export interface LessonConfig {
  id: string;
  title: string;
  audience: string;
  durationLabel: string;
  summary: string;
  keyTakeaway: string;
  setup: {
    siteIds: string[];
    start: string;
    end: string;
    horizonMode: 'smooth' | 'terrain';
    earthMargin: number;
    focusTab: 'sky' | 'timeline' | 'elevation' | 'compare';
  };
  steps: Array<{
    heading: string;
    body: string;
  }>;
}

export const EDUCATOR_LESSONS: LessonConfig[] = [
  {
    id: 'polar-twilight',
    title: 'Lesson 1: Why is the south pole always twilight?',
    audience: 'Students & Public',
    durationLabel: '3 min interactive',
    summary:
      'Unlike Earth’s 23.4° axial tilt, the Moon’s spin axis is tilted only ~1.54° relative to the ecliptic plane. Near the poles, the Sun circles 360° around the horizon without ever rising high overhead.',
    keyTakeaway:
      'Crater floors stay in permanent shadow (trapping water ice), while tall crater rims like Shackleton catch grazing sunlight for ~80%+ of a lunar day.',
    setup: {
      siteIds: ['shackleton_rim', 'haworth'],
      start: '2027-06-01T00:00:00Z',
      end: '2027-07-01T00:00:00Z',
      horizonMode: 'terrain',
      earthMargin: 0,
      focusTab: 'elevation',
    },
    steps: [
      {
        heading: '1. Watch the Sun skim 0° elevation',
        body: 'In the Elevation chart, notice the amber Sun curve stays between -1.6° and +1.6° all month long—never climbing to noon overhead.',
      },
      {
        heading: '2. Compare terrain vs. smooth Moon',
        body: 'Even a 1° ridge blocks hours of grazing sunlight. Shackleton Rim sits +1.5 km high, keeping it sunlit far longer than lower terrain inside Haworth.',
      },
      {
        heading: '3. Scrub the 3D Sky Dome',
        body: 'Switch to Sky View and drag the time slider to watch the Sun glide horizontally along the crater rim horizon.',
      },
    ],
  },
  {
    id: 'earth-wobble',
    title: 'Lesson 2: Why does Earth wobble in the lunar sky?',
    audience: 'Educators & Mission Analysts',
    durationLabel: '4 min interactive',
    summary:
      'The Moon is tidally locked to Earth, so Earth stays near a fixed compass bearing—but orbital eccentricity and 6.7° inclination make Earth bob up and down by roughly ±7° every month.',
    keyTakeaway:
      'Sites near the south pole (89°S) lose Direct-to-Earth visibility whenever Earth dips below the southern libration trough unless elevated on a peak like Malapert Massif.',
    setup: {
      siteIds: ['shackleton_rim', 'malapert_massif'],
      start: '2027-03-01T00:00:00Z',
      end: '2027-04-01T00:00:00Z',
      horizonMode: 'terrain',
      earthMargin: 2,
      focusTab: 'sky',
    },
    steps: [
      {
        heading: '1. Observe the cyan Earth loop in 3D Sky View',
        body: 'Notice Earth traces a vertical ellipse near a steady azimuth (~235° at Shackleton Rim, ~0° North at Malapert Massif) rather than circling the whole sky.',
      },
      {
        heading: '2. Notice Malapert Massif’s comms advantage',
        body: 'At 86.0°S (+4.85 km altitude), Malapert tilts 4° closer to Earth than the pole, lifting the entire libration loop higher above the horizon.',
      },
      {
        heading: '3. Test antenna mask margin',
        body: 'In Expert mode, raising Earth Margin from 0° to 2° shrinks communication windows when Earth grazes distant crater ridges.',
      },
    ],
  },
  {
    id: 'pick-landing-site',
    title: 'Lesson 3: Choose the best CLPS landing site',
    audience: 'Mission Planners & Teams',
    durationLabel: '5 min challenge',
    summary:
      'Every landing site trades solar power continuity against Direct-to-Earth communication uptime and longest continuous night duration (which dictates lander battery mass).',
    keyTakeaway:
      'Combining simultaneous Sun + Earth visibility ("Both %") reveals true active science windows without burning battery reserves.',
    setup: {
      siteIds: ['shackleton_rim', 'connecting_ridge', 'malapert_massif', 'leibnitz_beta'],
      start: '2027-09-10T00:00:00Z',
      end: '2027-09-24T00:00:00Z',
      horizonMode: 'terrain',
      earthMargin: 0,
      focusTab: 'compare',
    },
    steps: [
      {
        heading: '1. Inspect the multi-site Compare table',
        body: 'Compare Sunlit %, Earth DTE %, Both %, and Longest Darkness Hours across Shackleton Rim, Connecting Ridge, Malapert Massif, and Mons Mouton.',
      },
      {
        heading: '2. Check battery sizing risk',
        body: 'A 14-day lander with limited batteries needs short continuous darkness spans—look at Longest Night (hours) before picking a site.',
      },
      {
        heading: '3. Optimize launch timing',
        body: 'Open the Landing Date Finder tab to scan an entire year and click the peak emerald cell for maximum simultaneous Sun + Earth coverage.',
      },
    ],
  },
];

export const TOUR_STEPS = [
  {
    title: '1. Pick Sites on the South Pole Map',
    body: 'Select up to 5 NASA Artemis/CLPS candidate regions—or click directly on the LOLA polar map to drop a custom coordinate pin.',
  },
  {
    title: '2. Choose Dates & Scrub Mission Time',
    body: 'Pick any mission window (default 14 Earth days) and drag the timeline slider or press Play to animate Sun and Earth motion.',
  },
  {
    title: '3. Explore 3D Sky Dome, Timeline & Date Finder',
    body: 'Inspect terrain horizon masking in 3D, check yellow/cyan/emerald visibility bars, or switch to Expert mode for antenna margins and solar wattage.',
  },
];
