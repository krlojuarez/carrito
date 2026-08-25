import type {
  Holiday as DbHoliday,
  Member as DbMember,
  Pto as DbPto,
  Settings as DbSettings,
  Sprint as DbSprint,
} from '@/lib/types/domain';
import { listDays, isBusinessDay } from './calendar';
import { computeFreeCapacity, computeIdealTeamCapacity, computeTeamCapacity, type StoryLoad } from './engine';
import { mergeHolidays, publicHolidayMap, yearsInRange } from './holidays';
import { evaluateWarnings, type PtoDayLoad } from './warnings';
import type {
  BusinessWeekday,
  CapacityHoliday,
  CapacityMember,
  CapacityParams,
  CapacitySprint,
  FreeCapacity,
  LocalDate,
  TeamCapacity,
  Warning,
} from './types';
import { DEFAULT_PARAMS } from './types';

export function settingsToParams(s: DbSettings | null): CapacityParams {
  if (!s) return DEFAULT_PARAMS;
  const bd = (s.working_weekdays?.length ? s.working_weekdays : [1, 2, 3, 4, 5]) as BusinessWeekday[];
  const velocity =
    s.velocity_avg_points != null && s.velocity_avg_person_days != null && s.velocity_avg_person_days > 0
      ? { avgPointsPerSprint: s.velocity_avg_points, avgPersonDaysPerSprint: s.velocity_avg_person_days }
      : undefined;
  return {
    businessDays: bd,
    defaultFocusFactor: s.default_focus_factor ?? 0.8,
    defaultPointsPerDay: s.points_per_day ?? 1.0,
    velocity,
    warnings: {
      capacityDropPct: { warning: s.warn_capacity_drop ?? 0.15, critical: s.crit_capacity_drop ?? 0.3 },
      overCommitPct: { warning: s.warn_over_commit ?? 1.0, critical: s.crit_over_commit ?? 1.15 },
      carryOverRatio: { warning: s.warn_carryover_ratio ?? 0.3, critical: s.crit_carryover_ratio ?? 0.5 },
      ptoClusterPct: { warning: s.warn_pto_cluster ?? 0.3, critical: s.crit_pto_cluster ?? 0.5 },
      minCapacityEnabled: true,
    },
  };
}

export function memberToEngine(m: DbMember, settings: DbSettings | null): CapacityMember {
  const seniorityModifier = m.seniority?.focus_modifier ?? 1;
  return {
    id: m.id,
    displayName: m.full_name,
    active: m.is_active,
    country: m.country_code,
    region: m.region_code || undefined,
    startDate: m.start_date || undefined,
    endDate: m.end_date || undefined,
    focusFactor: m.focus_factor ?? undefined,
    seniorityModifier,
    pointsPerDay: m.points_per_day ?? undefined,
    minCapacityDays: m.min_capacity_days ?? settings?.min_capacity_per_member ?? null,
  };
}

/** Expand a member's PTO ranges into a date->fraction map limited to [rangeStart, rangeEnd]. */
export function ptoMapForMember(
  memberId: string,
  ptos: DbPto[],
  rangeStart: LocalDate,
  rangeEnd: LocalDate,
): Map<LocalDate, number> {
  const map = new Map<LocalDate, number>();
  for (const p of ptos) {
    if (p.member_id !== memberId) continue;
    for (const d of listDays({ start: p.start_date, end: p.end_date })) {
      if (d < rangeStart || d > rangeEnd) continue;
      map.set(d, Math.min(1, (map.get(d) ?? 0) + (p.day_fraction ?? 1)));
    }
  }
  return map;
}

export interface FullCapacityResult {
  team: TeamCapacity;
  ideal: TeamCapacity;
  free: FreeCapacity | null;
  warnings: Warning[];
}

/**
 * End-to-end capacity for a sprint from DB rows. Public holidays are computed
 * on the fly per member country; manual team holidays come from the DB.
 */
export function computeSprintCapacity(args: {
  sprint: DbSprint;
  members: DbMember[];
  ptos: DbPto[];
  manualHolidays: DbHoliday[];
  settings: DbSettings | null;
  stories?: StoryLoad[];
}): FullCapacityResult {
  const { sprint, members, ptos, manualHolidays, settings, stories } = args;
  const params = settingsToParams(settings);
  const engineSprint: CapacitySprint = {
    id: sprint.id,
    name: sprint.name,
    range: { start: sprint.start_date, end: sprint.end_date },
  };
  const years = yearsInRange(sprint.start_date, sprint.end_date);

  const manualForAll: CapacityHoliday[] = manualHolidays
    .filter((h) => h.is_manual)
    .map((h) => ({ date: h.holiday_date, name: h.name, source: 'team' as const }));

  const engineMembers = members.map((m) => memberToEngine(m, settings));

  const holidaysFor = (em: CapacityMember) =>
    mergeHolidays(publicHolidayMap({ country: em.country, state: em.state, region: em.region }, years), manualForAll);
  const ptoFor = (em: CapacityMember) => ptoMapForMember(em.id, ptos, sprint.start_date, sprint.end_date);

  const team = computeTeamCapacity(engineMembers, engineSprint, params, holidaysFor, ptoFor);
  const ideal = computeIdealTeamCapacity(engineMembers, engineSprint, params);
  const free = stories ? computeFreeCapacity(team, stories) : null;

  // PTO clustering per business day
  const activeCount = engineMembers.filter((m) => m.active).length || 1;
  const bd = params.businessDays;
  const ptoByBusinessDay: PtoDayLoad[] = listDays(engineSprint.range)
    .filter((d) => isBusinessDay(d, bd))
    .map((d) => {
      let out = 0;
      for (const em of engineMembers) {
        const f = ptoFor(em).get(d) ?? 0;
        out += f;
      }
      return { date: d, outFraction: out / activeCount };
    });

  const warnings = evaluateWarnings(team, ideal, free, ptoByBusinessDay, params.warnings);
  return { team, ideal, free, warnings };
}
