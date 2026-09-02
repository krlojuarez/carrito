#!/usr/bin/env node
/**
 * One-shot importer for the hand-maintained "Scrum Metrics" workbook.
 *
 *   node scripts/import-workbook.mjs Scrum_Metrics.xlsx > backfill.sql
 *
 * Reads the workbook, prints SQL on stdout, and prints a PARITY REPORT on
 * stderr that diffs every Velocity cell it derived against the value the
 * workbook itself had cached. Review the report, review the SQL, then run it in
 * Supabase → SQL Editor.
 *
 * Why this exists: `velocity_avg_points` is the workbook's
 * `AVERAGE($F$27:F{n})` — a running mean anchored at your first sprint. Start
 * the app with an empty history and that series is permanently wrong and the
 * chart shows a single bar. This brings the history across so it isn't.
 *
 * It reads columns by HEADER NAME, never by position, because the tabs are not
 * uniform: one sprint tab carries two stacked header rows, and the planning tab
 * has the Commited and Scope Creep Amount columns the other way round.
 *
 * Nothing is written anywhere. The SQL is idempotent (every insert is
 * ON CONFLICT DO NOTHING) and safe to run twice.
 *
 * Requires the `exceljs` devDependency:  npm i -D exceljs
 */

import { createRequire } from 'node:module';
import { basename } from 'node:path';

const require = createRequire(import.meta.url);

let ExcelJS;
try {
  ExcelJS = require('exceljs');
} catch {
  console.error('This script needs exceljs:  npm install --save-dev exceljs');
  process.exit(1);
}

const TEAM_UUID = '11111111-1111-1111-1111-111111111111';

// Workbook "Location" spellings -> ISO 3166-1 alpha-2. The sheet contains at
// least one typo ("Colmbia"), which is exactly why this is a lookup table.
const COUNTRY = {
  india: 'IN',
  argentina: 'AR',
  colombia: 'CO',
  colmbia: 'CO',
  chile: 'CL',
  usa: 'US',
  'united states': 'US',
  'united states of america': 'US',
  mexico: 'MX',
  brazil: 'BR',
  peru: 'PE',
  uruguay: 'UY',
  spain: 'ES',
};

const q = (v) => {
  if (v === null || v === undefined || v === '') return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : null);
const uuidFor = (kind, name) => {
  // Deterministic UUIDv5-ish id so re-running produces the same rows.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const s = `${kind}:${name}`;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i) + 0x9e3779b9, 2654435761) >>> 0;
  }
  const hex = (n) => n.toString(16).padStart(8, '0');
  const a = hex(h1);
  const b = hex(h2);
  const c = hex((h1 ^ h2) >>> 0);
  const d = hex(Math.imul(h1, h2) >>> 0);
  return `${a}-${b.slice(0, 4)}-5${b.slice(5)}-8${c.slice(1, 4)}-${c.slice(4)}${d}`;
};

/** A cell holds either a literal or {formula, result}. We need to tell them apart. */
const cellValue = (cell) => {
  const v = cell?.value;
  if (v && typeof v === 'object' && 'result' in v) return v.result;
  if (v && typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('');
  return v;
};
/**
 * True only for a value a person typed in. Anything computed is not.
 * exceljs models a run of copied formulas as {sharedFormula, result} with no
 * `formula` key at all, so testing for `formula` alone reads a whole column of
 * copied formulas as hand-entered values.
 */
const isLiteral = (cell) => {
  const v = cell?.value;
  if (v === null || v === undefined) return false;
  if (v instanceof Date) return true;
  return typeof v !== 'object';
};

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const person = (raw) => {
  if (!raw || typeof raw !== 'string') return { name: null, email: null };
  const v = raw.trim();
  if (!v || v.toUpperCase() === 'N/A') return { name: null, email: null };
  const m = v.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() || null };
  return { name: v, email: null };
};

/**
 * Locate a header row by looking for the cells we know must be on it.
 * Scans a generous number of rows: the Capacity and Velocity sheets both start
 * their tables well down the page, below a block of spacing rows.
 */
