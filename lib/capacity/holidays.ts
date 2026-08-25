import Holidays from 'date-holidays';
import type { CapacityHoliday, CapacityMember, LocalDate } from './types';

// Cache: instantiating `new Holidays(country)` per member per render is the #1 perf mistake.
const cache = new Map<string, Map<LocalDate, CapacityHoliday>>();

/** Public holidays for a member's country/region across the given years, as a date->holiday map. */
export function publicHolidayMap(
  m: Pick<CapacityMember, 'country' | 'state' | 'region'>,
  years: number[],
): Map<LocalDate, CapacityHoliday> {
  // No country -> no public holidays (member still gets weekends + PTO).
  if (!m.country) return new Map<LocalDate, CapacityHoliday>();

  const key = `${m.country}|${m.state ?? ''}|${m.region ?? ''}|${years.join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const map = new Map<LocalDate, CapacityHoliday>();
  try {
    const hd = m.region
      ? new Holidays(m.country, m.state || '', m.region)
      : m.state
        ? new Holidays(m.country, m.state)
        : new Holidays(m.country);
    for (const y of years) {
      const list = hd.getHolidays(y) || [];
      for (const h of list) {
        if (h.type !== 'public') continue; // drop observance/optional/bank
        const date = String(h.date).slice(0, 10);
        map.set(date, { date, name: h.name, source: 'public', regionKey: key });
      }
    }
  } catch {
    // Unknown country code etc. — return empty map rather than throwing.
  }
  cache.set(key, map);
  return map;
}

/** Merge team-wide manual holidays on top of public ones (team source wins on collision). */
export function mergeHolidays(
  pub: Map<LocalDate, CapacityHoliday>,
  team: CapacityHoliday[],
): Map<LocalDate, CapacityHoliday> {
  const out = new Map(pub);
  for (const t of team) out.set(t.date, { ...t, source: 'team' });
  return out;
}

/** Years spanned by an inclusive date range, e.g. ['2026-12-20','2027-01-05'] -> [2026, 2027]. */
export function yearsInRange(start: LocalDate, end: LocalDate): number[] {
  const y0 = Number(start.slice(0, 4));
  const y1 = Number(end.slice(0, 4));
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) out.push(y);
  return out;
}
