import Papa from 'papaparse';
import { FIELD_DEFS, type CarritoField, type ColumnMapping } from './fields';

const PARSE_CONFIG: Papa.ParseConfig = {
  header: true,
  skipEmptyLines: 'greedy',
  dynamicTyping: false,
  transformHeader: (h: string) => h.replace(/^﻿/, '').trim(),
};

const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, ' ').trim();

/**
 * Guess a column mapping from CSV headers using the synonym table.
 *
 * A header is claimed by at most one field: exact synonym matches are resolved
 * first (across all fields), then fuzzy ones. Without that, "Story Points"
 * would happily swallow a "Carry Over Points" column via its 'points' synonym.
 */
export function autoMap(headers: string[]): ColumnMapping {
  const norm = headers.map((h) => ({ raw: h, n: normalize(h) }));
  const mapping: ColumnMapping = {};
  const claimed = new Set<string>();

  const claim = (field: CarritoField, raw: string | undefined) => {
    if (!raw || claimed.has(raw)) return false;
    mapping[field] = raw;
    claimed.add(raw);
    return true;
  };

  // Pass 1 — exact synonym match wins outright.
  for (const def of FIELD_DEFS) {
    if (mapping[def.field]) continue;
    const exact = norm.find(
      (h) => !claimed.has(h.raw) && def.synonyms.some((syn) => normalize(syn) === h.n),
    );
    claim(def.field, exact?.raw);
  }

  // Pass 2 — fall back to a substring match on anything still unclaimed.
  for (const def of FIELD_DEFS) {
    if (mapping[def.field]) continue;
    const partial = norm.find(
      (h) => !claimed.has(h.raw) && def.synonyms.some((syn) => h.n.includes(normalize(syn))),
    );
    if (!claim(def.field, partial?.raw)) mapping[def.field] = mapping[def.field] ?? null;
  }

  for (const def of FIELD_DEFS) {
    if (mapping[def.field] === undefined) mapping[def.field] = null;
  }
  return mapping;
}

/** "Doe, John <john@acme.com>" | "John Doe <j@acme.com>" | "John Doe" | "j@acme.com" */
export function parseAssignedTo(raw?: string): { name: string | null; email: string | null } {
  if (!raw || !raw.trim()) return { name: null, email: null };
  const v = raw.trim();
  // ADO exports "N/A" for unassigned work items.
  if (v.toUpperCase() === 'N/A') return { name: null, email: null };
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

/**
 * ADO tags record carry-over history as "carry-over 26.14; carry-over 26.15"
 * (and the older "Carry Over Last Sprint (COLS)"). Detecting it means a story
 * that spilled is flagged on import instead of being spotted by eye.
 */
const CARRY_TAG = /^(carry[\s-]?over(\s+last\s+sprint)?|cols)\b/i;

export function carryOverTags(tags: string[]): string[] {
  return tags.filter((t) => CARRY_TAG.test(t.trim()));
}

export function hasCarryOverTag(tags: string[]): boolean {
  return carryOverTags(tags).length > 0;
}

/** ADO date columns are locale-formatted; keep the ISO string or null. */
export function parseDate(raw?: string): string | null {
  if (!raw || !raw.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface StoryImportRow {
  work_item_id: number;
  work_item_type: string | null;
  title: string;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
  developer_name: string | null;
  developer_email: string | null;
  state: string | null;
  story_points: number | null;
  carry_over_points: number | null;
  iteration_path: string | null;
  sprint: string | null;
  area_path: string | null;
  tags: string[];
  priority: number | null;
  parent_id: number | null;
  created_date: string | null;
  closed_date: string | null;
  changed_date: string | null;
  /** True when the ADO tags say this item already spilled from an earlier sprint. */
  carry_over_tagged: boolean;
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
    const assigned = parseAssignedTo(get(r, 'assigned_to'));
    const developer = parseAssignedTo(get(r, 'developer'));
    const iteration = get(r, 'iteration_path') || null;
    const priRaw = get(r, 'priority');
    const parentRaw = get(r, 'parent_id');
    const tags = parseTags(get(r, 'tags'));

    rows.push({
      work_item_id: id,
      work_item_type: get(r, 'work_item_type') || null,
      title,
      assigned_to_name: assigned.name,
      assigned_to_email: assigned.email,
      developer_name: developer.name,
      developer_email: developer.email,
      state: get(r, 'state') || null,
      story_points: parseStoryPoints(get(r, 'story_points')),
      carry_over_points: parseStoryPoints(get(r, 'carry_over_points')),
      iteration_path: iteration,
      sprint: sprintFromIteration(iteration ?? undefined),
      area_path: get(r, 'area_path') || null,
      tags,
      priority: priRaw && Number.isFinite(Number(priRaw)) ? Number(priRaw) : null,
      parent_id: parentRaw && Number.isInteger(Number(parentRaw)) ? Number(parentRaw) : null,
      created_date: parseDate(get(r, 'created_date')),
      closed_date: parseDate(get(r, 'closed_date')),
      changed_date: parseDate(get(r, 'changed_date')),
      carry_over_tagged: hasCarryOverTag(tags),
      raw: r,
    });
  });

  return { rows, errors, headers };
}
