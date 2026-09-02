import Holidays from 'date-holidays';
import type { LocalDate } from './types';

/**
 * Materialise public holidays into public.holidays.
 *
 * The capacity engine computes holidays in TypeScript on demand, but the SQL
 * metrics views (0003_scrum_metrics.sql) read the table — so the table has to be
 * the source of truth for both, or the two disagree. This module produces the
 * rows; the /api/holidays/sync route writes them.
 *
 * Rows written here are marked is_manual = false and source = SYNC_SOURCE, and
 * the route replaces exactly that set — company holidays an admin entered by
 * hand (is_manual = true) are never touched.
 */

export const SYNC_SOURCE = 'date-holidays';

export interface SyncHolidayRow {
  country_code: string;
  region_code: string | null;
  holiday_date: LocalDate;
  name: string;
  is_manual: false;
  team_id: null;
  source: string;
}

export interface CountrySpec {
  country: string;
  region?: string | null;
}

/** Distinct, upper-cased country/region pairs worth syncing. */
export function countriesToSync(
  members: { country_code: string | null; region_code: string | null }[],
): CountrySpec[] {
  const seen = new Map<string, CountrySpec>();
  for (const m of members) {
    if (!m.country_code) continue;
    const country = m.country_code.toUpperCase();
    const region = m.region_code || null;
    const key = `${country}|${region ?? ''}`;
    if (!seen.has(key)) seen.set(key, { country, region });
  }
  return [...seen.values()];
}

export function yearsToSync(sprints: { start_date: string; end_date: string }[], today = new Date()): number[] {
  const thisYear = today.getUTCFullYear();
  let min = thisYear;
  let max = thisYear + 1;
  for (const s of sprints) {
    const a = Number(s.start_date.slice(0, 4));
    const b = Number(s.end_date.slice(0, 4));
    if (Number.isFinite(a)) min = Math.min(min, a);
    if (Number.isFinite(b)) max = Math.max(max, b);
  }
  const out: number[] = [];
  for (let y = min; y <= max; y++) out.push(y);
  return out;
}

/**
 * Only `public` holidays are emitted — observances, bank and optional days do
 * not close an office, and counting them would silently deflate capacity.
 * This matches the filter in lib/capacity/holidays.ts.
 *
 * A holiday landing on a weekend is still stored; the SQL helper only counts
 * holidays that fall on a configured working weekday, which is exactly the
 * workbook's "Impacts Work Calendar" column.
 */
export function buildHolidayRows(specs: CountrySpec[], years: number[]): SyncHolidayRow[] {
  const rows: SyncHolidayRow[] = [];
  const seen = new Set<string>();

  for (const spec of specs) {
    let hd: Holidays;
    try {
      hd = spec.region ? new Holidays(spec.country, spec.region) : new Holidays(spec.country);
    } catch {
      continue; // unknown country code — skip rather than fail the whole sync
    }
    for (const year of years) {
      let list: ReturnType<Holidays['getHolidays']>;
      try {
        list = hd.getHolidays(year) || [];
      } catch {
        continue;
      }
      for (const h of list) {
        if (h.type !== 'public') continue;
        const date = String(h.date).slice(0, 10);
        const key = `${spec.country}|${spec.region ?? ''}|${date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          country_code: spec.country,
          region_code: spec.region ?? null,
          holiday_date: date,
          name: h.name,
          is_manual: false,
          team_id: null,
          source: SYNC_SOURCE,
        });
      }
    }
  }
  return rows;
}

export interface SyncPlan {
  rows: SyncHolidayRow[];
  countries: CountrySpec[];
  years: number[];
  /** Inclusive date window the sync owns, so the replace is precisely scoped. */
  window: { start: LocalDate; end: LocalDate } | null;
}

export function planHolidaySync(
  members: { country_code: string | null; region_code: string | null }[],
  sprints: { start_date: string; end_date: string }[],
  today = new Date(),
): SyncPlan {
  const countries = countriesToSync(members);
  const years = yearsToSync(sprints, today);
  const rows = countries.length ? buildHolidayRows(countries, years) : [];
  const window = years.length
    ? { start: `${years[0]}-01-01`, end: `${years[years.length - 1]}-12-31` }
    : null;
  return { rows, countries, years, window };
}
