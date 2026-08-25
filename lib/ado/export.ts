import Papa from 'papaparse';
import type { UserStory } from '@/lib/types/domain';

export type ExportMode = 'ado' | 'enriched';

interface Col {
  header: string;
  get: (s: UserStory) => string;
}

const ADO_HEADERS: Col[] = [
  { header: 'ID', get: (s) => String(s.ado_work_item_id) },
  { header: 'Work Item Type', get: (s) => s.work_item_type ?? '' },
  { header: 'Title', get: (s) => s.title },
  {
    header: 'Assigned To',
    get: (s) =>
      s.assignee_raw ??
      (s.assignee_email ? s.assignee_email : ''),
  },
  { header: 'State', get: (s) => s.state_raw ?? '' },
  { header: 'Story Points', get: (s) => (s.story_points != null ? String(s.story_points) : '') },
  { header: 'Iteration Path', get: (s) => s.ado_iteration_path ?? '' },
  { header: 'Tags', get: (s) => (s.tags ?? []).join('; ') },
  { header: 'Priority', get: (s) => (s.priority != null ? String(s.priority) : '') },
];

const ENRICHED_EXTRA: Col[] = [
  { header: 'Assigned Email', get: (s) => s.assignee_email ?? '' },
  { header: 'Is Carry Over', get: (s) => (s.is_carry_over ? 'Yes' : 'No') },
];

export function toCsv(records: UserStory[], mode: ExportMode): string {
  const cols = mode === 'enriched' ? [...ADO_HEADERS, ...ENRICHED_EXTRA] : ADO_HEADERS;
  const rows = records.map((s) => {
    const o: Record<string, string> = {};
    for (const c of cols) o[c.header] = c.get(s);
    return o;
  });
  return Papa.unparse(rows, {
    columns: cols.map((c) => c.header),
    quotes: true,
    newline: '\r\n',
  });
}

/** Browser download with a UTF-8 BOM so Excel renders accents correctly. */
export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function errorsToCsv(errors: { rowIndex: number; message: string; raw: Record<string, string> }[]): string {
  const rows = errors.map((e) => ({ ...e.raw, _row: e.rowIndex + 1, _error: e.message }));
  return Papa.unparse(rows, { quotes: true, newline: '\r\n' });
}
