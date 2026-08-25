import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoryImportRow } from './parse';

export interface UpsertArgs {
  teamId: string;
  sprintId: string;
  batchId: string | null;
  rows: StoryImportRow[];
  /** email (lowercased) -> member id, for soft-linking assignees. */
  memberByEmail?: Map<string, string>;
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

export interface UpsertResult {
  total: number;
  chunks: number;
}

export async function upsertStories(supabase: SupabaseClient, args: UpsertArgs): Promise<UpsertResult> {
  const { teamId, sprintId, batchId, rows, memberByEmail } = args;
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
    assignee_raw: r.assigned_to_name && r.assigned_to_email
      ? `${r.assigned_to_name} <${r.assigned_to_email}>`
      : r.assigned_to_name ?? r.assigned_to_email ?? null,
    assignee_email: r.assigned_to_email,
    assignee_member_id: r.assigned_to_email ? memberByEmail?.get(r.assigned_to_email) ?? null : null,
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
