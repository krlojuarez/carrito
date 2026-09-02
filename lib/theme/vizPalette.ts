/**
 * Chart palette.
 *
 * These are the validated categorical slots — the hue ORDER is the
 * colour-vision-deficiency safety mechanism, not decoration, so add series at
 * the end rather than re-ordering. Verified with the data-viz palette validator
 * for both surfaces:
 *   light (#fcfcfb): worst adjacent CVD ΔE 9.1, normal-vision ΔE 19.6
 *   dark  (#1a1a19): worst adjacent CVD ΔE 8.4, normal-vision ΔE 19.3
 *
 * On the light surface, aqua / yellow / magenta sit below 3:1 against the
 * surface, so every chart using them ships the equivalent table view beside it
 * (the Velocity and Capacity tables on the metrics page).
 *
 * Brand colours from Admin → Branding intentionally drive the app chrome only.
 * Series colours must stay validated, and a user-chosen hex cannot be.
 */

export interface VizPalette {
  categorical: string[];
  surface: string;
  textPrimary: string;
  textSecondary: string;
  grid: string;
}

export const VIZ_LIGHT: VizPalette = {
  categorical: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  surface: '#fcfcfb',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  grid: '#e8e7e3',
};

export const VIZ_DARK: VizPalette = {
  categorical: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  surface: '#1a1a19',
  textPrimary: '#ffffff',
  textSecondary: '#c3c2b7',
  grid: '#383835',
};

/**
 * Fixed slot per series so a filter that hides a series never repaints the rest.
 * The order is also the chart's colour-scale domain — see SERIES_ORDER.
 */
export const SERIES_COLOR: Record<string, number> = {
  Commitment: 0,
  Unplanned: 1,
  Done: 2,
  'Velocity AVG': 3,
  'Capacity SP': 4,
};

/** Explicit colour-scale domain for the sprint-metrics chart. */
export const SERIES_ORDER = ['Commitment', 'Unplanned', 'Done', 'Velocity AVG', 'Capacity SP'];

export function colorForSeries(name: string, palette: VizPalette): string {
  const slot = SERIES_COLOR[name];
  return palette.categorical[slot ?? 0];
}

/** Status colours — reserved, never reused as a categorical slot. */
export const VIZ_STATUS = {
  good: '#008300',
  warning: '#eda100',
  serious: '#eb6834',
  critical: '#e34948',
} as const;
