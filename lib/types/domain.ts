// Domain types that mirror the Supabase schema (see supabase/migrations/0001_init.sql).
// The Supabase client is untyped; cast query results to these at call sites.

export type UUID = string;
export type ISODate = string; // 'YYYY-MM-DD'

export type AppRole = 'admin' | 'member';
export type PtoType = 'vacation' | 'sick' | 'personal' | 'other';

export interface Role {
  id: UUID;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface Seniority {
  id: UUID;
  name: string;
  focus_modifier: number;
  sort_order: number;
}

export interface Team {
  id: UUID;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface Member {
  id: UUID;
  team_id: UUID;
  profile_id: UUID | null;
  full_name: string;
  email: string | null;
  country_code: string | null;
  region_code: string | null;
  role_id: UUID | null;
  seniority_id: UUID | null;
  hours_per_day: number;
  /** FTE factor — 1 = full time, 0.5 = half time (workbook Capacity!B). */
  capacity_factor: number;
  /** Story points this member delivers in a full sprint. */
  sprint_bandwidth_points: number | null;
  focus_factor: number | null;
  points_per_day: number | null;
  min_capacity_days: number | null;
  start_date: ISODate | null;
  end_date: ISODate | null;
  is_active: boolean;
  // Optional joined lookups
  role?: Role | null;
  seniority?: Seniority | null;
}

export interface Sprint {
  id: UUID;
  team_id: UUID;
  name: string;
  ado_iteration_path: string | null;
  start_date: ISODate;
  end_date: ISODate;
  working_days: number | null;
  velocity_committed_points: number | null;
  velocity_completed_points: number | null;
  is_closed: boolean;
}

export interface Holiday {
  id: UUID;
  /** null = company-wide (applies to every member, whatever their country). */
  country_code: string | null;
  region_code: string | null;
  holiday_date: ISODate;
  name: string;
  is_manual: boolean;
  team_id: UUID | null;
  source: string | null;
}

export interface Pto {
  id: UUID;
  member_id: UUID;
  start_date: ISODate;
  end_date: ISODate;
  pto_type: PtoType;
  day_fraction: number;
  note: string | null;
}

export interface Settings {
  id: UUID;
  team_id: UUID | null;
  default_focus_factor: number;
  points_per_day: number;
  default_sprint_bandwidth_points: number;
  min_capacity_per_member: number;
  default_sprint_length_days: number;
  working_days_per_week: number;
  working_weekdays: number[];
  warn_capacity_drop: number;
  crit_capacity_drop: number;
  warn_over_commit: number;
  crit_over_commit: number;
  warn_carryover_ratio: number;
  crit_carryover_ratio: number;
  warn_pto_cluster: number;
  crit_pto_cluster: number;
  velocity_avg_points: number | null;
  velocity_avg_person_days: number | null;
  company_name: string | null;
  logo_url: string | null;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
}

export interface UserStory {
  id: UUID;
  team_id: UUID;
  sprint_id: UUID | null;
  ado_work_item_id: number;
  ado_iteration_path: string | null;
  title: string;
  work_item_type: string | null;
  state_raw: string | null;
  state_normalized: string | null;
  story_points: number | null;
  priority: number | null;
  assignee_member_id: UUID | null;
  assignee_raw: string | null;
  assignee_email: string | null;
  is_carry_over: boolean;
  tags: string[];
  raw: Record<string, string>;
  import_batch_id: UUID | null;
}

export interface Branding {
  companyName: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
}

export const DEFAULT_BRANDING: Branding = {
  companyName: 'Carrito',
  logoUrl: null,
  primaryColor: '#1677ff',
  secondaryColor: '#13c2c2',
};
