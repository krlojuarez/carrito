import { createClient } from '@/lib/supabase/server';
import type {
  Holiday,
  Member,
  Pto,
  Role,
  Seniority,
  Settings,
  Sprint,
  Team,
  UserStory,
} from '@/lib/types/domain';

export async function getTeams(): Promise<Team[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('teams').select('*').order('name');
  return (data as Team[]) ?? [];
}

/** Carrito is single-team-first: return the first (active) team, or null. */
export async function getPrimaryTeam(): Promise<Team | null> {
  const teams = await getTeams();
  return teams.find((t) => t.is_active) ?? teams[0] ?? null;
}

export async function getMembers(teamId: string): Promise<Member[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('members')
    .select('*, role:roles(*), seniority:seniorities(*)')
    .eq('team_id', teamId)
    .order('full_name');
  return (data as Member[]) ?? [];
}

export async function getSprints(teamId: string): Promise<Sprint[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('sprints')
    .select('*')
    .eq('team_id', teamId)
    .order('start_date', { ascending: false });
  return (data as Sprint[]) ?? [];
}

export async function getSprint(id: string): Promise<Sprint | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('sprints').select('*').eq('id', id).maybeSingle();
  return (data as Sprint) ?? null;
}

export async function getStories(teamId: string, sprintId?: string): Promise<UserStory[]> {
  const supabase = await createClient();
  let q = supabase.from('user_stories').select('*').eq('team_id', teamId);
  if (sprintId) q = q.eq('sprint_id', sprintId);
  const { data } = await q.order('ado_work_item_id');
  return (data as UserStory[]) ?? [];
}

export async function getPtos(teamId: string): Promise<Pto[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('pto')
    .select('*, members!inner(team_id)')
    .eq('members.team_id', teamId);
  return ((data as (Pto & { members?: unknown })[]) ?? []).map(({ members, ...p }) => p as Pto);
}

export async function getManualHolidays(teamId: string): Promise<Holiday[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('holidays')
    .select('*')
    .or(`team_id.eq.${teamId},team_id.is.null`);
  return (data as Holiday[]) ?? [];
}

export async function getRoles(): Promise<Role[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('roles').select('*').order('sort_order');
  return (data as Role[]) ?? [];
}

export async function getSeniorities(): Promise<Seniority[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('seniorities').select('*').order('sort_order');
  return (data as Seniority[]) ?? [];
}

export async function getSettings(): Promise<Settings | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('*').is('team_id', null).maybeSingle();
  return (data as Settings) ?? null;
}
