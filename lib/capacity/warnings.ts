import type {
  FreeCapacity,
  LocalDate,
  Severity,
  TeamCapacity,
  Warning,
  WarningCode,
  WarningParams,
} from './types';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function mk(
  code: WarningCode,
  severity: Severity,
  message: string,
  meta: Record<string, number | string>,
): Warning {
  return { code, severity, message, meta };
}

export interface PtoDayLoad {
  date: LocalDate;
  /** Sum of PTO fractions / active members that day (0..1). */
  outFraction: number;
}

export function evaluateWarnings(
  team: TeamCapacity,
  ideal: { totalAvailableDays: number },
  free: FreeCapacity | null,
  ptoByBusinessDay: PtoDayLoad[],
  p: WarningParams,
): Warning[] {
  const w: Warning[] = [];

  // 1. Capacity drop vs an ideal (full) sprint.
  const drop =
    ideal.totalAvailableDays > 0 ? 1 - team.totalAvailableDays / ideal.totalAvailableDays : 0;
  if (drop >= p.capacityDropPct.critical)
    w.push(mk('CAPACITY_DROP', 'critical', `Team capacity down ${pct(drop)} vs a full sprint.`, { drop }));
  else if (drop >= p.capacityDropPct.warning)
    w.push(mk('CAPACITY_DROP', 'warning', `Team capacity down ${pct(drop)} vs a full sprint.`, { drop }));

  // 2 & 5. Commitment / carry-over.
  if (free) {
    if (free.utilizationPct >= p.overCommitPct.critical)
      w.push(mk('OVER_COMMITTED', 'critical', `Committed ${pct(free.utilizationPct)} of capacity.`, { u: free.utilizationPct }));
    else if (free.utilizationPct > p.overCommitPct.warning)
      w.push(mk('OVER_COMMITTED', 'warning', `Committed ${pct(free.utilizationPct)} of capacity.`, { u: free.utilizationPct }));

    const load = free.committedPoints + free.carryOverPoints;
    const ratio = load > 0 ? free.carryOverPoints / load : 0;
    if (ratio >= p.carryOverRatio.critical)
      w.push(mk('CARRYOVER_HIGH', 'critical', `Carry-over is ${pct(ratio)} of planned work.`, { ratio }));
    else if (ratio >= p.carryOverRatio.warning)
      w.push(mk('CARRYOVER_HIGH', 'warning', `Carry-over is ${pct(ratio)} of planned work.`, { ratio }));
  }

  // 3 & 6. Per-member.
  for (const m of team.members) {
    if (p.minCapacityEnabled && m.belowMinimum)
      w.push(
        mk('MEMBER_BELOW_MIN', 'warning', `${m.displayName} at ${m.availableDays}d, below min ${m.minCapacityDays}d.`, {
          have: m.availableDays,
          min: m.minCapacityDays ?? 0,
        }),
      );
    if (m.availableDays === 0 && m.grossBusinessDays > 0)
      w.push(mk('ZERO_CAPACITY_MEMBER', 'info', `${m.displayName} has zero capacity this sprint.`, {}));
  }

  // 4. PTO clustering.
  for (const d of ptoByBusinessDay) {
    if (d.outFraction >= p.ptoClusterPct.critical)
      w.push(mk('PTO_CLUSTER', 'critical', `${pct(d.outFraction)} of the team off ${d.date}.`, { date: d.date, out: d.outFraction }));
    else if (d.outFraction >= p.ptoClusterPct.warning)
      w.push(mk('PTO_CLUSTER', 'warning', `${pct(d.outFraction)} of the team off ${d.date}.`, { date: d.date, out: d.outFraction }));
  }

  return w;
}
