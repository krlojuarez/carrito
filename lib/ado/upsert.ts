import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoryImportRow } from './parse';

const norm = (s: string) => s.trim().toLowerCase();

export interface MemberLookup {
  byEmail: Map<string, string>;
  byName: Map<string, string>;
}

interface PersonRef {
  name: string | null;
  email: string | null;
}

/** Resolve a person to a member id: email first, then normalized name. */
function resolvePersonId(p: PersonRef, lk: MemberLookup): string | null {
  if (p.email) {
    const id = lk.byEmail.get(norm(p.email));
    if (id) return id;
  }
  if (p.name) {
    const id = lk.byName.get(norm(p.name));
    if (id) return id;
  }
  return null;
}

const assigneeOf = (r: StoryImportRow): PersonRef => ({
  name: r.assigned_to_name,
  email: r.assigned_to_email,
});

const developerOf = (r: StoryImportRow): PersonRef => ({
  name: r.developer_name,
  email: r.developer_email,
});

export interface AssigneeResolution extends MemberLookup {
  createdCount: number;
  createdNames: string[];
}

/**
 * Build email/name -> member-id lookups from existing members, and (when
 * autoCreate) create members for any ADO person not yet on the team.
 *
 * Both the Developer and the Assigned To column are considered: a story
 * assigned to a tester is still a developer's capacity, and per-member metrics
 * are keyed on the developer.
 * Auto-created members have no country (admin can set it later).
 */
export async function resolveAndCreateAssignees(
  supabase: SupabaseClient,
  args: {
    teamId: string;
    rows: Pick<
      StoryImportRow,
      'assigned_to_email' | 'assigned_to_name' | 'developer_email' | 'developer_name'
    >[];
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

  // Distinct people (developer and assignee) that don't resolve to a member.
  const toCreate = new Map<string, { full_name: string; email: string | null }>();
  const consider = (name: string | null, email: string | null) => {
    const e = email ? norm(email) : null;
    const n = name ? name.trim() : null;
    if (!e && !n) return; // unassigned
    if (e && byEmail.has(e)) return;
    if (!e && n && byName.has(norm(n))) return;
    const key = e ?? norm(n!);
    if (toCreate.has(key)) return;
    toCreate.set(key, {
      full_name: n ?? (e ? e.split('@')[0] : 'Unknown'),
      email: email ?? null,
    });
  };

  for (const r of args.rows) {
    consider(r.developer_name, r.developer_email);
    consider(r.assigned_to_name, r.assigned_to_email);
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
  /** email (lowercased) / normalized name -> member id, for linking people. */
  lookup?: MemberLookup;
  /**
   * Whether the CSV actually carried a carry-over column. When it didn't, the
   * column is left out of the payload entirely so a re-import cannot wipe
   * carry-over values a human curated or `close_sprint()` derived.
   */
  includeCarryOver?: boolean;
}

export interface UpsertResult {
  total: number;
  chunks: number;
}

export async function upsertStories(supabase: SupabaseClient, args: UpsertArgs): Promise<UpsertResult> {
  const { teamId, sprintId, batchId, rows, lookup, includeCarryOver } = args;
  const empty: MemberLookup = { byEmail: new Map(), byName: new Map() };
  const lk = lookup ?? empty;

  const rawOf = (p: PersonRef) =>
    p.name && p.email ? `${p.name} <${p.email}>` : p.name ?? p.email ?? null;

  const payload = rows.map((r) => {
    const assignee = assigneeOf(r);
    const developer = developerOf(r);
    const base = {
      team_id: teamId,
      sprint_id: sprintId,
      ado_work_item_id: r.work_item_id,
      ado_iteration_path: r.iteration_path,
      title: r.title,
      work_item_type: r.work_item_type,
      state_raw: r.state,
      story_points: r.story_points,
      priority: r.priority,
      assignee_raw: rawOf(assignee),
      assignee_email: r.assigned_to_email,
      assignee_member_id: resolvePersonId(assignee, lk),
      developer_raw: rawOf(developer),
      developer_email: r.developer_email,
      // Fall back to the assignee so per-member metrics still resolve when the
      // export has no Developer column at all.
      developer_member_id: resolvePersonId(developer, lk) ?? resolvePersonId(assignee, lk),
      created_date: r.created_date,
      closed_date: r.closed_date,
      tags: r.tags,
      raw: r.raw,
      import_batch_id: batchId,
      // is_carry_over intentionally NOT set here -> the DB trigger computes it
      // on insert, and a human's manual toggle survives re-imports.
    };
    return includeCarryOver ? { ...base, carry_over_points: r.carry_over_points ?? 0 } : base;
  });

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
