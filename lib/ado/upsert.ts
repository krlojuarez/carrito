import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoryImportRow } from './parse';

const norm = (s: string) => s.trim().toLowerCase();

export interface MemberLookup {
  byEmail: Map<string, string>;
  byName: Map<string, string>;
}

/** Resolve a story's assignee to a member id: email first, then normalized name. */
function resolveAssigneeId(
  r: Pick<StoryImportRow, 'assigned_to_email' | 'assigned_to_name'>,
  lk: MemberLookup,
): string | null {
  if (r.assigned_to_email) {
    const id = lk.byEmail.get(norm(r.assigned_to_email));
    if (id) return id;
  }
  if (r.assigned_to_name) {
    const id = lk.byName.get(norm(r.assigned_to_name));
    if (id) return id;
  }
  return null;
}

export interface AssigneeResolution extends MemberLookup {
  createdCount: number;
  createdNames: string[];
}

/**
 * Build email/name -> member-id lookups from existing members, and (when
 * autoCreate) create members for any ADO assignee not yet on the team.
 * Auto-created members have no country (admin can set it later).
 */
export async function resolveAndCreateAssignees(
  supabase: SupabaseClient,
  args: {
    teamId: string;
    rows: Pick<StoryImportRow, 'assigned_to_email' | 'assigned_to_name'>[];
    existing: { id: string; email: string | null; full_name: string }[];
    autoCreate: boolean;
  },
): Promise<AssigneeResolution> {
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const m of args.existing) {
    if (m.email) byEmail.set(norm(m.email), m.id);
    if (m.full_name) byName.set(norm(m.full_name), m.id);
  }

  if (!args.autoCreate) {
    return { byEmail, byName, createdCount: 0, createdNames: [] };
  }

  // Distinct assignees that don't resolve to an existing member.
  const toCreate = new Map<string, { full_name: string; email: string | null }>();
  for (const r of args.rows) {
    const email = r.assigned_to_email ? norm(r.assigned_to_email) : null;
    const name = r.assigned_to_name ? r.assigned_to_name.trim() : null;
    if (!email && !name) continue; // unassigned
    if (email && byEmail.has(email)) continue;
    if (!email && name && byName.has(norm(name))) continue;
    const key = email ?? norm(name!);
    if (toCreate.has(key)) continue;
    const displayName = name ?? (email ? email.split('@')[0] : 'Unknown');
    toCreate.set(key, { full_name: displayName, email: r.assigned_to_email ?? null });
  }

  if (toCreate.size === 0) {
    return { byEmail, byName, createdCount: 0, createdNames: [] };
  }

  const payload = [...toCreate.values()].map((m) => ({
    team_id: args.teamId,
    full_name: m.full_name,
    email: m.email,
    country_code: null,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from('members')
    .insert(payload)
    .select('id, email, full_name');
  if (error) throw new Error(`Could not auto-create members: ${error.message}`);

  const created = (data as { id: string; email: string | null; full_name: string }[]) ?? [];
  for (const m of created) {
    if (m.email) byEmail.set(norm(m.email), m.id);
    if (m.full_name) byName.set(norm(m.full_name), m.id);
  }
  return {
    byEmail,
    byName,
    createdCount: created.length,
    createdNames: created.map((m) => m.full_name),
  };
}

export async function createImportBatch(
  supabase: SupabaseClient,
  args: { teamId: string; sprintId: string; filename: string; rowCount: number; headers: string[] },
): Promise<string | null> {
  const { data, error } = await supabase
    .from('import_batches')
    .insert({
      team_id: args.teamId,
      sprint_id: args.sprintId,
      source_filename: args.filename,
      row_count: args.rowCount,
      raw_headers: args.headers,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Could not create import batch: ${error.message}`);
  return (data as { id: string })?.id ?? null;
}

export interface UpsertArgs {
  teamId: string;
  sprintId: string;
  batchId: string | null;
  rows: StoryImportRow[];
  /** email (lowercased) / normalized name -> member id, for linking assignees. */
  lookup?: MemberLookup;
}

export interface UpsertResult {
  total: number;
  chunks: number;
}

export async function upsertStories(supabase: SupabaseClient, args: UpsertArgs): Promise<UpsertResult> {
  const { teamId, sprintId, batchId, rows, lookup } = args;
  const empty: MemberLookup = { byEmail: new Map(), byName: new Map() };
  const lk = lookup ?? empty;

  const payload = rows.map((r) => ({
    team_id: teamId,
    sprint_id: sprintId,
    ado_work_item_id: r.work_item_id,
    ado_iteration_path: r.iteration_path,
    title: r.title,
    work_item_type: r.work_item_type,
    state_raw: r.state,
    story_points: r.story_points,
    priority: r.priority,
    assignee_raw:
      r.assigned_to_name && r.assigned_to_email
        ? `${r.assigned_to_name} <${r.assigned_to_email}>`
        : r.assigned_to_name ?? r.assigned_to_email ?? null,
    assignee_email: r.assigned_to_email,
    assignee_member_id: resolveAssigneeId(r, lk),
    tags: r.tags,
    raw: r.raw,
    import_batch_id: batchId,
    // is_carry_over intentionally NOT set here -> the DB trigger computes it on insert.
  }));

  const CHUNK = 500;
  let chunks = 0;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error } = await supabase
      .from('user_stories')
      .upsert(payload.slice(i, i + CHUNK), {
        onConflict: 'ado_work_item_id,sprint_id',
        ignoreDuplicates: false,
      });
    if (error) throw new Error(`Upsert chunk ${chunks}: ${error.message}`);
    chunks += 1;
  }
  return { total: payload.length, chunks };
}
