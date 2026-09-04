// Row shapes for the Scrum Metrics views created in
// supabase/migrations/0003_scrum_metrics.sql. Every field maps to a cell in the
// "Scrum Metrics" workbook this replaces — the workbook reference is noted so
// the two can be reconciled during the changeover.

import type { ISODate, UUID } from '@/lib/types/domain';

/** One row of the workbook's Velocity sheet. */
export interface SprintVelocity {
  sprint_id: UUID;
  team_id: UUID;
  sprint_name: string;
  start_date: ISODate;
  end_date: ISODate;
  is_closed: boolean;
  committed_snapshot_at: string | null;

  story_count: number;
  /** Velocity!N — "How many Stories where done in the sprint". */
  stories_done: number;
  stories_carried: number;

  /** Velocity!D — SP committed at sprint start (not scope creep). */
  committed_points: number;
  /** Velocity!E — SP added after the sprint started. */
  unplanned_points: number;
  /** Velocity!F — SP that did not spill. */
  done_points: number;
  /** Points that reached a done state, net of anything that spilled. */
  delivered_points: number;
  /** done_points - delivered_points: work counted as done that never was. */
  unverified_done_points: number;
  /** Velocity!I — all SP in the sprint, committed + unplanned. */
  total_points: number;
  /** Velocity!J — SP spilling into the next sprint. */
  carry_over_points: number;
  removed_points: number;

  /** Velocity!G — done / committed. Null when nothing was committed. */
  done_pct: number | null;
  /** Velocity!K — carry-over / committed. */
  carry_over_pct: number | null;
  /** Velocity!L — total - carry-over. */
  capacity_points: number;
  /** Velocity!M — net working days / gross working days. */
  workday_pct: number | null;
  /** Velocity!H — cumulative mean of done_points across sprints. */
  velocity_avg_points: number | null;

  /** True while the sprint is still running — its Done figure is not history yet. */
  is_provisional: boolean;
  gross_working_days: number;
  /** Of the nominal days, those a member was actually on the team. */
  tenure_working_days: number;
  net_working_days: number;
  holiday_days: number;
  pto_days: number;
}

/** One member's block on the workbook's Capacity sheet, for one sprint. */
export interface MemberSprintCapacity {
  sprint_id: UUID;
  team_id: UUID;
  sprint_name: string;
  start_date: ISODate;
  end_date: ISODate;
  member_id: UUID;
  member_name: string;
  country_code: string | null;
  /** Capacity!B — FTE factor (1 = full time, 0.5 = half). */
  capacity_factor: number;
  /** Capacity!A — working weekdays in the sprint (nominal). */
  gross_days: number;
  /** Of those, the days this member was on the team. */
  tenure_days: number;
  /** Capacity!G/L/Q/W */
  holiday_days: number;
  /** Capacity!H/M/R/X */
  pto_days: number;
  /** Capacity!I/N/S/Y — gross - holidays - PTO. */
  net_days: number;
  /** Capacity!T/AA */
  committed_points: number;
  /** Capacity!J/O/U/AB */
  completed_points: number;
  total_points: number;
  carry_over_points: number;
  /** Capacity!K/P/V/AC — completed / net working days. */
  points_per_day: number | null;
}

/** Capacity!E and Capacity!F — the source of the "AVG Capacity per day" chart. */
export interface MemberCapacityProfile {
  team_id: UUID;
  member_id: UUID;
  member_name: string;
  country_code: string | null;
  capacity_factor: number;
  sprints_measured: number;
  /** Capacity!E */
  avg_points_per_day: number | null;
  avg_gross_days: number | null;
  /** Capacity!F */
  capacity_points_per_sprint: number | null;
  avg_net_days: number | null;
  completed_points_total: number;
  committed_points_total: number;
}

/** Forward-looking capacity — something the workbook could not do. */
export interface SprintForecast {
  sprint_id: UUID;
  team_id: UUID;
  sprint_name: string;
  start_date: ISODate;
  end_date: ISODate;
  available_person_days: number;
  capacity_points: number;
  committed_points: number;
  carry_over_points: number;
  free_points: number;
}

export type DataQualityCode =
  | 'NO_CREATED_DATE'
  | 'NO_POINTS'
  | 'DONE_WITHOUT_DOD'
  | 'CARRY_OVER_EXCEEDS_POINTS'
  | 'REMOVED_WITH_POINTS'
  | 'NO_OWNER';

/** A row that would silently distort the metrics. Replaces eyeballing a tab. */
export interface DataQualityIssue {
  team_id: UUID;
  sprint_id: UUID;
  sprint_name: string;
  story_id: UUID;
  ado_work_item_id: number;
  title: string;
  state_raw: string | null;
  story_points: number;
  carry_over_points: number;
  issue_code: DataQualityCode;
  issue: string;
}

export const DATA_QUALITY_SEVERITY: Record<DataQualityCode, 'error' | 'warning'> = {
  NO_CREATED_DATE: 'warning',
  NO_POINTS: 'warning',
  DONE_WITHOUT_DOD: 'error',
  CARRY_OVER_EXCEEDS_POINTS: 'error',
  REMOVED_WITH_POINTS: 'warning',
  NO_OWNER: 'warning',
};

/** One tag's points within one sprint (v_story_category_points). */
export interface CategoryPoints {
  team_id: UUID;
  sprint_id: UUID;
  sprint_name: string;
  sprint_start: ISODate;
  category: string;
  category_label: string;
  story_count: number;
  committed_points: number;
  done_points: number;
  delivered_points: number;
  total_points: number;
  carry_over_points: number;
}

export interface CloseSprintResult {
  sprint_id: UUID;
  next_sprint_id: UUID | null;
  committed_points: number;
  completed_points: number;
  stories_carried: number;
  stories_moved: number;
}