function headerRow(ws, mustHave = ['ID', 'Title']) {
  for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) {
    const names = [];
    ws.getRow(r).eachCell((cell, col) => {
      const v = cellValue(cell);
      if (typeof v === 'string') names[col] = v.trim();
    });
    if (mustHave.every((h) => names.includes(h))) {
      // A second identical header directly below (Sprint 16) means data starts lower.
      const next = [];
      ws.getRow(r + 1).eachCell((cell, col) => {
        const v = cellValue(cell);
        if (typeof v === 'string') next[col] = v.trim();
      });
      if (mustHave.every((h) => next.includes(h))) return { row: r + 1, names: next };
      return { row: r, names };
    }
  }
  return null;
}

const colOf = (names, ...candidates) => {
  for (const c of candidates) {
    const i = names.findIndex((n) => n && n.toLowerCase() === c.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
};

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/import-workbook.mjs <Scrum_Metrics.xlsx> [team name]');
    process.exit(1);
  }
  const teamName = process.argv[3] || 'SF Platform';

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  const velocity = wb.getWorksheet('Velocity');
  const capacity = wb.getWorksheet('Capacity');
  const holidays = wb.getWorksheet('Holidays');
  if (!velocity || !capacity) {
    console.error('Could not find the Velocity and Capacity sheets. Is this the right workbook?');
    process.exit(1);
  }

  const out = [];
  const say = (s) => out.push(s);
  const warn = (s) => console.error(s);

  warn(`\nReading ${basename(file)}\n${'='.repeat(60)}`);

  // ---- Roster (Capacity sheet: Location / Developledger name / FTE) --------
  const capHeader = headerRow(capacity, ['Developer/Admin', 'Location']);
  if (!capHeader) {
    console.error('Could not find the Capacity header row (needs "Developer/Admin" and "Location").');
    process.exit(1);
  }
  const cName = colOf(capHeader.names, 'Developer/Admin');
  const cLoc = colOf(capHeader.names, 'Location');
  const cFte = colOf(capHeader.names, 'Capcity', 'Capacity');
  const cDays = colOf(capHeader.names, 'Working days');

  const members = [];
  for (let r = capHeader.row + 1; r <= capacity.rowCount; r++) {
    const name = cellValue(capacity.getRow(r).getCell(cName));
    if (!name || typeof name !== 'string' || !name.trim()) continue;
    const loc = cellValue(capacity.getRow(r).getCell(cLoc));
    const fte = num(cellValue(capacity.getRow(r).getCell(cFte))) ?? 1;
    members.push({
      row: r,
      name: name.trim(),
      country: COUNTRY[String(loc ?? '').trim().toLowerCase()] ?? null,
      fte,
      id: uuidFor('member', name.trim()),
      rawLoc: loc,
    });
  }
  warn(`roster: ${members.length} members`);
  for (const m of members) {
    if (!m.country) warn(`  ! no country mapping for "${m.rawLoc}" (${m.name}) — import as unknown`);
  }

  // ---- Sprints (Velocity sheet) -------------------------------------------
  const velHeader = headerRow(velocity, ['Sprint', 'Sprint Start Date']);
  if (!velHeader) {
    console.error('Could not find the Velocity header row.');
    process.exit(1);
  }
  const vName = colOf(velHeader.names, 'Sprint');
  const vStart = colOf(velHeader.names, 'Sprint Start Date');
  const vEnd = colOf(velHeader.names, 'Sprint End Date');
  const vCols = {
    Commitment: colOf(velHeader.names, 'Comittment', 'Commitment'),
    Unplanned: colOf(velHeader.names, 'Unplanned'),
    Done: colOf(velHeader.names, 'Done'),
    'Total Sprint SP': colOf(velHeader.names, 'Total Sprint SP'),
    'Carry Over SP': colOf(velHeader.names, 'Carry Over SP'),
    'Capacity SP': colOf(velHeader.names, 'Capacity SP'),
  };

  const sprints = [];
  for (let r = velHeader.row + 1; r <= velocity.rowCount; r++) {
    const row = velocity.getRow(r);
    const name = cellValue(row.getCell(vName));
    const start = cellValue(row.getCell(vStart));
    const end = cellValue(row.getCell(vEnd));
    if (!name || !(start instanceof Date) || !(end instanceof Date)) continue;
    const expected = {};
    for (const [k, c] of Object.entries(vCols)) {
      expected[k] = c > 0 ? num(cellValue(row.getCell(c))) : null;
    }
    sprints.push({
      name: String(name).trim(),
      start: iso(start),
      end: iso(end),
      id: uuidFor('sprint', String(name).trim()),
      expected,
    });
  }
  warn(`sprints: ${sprints.map((s) => s.name).join(', ')}`);

  // Match each sprint to its tab by name prefix; skip hidden scratch tabs,
  // which stack two exports and would collide on (work item, sprint).
  for (const s of sprints) {
    s.sheet = wb.worksheets.find(
      (w) => w.state !== 'hidden' && w.name !== 'Velocity' && w.name.trim().startsWith(s.name),
    );
    if (!s.sheet) warn(`  ! no visible tab found for ${s.name} — its stories will not be imported`);
    else if (s.sheet.name !== s.name) warn(`  ${s.name} -> tab "${s.sheet.name}"`);
  }

  // ---- Emit -----------------------------------------------------------------
  say('-- Backfill generated by scripts/import-workbook.mjs');
  say(`-- Source: ${basename(file)}`);
  say('-- Review the parity report printed alongside this file before running it.');
  say('-- Idempotent: every insert is ON CONFLICT DO NOTHING.');
  say('begin;');
  say('');
  say(`insert into public.teams (id, name) values (${q(TEAM_UUID)}::uuid, ${q(teamName)})`);
  say('  on conflict (name) do nothing;');
  say('');

  say('-- Roster (Capacity sheet: Developer/Admin, Location, FTE)');
  for (const m of members) {
    say(
      `insert into public.members (id, team_id, full_name, country_code, capacity_factor, is_active) values (` +
        `${q(m.id)}::uuid, ${q(TEAM_UUID)}::uuid, ${q(m.name)}, ${q(m.country)}, ${m.fte}, true) ` +
        `on conflict (id) do nothing;`,
    );
  }
  say('');

  // ---- Holidays -------------------------------------------------------------
  let holidayCount = 0;
  if (holidays) {
    const hHeader = headerRow(holidays, ['Date', 'Holiday']);
    if (hHeader) {
      const hDate = colOf(hHeader.names, 'Date');
      const hName = colOf(hHeader.names, 'Holiday');
      const hId = colOf(hHeader.names, 'ID');
      const hCountry = colOf(hHeader.names, 'Country');
      say('-- Holidays sheet. A row with no country code is company-wide.');
      for (let r = hHeader.row + 1; r <= holidays.rowCount; r++) {
        const row = holidays.getRow(r);
        const d = cellValue(row.getCell(hDate));
        if (!(d instanceof Date)) continue;
        const code = hId > 0 ? cellValue(row.getCell(hId)) : null;
        const name = hName > 0 ? cellValue(row.getCell(hName)) : null;
        const country = hCountry > 0 ? cellValue(row.getCell(hCountry)) : null;
        say(
          `insert into public.holidays (country_code, holiday_date, name, is_manual, source) values (` +
            `${q(code ? String(code).trim().toUpperCase() : null)}, ${q(iso(d))}, ` +
            `${q(String(name ?? country ?? 'Holiday').trim())}, false, 'workbook') on conflict do nothing;`,
        );
        holidayCount++;
      }
    }
  }
  warn(`holidays: ${holidayCount} rows`);
  say('');

  // ---- Sprints + stories ----------------------------------------------------
  const parity = [];
  for (const s of sprints) {
    say(`-- ${s.name}  (${s.start} -> ${s.end})`);
    say(
      `insert into public.sprints (id, team_id, name, start_date, end_date) values (` +
        `${q(s.id)}::uuid, ${q(TEAM_UUID)}::uuid, ${q(s.name)}, ${q(s.start)}, ${q(s.end)}) ` +
        `on conflict (id) do nothing;`,
    );
    if (!s.sheet) {
      say('');
      continue;
    }

    const h = headerRow(s.sheet, ['ID', 'Title']);
    if (!h) {
      warn(`  ! ${s.sheet.name}: no ID/Title header row found; skipping its stories`);
      say('');
      continue;
    }
    const c = {
      id: colOf(h.names, 'ID'),
      type: colOf(h.names, 'Work Item Type'),
      title: colOf(h.names, 'Title'),
      dev: colOf(h.names, 'Developer'),
      assignee: colOf(h.names, 'Assigned To'),
      state: colOf(h.names, 'State'),
      tags: colOf(h.names, 'Tags'),
      created: colOf(h.names, 'Created Date'),
      points: colOf(h.names, 'Story Points (Estimated)', 'Story Points'),
      carry: colOf(h.names, 'Carry Over'),
      committed: colOf(h.names, 'Commited', 'Committed'),
    };

    const derived = { Commitment: 0, Unplanned: 0, Done: 0, 'Total Sprint SP': 0, 'Carry Over SP': 0 };
    const seen = new Set();
    let overrides = 0;
    let rows = 0;

    for (let r = h.row + 1; r <= s.sheet.rowCount; r++) {
      const row = s.sheet.getRow(r);
      const wid = num(cellValue(row.getCell(c.id)));
      if (!wid || seen.has(wid)) continue;
      seen.add(wid);

      const title = cellValue(row.getCell(c.title));
      if (!title) continue;
      const points = c.points > 0 ? num(cellValue(row.getCell(c.points))) : null;
      const carry = c.carry > 0 ? num(cellValue(row.getCell(c.carry))) ?? 0 : 0;
      const created = c.created > 0 ? cellValue(row.getCell(c.created)) : null;
      const state = c.state > 0 ? cellValue(row.getCell(c.state)) : null;
      const dev = person(c.dev > 0 ? cellValue(row.getCell(c.dev)) : null);
      const asg = person(c.assignee > 0 ? cellValue(row.getCell(c.assignee)) : null);
      const tagsRaw = c.tags > 0 ? cellValue(row.getCell(c.tags)) : null;
      const tags = String(tagsRaw ?? '')
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean);

      // A literal in the Commited column is a human overriding the scope-creep
      // rule. A formula there is the rule itself and carries no information.
      let override = null;
      if (c.committed > 0 && isLiteral(row.getCell(c.committed))) {
        override = num(cellValue(row.getCell(c.committed)));
        if (override !== null) overrides++;
      }

      const devMember = members.find((m) => dev.name && m.name === dev.name);
      const asgMember = members.find((m) => asg.name && m.name === asg.name);

      const scopeCreep = created instanceof Date && created > new Date(`${s.start}T00:00:00Z`);
      derived['Total Sprint SP'] += points ?? 0;
      derived['Carry Over SP'] += carry;
      if (override !== null) derived.Commitment += override;
      else if (scopeCreep) derived.Unplanned += points ?? 0;
      else derived.Commitment += points ?? 0;
      if (override === null && scopeCreep) {
        /* counted above */
      }
      if (carry === 0) derived.Done += points ?? 0;

      say(
        'insert into public.user_stories (team_id, sprint_id, ado_work_item_id, title, work_item_type, ' +
          'state_raw, story_points, created_date, carry_over_points, committed_points, tags, ' +
          'developer_raw, developer_email, developer_member_id, assignee_raw, assignee_email, assignee_member_id) values (' +
          `${q(TEAM_UUID)}::uuid, ${q(s.id)}::uuid, ${wid}, ${q(String(title).trim())}, ` +
          `${q(c.type > 0 ? cellValue(row.getCell(c.type)) : null)}, ${q(state)}, ${q(points)}, ` +
          `${q(created instanceof Date ? created : null)}, ${carry}, ${override === null ? 'null' : override}, ` +
          `${q(`{${tags.map((t) => `"${t.replace(/"/g, '')}"`).join(',')}}`)}, ` +
          `${q(c.dev > 0 ? cellValue(row.getCell(c.dev)) : null)}, ${q(dev.email)}, ` +
          `${devMember ? `${q(devMember.id)}::uuid` : 'null'}, ` +
          `${q(c.assignee > 0 ? cellValue(row.getCell(c.assignee)) : null)}, ${q(asg.email)}, ` +
          `${asgMember ? `${q(asgMember.id)}::uuid` : 'null'}) ` +
          'on conflict (ado_work_item_id, sprint_id) do nothing;',
      );
      rows++;
    }
    derived['Capacity SP'] = derived['Total Sprint SP'] - derived['Carry Over SP'];
    parity.push({ sprint: s.name, tab: s.sheet.name, rows, overrides, derived, expected: s.expected });
    say('');
  }

  // ---- PTO ------------------------------------------------------------------
  // The Capacity sheet records a COUNT of PTO days per member per sprint, never
  // the dates. Emitting invented dates as fact would be a lie, so they go out
  // commented, with the count stated, for someone to place.
  say('-- PTO: the workbook records only a COUNT of days per member per sprint,');
  say('-- never which days. These are left commented out deliberately — fill in');
  say('-- the real dates, or accept that historical Workday % will read high.');
  let ptoTotal = 0;
  for (const s of sprints) {
    const block = capHeader.names
      .map((n, i) => ({ n, i }))
      .filter((x) => x.n === 'PTO');
    // Sprint blocks appear left-to-right in sprint order.
    const idx = sprints.indexOf(s);
    const ptoCol = block[idx]?.i;
    if (!ptoCol) continue;
    for (const m of members) {
      const days = num(cellValue(capacity.getRow(m.row).getCell(ptoCol)));
      if (!days) continue;
      ptoTotal += days;
      say(
        `-- ${s.name}: ${m.name} took ${days} day(s) of PTO. Example:` +
          ` insert into public.pto (member_id, start_date, end_date, day_fraction, note) values (` +
          `${q(m.id)}::uuid, '${s.start}', '${s.start}', 1.0, 'reconstructed from workbook — set real dates');`,
      );
    }
  }
  warn(`pto: ${ptoTotal} member-days found, all emitted commented out`);
  say('');
  say('commit;');

  // ---- Parity report --------------------------------------------------------
  warn(`\nPARITY REPORT — derived from the story rows vs the workbook's own cached values`);
  warn('='.repeat(78));
  let mismatches = 0;
  for (const p of parity) {
    warn(`\n${p.sprint}  (tab "${p.tab}", ${p.rows} work items${p.overrides ? `, ${p.overrides} commitment override(s)` : ''})`);
    for (const key of Object.keys(p.derived)) {
      const got = Math.round(p.derived[key] * 100) / 100;
      const want = p.expected[key];
      if (want === null || want === undefined) {
        warn(`    ${key.padEnd(16)} ${String(got).padStart(8)}   (sheet had no value)`);
        continue;
      }
      const ok = Math.abs(got - want) < 0.005;
      if (!ok) mismatches++;
      warn(`    ${key.padEnd(16)} ${String(got).padStart(8)}   sheet ${String(want).padStart(8)}   ${ok ? 'match' : '*** DIFFERS ***'}`);
    }
  }
  warn('\n' + '='.repeat(78));
  warn(
    mismatches === 0
      ? 'Every derived value matches the workbook. Safe to run the SQL.'
      : `${mismatches} value(s) differ. Read the rows above before running the SQL —\n` +
          'a difference usually means a hand-typed cell in the sheet, not an import bug.',
  );
  if (ptoTotal > 0) {
    warn(
      `\nOne column will NOT match until you act: Workday %. The workbook records\n` +
        `only a count of PTO days (${ptoTotal} member-days across these sprints), never the\n` +
        `dates, so this import cannot place them. Until you fill in the commented\n` +
        `PTO statements above, historical Workday % reads HIGH by those days.\n` +
        `Everything derived from the work items themselves is exact.`,
    );
  }
  warn('');

  process.stdout.write(out.join('\n') + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
