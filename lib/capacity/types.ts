// Pure capacity-engine types. Dates are ALWAYS 'YYYY-MM-DD' strings (no TZ traps).

export type LocalDate = string; // 'YYYY-MM-DD'

export interface DateRange {
  start: LocalDate; // inclusive
  end: LocalDate; // inclusive
}

/** 0=Sun … 6=Sat. Default business days = Mon–Fri = [1,2,3,4,5]. */
export type BusinessWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CapacitySprint {
  id: string;
  name: string;
  range: DateRange;
  businessDays?: BusinessWeekday[];
}

export interface PtoEntry {
  memberId: string;
  date: LocalDate;
  /** Fraction of the working day off. 1 = full, 0.5 = half. Default 1. */
  fraction?: number;
  reason?: string;
}

export interface CapacityHoliday {
  date: LocalDate;
  name: string;
  source: 'public' | 'team';
  regionKey?: string;
}

export interface CapacityMember {
  id: string;
  displayName: string;
  active: boolean;
  /** date-holidays country code. Undefined = no public holidays applied. */
  country?: string;
  state?: string;
  region?: string;
  startDate?: LocalDate;
  endDate?: LocalDate;
  focusFactor?: number; // legacy day-rate input, no longer drives capacity
  /** Seniority multiplier — legacy, no longer drives capacity. */
  seniorityModifier?: number;
  pointsPerDay?: number; // legacy day-rate input, no longer drives capacity
  minCapacityDays?: number | null;
  /** FTE: 1 = full time, 0.5 = half time. */
  capacityFactor?: number;
  /** Story points this member delivers in a full sprint (overrides team default). */
  sprintBandwidthPoints?: number | null;
}

export type Severity = 'info' | 'warning' | 'critical';

export interface WarningThreshold {
  warning: number;
  critical: number;
}

export interface WarningParams {
  capacityDropPct: WarningThreshold; // {0.15, 0.30}
  overCommitPct: WarningThreshold; // {1.0, 1.15}
  carryOverRatio: WarningThreshold; // {0.30, 0.50}
  ptoClusterPct: WarningThreshold; // {0.30, 0.50}
  minCapacityEnabled: boolean;
}

export interface CapacityParams {
  businessDays: BusinessWeekday[];
  defaultFocusFactor: number;
  defaultPointsPerDay: number;
  /** Team fallback bandwidth (SP/sprint) for a member with none of their own. */
  defaultSprintBandwidthPoints: number;
  velocity?: {
    avgPointsPerSprint: number;
    avgPersonDaysPerSprint: number;
  };
  warnings: WarningParams;
}

export interface DayLedgerEntry {
  date: LocalDate;
  isBusinessDay: boolean;
  isActiveMember: boolean;
  holiday?: CapacityHoliday;
  ptoFraction: number;
  contributedDays: number;
}

export interface MemberCapacity {
  memberId: string;
  displayName: string;
  grossBusinessDays: number;
  holidayDays: number;
  ptoDays: number;
  netWorkingDays: number;
  focusFactor: number;
  availableDays: number;
  pointsPerDay: number;
  availablePoints: number;
  belowMinimum: boolean;
  minCapacityDays: number | null;
  ledger: DayLedgerEntry[];
}

export interface TeamCapacity {
  sprintId: string;
  members: MemberCapacity[];
  totalAvailableDays: number;
  totalAvailablePoints: number;
  pointsBasis: 'bandwidth' | 'velocity' | 'points-per-day';
  effectivePointsPerDay: number;
}

export interface FreeCapacity {
  capacityPoints: number;
  committedPoints: number;
  carryOverPoints: number;
  freePoints: number;
  utilizationPct: number;
  overCommitted: boolean;
}

export type WarningCode =
  | 'CAPACITY_DROP'
  | 'OVER_COMMITTED'
  | 'MEMBER_BELOW_MIN'
  | 'PTO_CLUSTER'
  | 'CARRYOVER_HIGH'
  | 'ZERO_CAPACITY_MEMBER';

export interface Warning {
  code: WarningCode;
  severity: Severity;
  message: string;
  meta: Record<string, number | string>;
}

export const DEFAULT_WARNING_PARAMS: WarningParams = {
  capacityDropPct: { warning: 0.15, critical: 0.3 },
  overCommitPct: { warning: 1.0, critical: 1.15 },
  carryOverRatio: { warning: 0.3, critical: 0.5 },
  ptoClusterPct: { warning: 0.3, critical: 0.5 },
  minCapacityEnabled: true,
};

export const DEFAULT_PARAMS: CapacityParams = {
  businessDays: [1, 2, 3, 4, 5],
  defaultFocusFactor: 0.8,
  defaultPointsPerDay: 1.0,
  defaultSprintBandwidthPoints: 8,
  velocity: undefined,
  warnings: DEFAULT_WARNING_PARAMS,
};
