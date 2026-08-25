import { listDays, isBusinessDay, round1, round2, sum } from './calendar';
import type {
  CapacityHoliday,
  CapacityMember,
  CapacityParams,
  CapacitySprint,
  DayLedgerEntry,
  FreeCapacity,
  LocalDate,
  MemberCapacity,
  TeamCapacity,
} from './types';

function resolvePpd(member: CapacityMember, params: CapacityParams): number {
  if (member.pointsPerDay != null) return member.pointsPerDay;
  const v = params.velocity;
  if (v && v.avgPersonDaysPerSprint > 0) return v.avgPointsPerSprint / v.avgPersonDaysPerSprint;
  return params.defaultPointsPerDay;
}

/**
 * Per-member capacity in a single pass over the sprint calendar.
 * Priority per day: inactive -> non-business -> holiday -> PTO -> working.
 * A day that is both a holiday and PTO counts ONCE (as a holiday) — no double subtraction.
 */
export function computeMemberCapacity(
  member: CapacityMember,
  sprint: CapacitySprint,
  params: CapacityParams,
  holidaysByDate: Map<LocalDate, CapacityHoliday>,
  ptoByDate: Map<LocalDate, number>,
): MemberCapacity {
  const businessDays = sprint.businessDays ?? params.businessDays;
  const active = (d: LocalDate) =>
    member.active &&
    (!member.startDate || d >= member.startDate) &&
    (!member.endDate || d <= member.endDate);

  const ledger: DayLedgerEntry[] = [];
  let gross = 0;
  let holidayDays = 0;
  let ptoDays = 0;
  let net = 0;

  for (const date of listDays(sprint.range)) {
    const activeToday = active(date);
    const biz = isBusinessDay(date, businessDays);
    const holiday = holidaysByDate.get(date);
    const ptoFrac = Math.min(1, Math.max(0, ptoByDate.get(date) ?? 0));

    let contributed = 0;
    if (activeToday && biz) {
      gross += 1;
      if (holiday) {
        holidayDays += 1; // holiday wins; PTO on same day ignored
      } else if (ptoFrac > 0) {
        ptoDays += ptoFrac;
        contributed = 1 - ptoFrac;
        net += contributed;
      } else {
        contributed = 1;
        net += 1;
      }
    }
    ledger.push({
      date,
      isBusinessDay: biz,
      isActiveMember: activeToday,
      holiday,
      ptoFraction: holiday ? 0 : ptoFrac,
      contributedDays: contributed,
    });
  }

  const focusFactor = member.focusFactor ?? params.defaultFocusFactor;
  const seniority = member.seniorityModifier ?? 1;
  const availableDays = round2(net * focusFactor * seniority);
  const pointsPerDay = resolvePpd(member, params);
  const availablePoints = round1(availableDays * pointsPerDay);
  const min = member.minCapacityDays ?? null;

  return {
    memberId: member.id,
    displayName: member.displayName,
    grossBusinessDays: gross,
    holidayDays,
    ptoDays: round2(ptoDays),
    netWorkingDays: round2(net),
    focusFactor,
    availableDays,
    pointsPerDay,
    availablePoints,
    minCapacityDays: min,
    belowMinimum: min != null && availableDays < min,
    ledger,
  };
}

export function computeTeamCapacity(
  members: CapacityMember[],
  sprint: CapacitySprint,
  params: CapacityParams,
  holidaysFor: (m: CapacityMember) => Map<LocalDate, CapacityHoliday>,
  ptoFor: (m: CapacityMember) => Map<LocalDate, number>,
): TeamCapacity {
  const rows = members
    .filter((m) => m.active)
    .map((m) => computeMemberCapacity(m, sprint, params, holidaysFor(m), ptoFor(m)));
  const totalDays = round2(sum(rows, (r) => r.availableDays));
  const totalPts = round1(sum(rows, (r) => r.availablePoints));
  return {
    sprintId: sprint.id,
    members: rows,
    totalAvailableDays: totalDays,
    totalAvailablePoints: totalPts,
    pointsBasis: params.velocity ? 'velocity' : 'points-per-day',
    effectivePointsPerDay: totalDays > 0 ? round2(totalPts / totalDays) : 0,
  };
}

/** Ideal baseline: same members, but zero PTO and zero holidays (all active full sprint). */
export function computeIdealTeamCapacity(
  members: CapacityMember[],
  sprint: CapacitySprint,
  params: CapacityParams,
): TeamCapacity {
  const empty = new Map<LocalDate, CapacityHoliday>();
  const emptyPto = new Map<LocalDate, number>();
  return computeTeamCapacity(
    members.map((m) => ({ ...m, startDate: undefined, endDate: undefined })),
    sprint,
    params,
    () => empty,
    () => emptyPto,
  );
}

export interface StoryLoad {
  points: number;
  isCarryOver: boolean;
  plannedInNextSprint: boolean;
}

export function computeFreeCapacity(team: TeamCapacity, stories: StoryLoad[]): FreeCapacity {
  const committedPoints = stories
    .filter((s) => s.plannedInNextSprint && !s.isCarryOver)
    .reduce((a, s) => a + (s.points || 0), 0);
  const carryOverPoints = stories
    .filter((s) => s.plannedInNextSprint && s.isCarryOver)
    .reduce((a, s) => a + (s.points || 0), 0);
  const capacityPoints = team.totalAvailablePoints;
  const load = committedPoints + carryOverPoints;
  return {
    capacityPoints,
    committedPoints: round1(committedPoints),
    carryOverPoints: round1(carryOverPoints),
    freePoints: round1(capacityPoints - load),
    utilizationPct: capacityPoints > 0 ? load / capacityPoints : load > 0 ? Infinity : 0,
    overCommitted: load > capacityPoints,
  };
}
