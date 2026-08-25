import Papa from 'papaparse';
import { FIELD_DEFS, type CarritoField, type ColumnMapping } from './fields';

const PARSE_CONFIG: Papa.ParseConfig = {
  header: true,
  skipEmptyLines: 'greedy',
  dynamicTyping: false,
  transformHeader: (h: string) => h.replace(/^﻿/, '').trim(),
};

const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, ' ').trim();

/** Guess a column mapping from CSV headers using the synonym table. */
export function autoMap(headers: string[]): ColumnMapping {
  const norm = headers.map((h) => ({ raw: h, n: normalize(h) }));
  const mapping: ColumnMapping = {};
  for (const def of FIELD_DEFS) {
    const exact = norm.find((h) => def.synonyms.some((syn) => normalize(syn) === h.n));
    const partial = norm.find((h) => def.synonyms.some((syn) => h.n.includes(normalize(syn))));
    mapping[def.field] = (exact ?? partial)?.raw ?? null;
  }
  return mapping;
}

/** "Doe, John <john@acme.com>" | "John Doe <j@acme.com>" | "John Doe" | "j@acme.com" */
export function parseAssignedTo(raw?: string): { name: string | null; email: string | null } {
  if (!raw || !raw.trim()) return { name: null, email: null };
  const v = raw.trim();
  const m = v.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) {
    const email = m[2].includes('@') ? m[2].trim().toLowerCase() : null;
    return { name: m[1].trim() || null, email };
  }
  if (v.includes('@') && !/\s/.test(v)) return { name: null, email: v.toLowerCase() };
  return { name: v, email: null };
}

export function parseStoryPoints(raw?: string): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function sprintFromIteration(iterationPath?: string): string | null {
  if (!iterationPath || !iterationPath.trim()) return null;
  const parts = iterationPath.split(/[\\/]/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

export function parseTags(raw?: string): string[] {
  if (!raw) return [];
  return raw.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
}

export interface StoryImportRow {
  work_item_id: number;
  work_item_type: string | null;
  title: string;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
  state: string | null;
  story_points: number | null;
  iteration_path: string | null;
  sprint: string | null;
  area_path: string | null;
  tags: string[];
  priority: number | null;
  parent_id: number | null;
  changed_date: string | null;
  raw: Record<string, string>;
}

export interface RowError {
  rowIndex: number;
  field?: CarritoField;
  message: string;
  raw: Record<string, string>;
}

export interface ImportParseResult {
  rows: StoryImportRow[];
  errors: RowError[];
  headers: string[];
}

export function parseCsv(
  file: File | string,
): Promise<{ data: Record<string, string>[]; headers: string[] }> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file as never, {
      ...PARSE_CONFIG,
      complete: (res: Papa.ParseResult<Record<string, string>>) =>
        resolve({ data: res.data, headers: res.meta.fields ?? [] }),
      error: (err: unknown) => reject(err),
    });
  });
}

export function transformRows(
  data: Record<string, string>[],
  mapping: ColumnMapping,
  headers: string[],
): ImportParseResult {
  const rows: StoryImportRow[] = [];
  const errors: RowError[] = [];
  const get = (r: Record<string, string>, f: CarritoField) => {
    const col = mapping[f];
    return col ? (r[col] ?? '').trim() : '';
  };

  data.forEach((r, i) => {
    const idRaw = get(r, 'work_item_id');
    const id = Number(idRaw);
    if (!idRaw || !Number.isInteger(id) || id <= 0) {
      errors.push({ rowIndex: i, field: 'work_item_id', message: `Invalid or missing Work Item ID: "${idRaw}"`, raw: r });
      return;
    }
    const title = get(r, 'title');
    if (!title) {
      errors.push({ rowIndex: i, field: 'title', message: 'Missing Title', raw: r });
      return;
    }
    const { name, email } = parseAssignedTo(get(r, 'assigned_to'));
    const iteration = get(r, 'iteration_path') || null;
    const priRaw = get(r, 'priority');
    const parentRaw = get(r, 'parent_id');
    const changed = get(r, 'changed_date');

    let changedIso: string | null = null;
    if (changed) {
      const d = new Date(changed);
      changedIso = Number.isNaN(d.getTime()) ? null : d.toISOString();
    }

    rows.push({
      work_item_id: id,
      work_item_type: get(r, 'work_item_type') || null,
      title,
      assigned_to_name: name,
      assigned_to_email: email,
      state: get(r, 'state') || null,
      story_points: parseStoryPoints(get(r, 'story_points')),
      iteration_path: iteration,
      sprint: sprintFromIteration(iteration ?? undefined),
      area_path: get(r, 'area_path') || null,
      tags: parseTags(get(r, 'tags')),
      priority: priRaw && Number.isFinite(Number(priRaw)) ? Number(priRaw) : null,
      parent_id: parentRaw && Number.isInteger(Number(parentRaw)) ? Number(parentRaw) : null,
      changed_date: changedIso,
      raw: r,
    });
  });

  return { rows, errors, headers };
}
