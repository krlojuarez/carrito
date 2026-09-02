import { createClient } from '@/lib/supabase/server';
import type {
  DataQualityIssue,
  MemberCapacityProfile,
  MemberSprintCapacity,
  SprintForecast,
  SprintVelocity,
} from '@/lib/metrics/types';

/**
 * Reads for the Scrum Metrics views (supabase/migrations/0003_scrum_metrics.sql).
 *
 * Every view is security_invoker, so RLS applies as the signed-in user and these
 * need no service-role key. The views do not exist on a database that has only
 * run 0001/0002 — each reader degrades to an empty array rather than blowing up
 * the page, and `metricsAvailable()` reports the real state so the UI can tell
 * the user to run the migration.
 */

export async function getSprintVelocity(teamId: string): Promise<SprintVelocity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_sprint_velocity')
    .select('*')
    .eq('team_id', teamId)
    .order('start_date', { ascending: true });
  if (error) return [];
  return (data as SprintVelocity[]) ?? [];
}

export async function getMemberSprintCapacity(teamId: string): Promise<MemberSprintCapacity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_member_sprint_capacity')
    .select('*')
    .eq('team_id', teamId)
    .order('start_date', { ascending: true });
  if (error) return [];
  return (data as MemberSprintCapacity[]) ?? [];
}

export async function getMemberCapacityProfile(teamId: string): Promise<MemberCapacityProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_member_capacity_profile')
    .select('*')
    .eq('team_id', teamId)
    .order('member_name', { ascending: true });
  if (error) return [];
  return (data as MemberCapacityProfile[]) ?? [];
}

export async function getSprintForecast(teamId: string): Promise<SprintForecast[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_sprint_forecast')
    .select('*')
    .eq('team_id', teamId)
    .order('start_date', { ascending: true });
  if (error) return [];
  return (data as SprintForecast[]) ?? [];
}

export async function getDataQualityIssues(
  teamId: string,
  sprintId?: string,
): Promise<DataQualityIssue[]> {
  const supabase = await createClient();
  let query = supabase.from('v_sprint_data_quality').select('*').eq('team_id', teamId);
  if (sprintId) query = query.eq('sprint_id', sprintId);
  const { data, error } = await query;
  if (error) return [];
  return (data as DataQualityIssue[]) ?? [];
}

/** True when 0003_scrum_metrics.sql has been applied to this database. */
export async function metricsAvailable(): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from('v_sprint_velocity').select('sprint_id').limit(1);
  return !error;
}

export interface MetricsBundle {
  available: boolean;
  velocity: SprintVelocity[];
  memberCapacity: MemberSprintCapacity[];
  capacityProfile: MemberCapacityProfile[];
  forecast: SprintForecast[];
  issues: DataQualityIssue[];
}

const EMPTY: MetricsBundle = {
  available: false,
  velocity: [],
  memberCapacity: [],
  capacityProfile: [],
  forecast: [],
  issues: [],
};

export async function getMetricsBundle(teamId: string): Promise<MetricsBundle> {
  if (!(await metricsAvailable())) return EMPTY;

  const [velocity, memberCapacity, capacityProfile, forecast, issues] = await Promise.all([
    getSprintVelocity(teamId),
    getMemberSprintCapacity(teamId),
    getMemberCapacityProfile(teamId),
    getSprintForecast(teamId),
    getDataQualityIssues(teamId),
  ]);
  return { available: true, velocity, memberCapacity, capacityProfile, forecast, issues };
}
