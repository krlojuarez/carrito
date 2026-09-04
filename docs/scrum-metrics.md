# Scrum Metrics — replacing the spreadsheet

This document maps every number in the hand-maintained **Scrum Metrics** workbook
(sheets: `Velocity`, `Capacity`, `Holidays`, one tab per sprint, two charts) onto
SQL you can run, and explains what is now automated.

Everything here is created by [`supabase/migrations/0003_scrum_metrics.sql`](../supabase/migrations/0003_scrum_metrics.sql)
and verified by [`supabase/tests/scrum_metrics_test.sql`](../supabase/tests/scrum_metrics_test.sql).

---

## 1. Where each workbook cell now lives

| Workbook | Meaning (the author's own comment, where there was one) | Now |
|---|---|---|
| `Velocity!D` Comittment | "sum of SP that were committed to the sprint" | `v_sprint_velocity.committed_points` |
| `Velocity!E` Unplanned | "SP added to the ongoing sprint (Production Support)" | `.unplanned_points` |
| `Velocity!F` Done | "SP from fully done tickets according the DoD" | `.done_points` (sheet rule) · `.delivered_points` (actual DoD) |
| `Velocity!G` Done Percentage | Done ÷ Commitment | `.done_pct` |
| `Velocity!H` Velocity AVG | "Average speed considering Done SP per sprint" | `.velocity_avg_points` (running mean) |
| `Velocity!I` Total Sprint SP | "committed and adhered (Scope Creep)" | `.total_points` |
| `Velocity!J` Carry Over SP | "SP that spill into the following sprint" | `.carry_over_points` |
| `Velocity!K` Carry Over % | Carry-over ÷ Commitment | `.carry_over_pct` |
| `Velocity!L` Capacity SP | Total − Carry-over | `.capacity_points` |
| `Velocity!M` Workday % | "Percentage of the workdays that were not Holidays or PTOs" | `.workday_pct` — net ÷ **nominal** days, so days lost to someone joining or leaving mid-sprint are visible rather than cancelling out of both sides |
| `Velocity!N` User Stories Done | "How many Stories where done in the sprint" — never filled in | `.stories_done` (filled in automatically) |
| `Capacity!A` Working days | Working weekdays in the sprint | `v_member_sprint_capacity.gross_days` |
| `Capacity!B` Capcity | FTE factor (1 or 0.5) | `members.capacity_factor` |
| `Capacity!C` Location | Country | `members.country_code` |
| `Capacity!G/L/Q/W` Holidays | Public holidays that hit a working day | `.holiday_days` |
| `Capacity!H/M/R/X` PTO | Booked time off | `.pto_days` |
| `Capacity!I/N/S/Y` Working Days | `A − PTO − Holidays` | `.net_days` |
| `Capacity!J/O/U/AB` Completed | SP delivered by that member | `.completed_points` |
| `Capacity!T/AA` Committed | SP committed to that member | `.committed_points` |
| `Capacity!K/P/V/AC` AVG SP | Completed ÷ Working Days | `.points_per_day` |
| `Capacity!E` Capacity per day | Average of the per-sprint AVG SP | `v_member_capacity_profile.avg_points_per_day` |
| `Capacity!F` Capacity per sprint | `E × A` | `.capacity_points_per_sprint` |
| Sprint tab `M` Scope Creep Validation | `IF(SprintStart < CreatedDate,…)` | `v_story_metrics.is_scope_creep` |
| Sprint tab `N` Commited | `IF(ScopeCreep="False", SP, "")` | `v_story_metrics.committed_points` |
| Sprint tab `O` Scope Creep Amount | `IF(ScopeCreep="True", SP, "")` | `v_story_metrics.unplanned_points` |
| Sprint tab `P` Done | `IF(CarryOver>0, "", SP)` | `v_story_metrics.done_points` |
| `Holidays` sheet | Country holiday table + "Impacts Work Calendar" | `public.holidays`, synced from `date-holidays` |
| Chart 1 "SF Platform Metrics" | Bars + velocity/capacity lines | `/metrics` page, one Story Points axis |
| Chart 2 "AVG Capacity per day" | Bar per developer | `/metrics` page |
| Hidden `Sprint 17 Comit` tab | Frozen commitment snapshot | `snapshot_sprint_commitment()` + `sprints.committed_snapshot_at` |

---

## 2. The queries

These run against the views the migration creates. Paste them into Supabase → SQL Editor.

### 2.1 The Velocity sheet, one row per sprint

```sql
select
  sprint_name                            as "Sprint",
  start_date                             as "Sprint Start Date",
  end_date                               as "Sprint End Date",
  committed_points                       as "Comittment",
  unplanned_points                       as "Unplanned",
  done_points                            as "Done",
  round(done_pct * 100, 1)               as "Done %",
  velocity_avg_points                    as "Velocity AVG",
  total_points                           as "Total Sprint SP",
  carry_over_points                      as "Carry Over SP",
  round(carry_over_pct * 100, 1)         as "Carry Over %",
  capacity_points                        as "Capacity SP",
  round(workday_pct * 100, 1)            as "Workday %",
  stories_done                           as "User Stories Done"
from public.v_sprint_velocity
where team_id = '<your-team-uuid>'
order by start_date;
```

### 2.2 The Capacity sheet, one row per member × sprint

```sql
select
  member_name    as "Developer/Admin",
  country_code   as "Location",
  capacity_factor as "Capcity",
  sprint_name    as "Sprint",
  gross_days     as "Working days",
  holiday_days   as "Holidays",
  pto_days       as "PTO",
  net_days       as "Working Days",
  committed_points as "Committed",
  completed_points as "Completed",
  points_per_day   as "AVG SP"
from public.v_member_sprint_capacity
where team_id = '<your-team-uuid>'
order by member_name, start_date;
```

### 2.3 Chart 1 series — "SF Platform Metrics"

```sql
select sprint_name, start_date, series, value
from public.v_sprint_velocity v
cross join lateral (values
  ('Commitment',   v.committed_points),
  ('Unplanned',    v.unplanned_points),
  ('Done',         v.done_points),
  ('Velocity AVG', v.velocity_avg_points),
  ('Capacity SP',  v.capacity_points)
) as s(series, value)
where v.team_id = '<your-team-uuid>'
order by v.start_date, s.series;
```

### 2.4 Chart 2 series — "AVG Capacity per day"

```sql
select member_name, avg_points_per_day, capacity_points_per_sprint, sprints_measured
from public.v_member_capacity_profile
where team_id = '<your-team-uuid>'
order by avg_points_per_day desc nulls last;
```

### 2.5 What needs a human's attention before the numbers are trusted

```sql
select sprint_name, ado_work_item_id, title, state_raw, story_points, issue_code, issue
from public.v_sprint_data_quality
where team_id = '<your-team-uuid>'
order by sprint_name, issue_code;
```

### 2.6 Forward-looking free capacity

```sql
select sprint_name, available_person_days, capacity_points,
       committed_points, carry_over_points, free_points
from public.v_sprint_forecast
where team_id = '<your-team-uuid>'
order by start_date;
```

### 2.7 Standalone — the Velocity table without installing anything

If you want the numbers before running the migration, this single query computes
them from the base tables. It needs `user_stories.created_date` and
`user_stories.carry_over_points`, so it only returns the full split once those
columns exist; before then, `committed`/`unplanned` collapse into `total`.

Two differences from the view: it applies the created-date rule with no manual
override (so it reproduces the spreadsheet formula literally — on the sample data
that gives Sprint 17 **118 / 44** rather than the sheet's overridden **143 / 32**),
and it compares `created_date` against midnight in the **session** timezone rather
than `settings.reporting_timezone`.

```sql
with story as (
  select
    s.id            as sprint_id,
    s.name          as sprint_name,
    s.start_date,
    us.story_points::numeric                     as pts,
    coalesce(us.carry_over_points, 0)::numeric   as carry,
    lower(coalesce(us.state_raw, '')) in ('done','closed','resolved','completed','accepted') as is_done,
    (us.created_date is not null
     and us.created_date > s.start_date::timestamptz)  as scope_creep
  from public.sprints s
  join public.user_stories us on us.sprint_id = s.id
  where s.team_id = '<your-team-uuid>'
    and not coalesce(us.excluded_from_metrics, false)
)
select
  sprint_name,
  start_date,
  sum(pts) filter (where not scope_creep)              as commitment,
  sum(pts) filter (where scope_creep)                  as unplanned,
  sum(pts) filter (where carry = 0)                    as done,
  sum(pts)                                             as total_sprint_sp,
  sum(carry)                                           as carry_over_sp,
  sum(pts) - sum(carry)                                as capacity_sp,
  count(*) filter (where is_done)                      as user_stories_done,
  round(avg(sum(pts) filter (where carry = 0)) over (
    order by start_date rows between unbounded preceding and current row
  ), 2)                                                as velocity_avg
from story
group by sprint_id, sprint_name, start_date
order by start_date;
```

---

### 2.6b Capacity by category (feature / tag)

"How many points did we spend on a feature across these sprints?" Story tags are
the categories, so `DigitSec`, `Trust360`, `Admin`, `Dev`, `ProdDeploy` — whatever
you tag — become slices. `v_story_category_points` gives points per tag per sprint;
the **Capacity by category** card on `/metrics` totals it across a chosen set of
sprints, with a Done / Committed / Total toggle.

```sql
select category_label as category,
       sum(story_count)      as stories,
       sum(committed_points) as committed,
       sum(done_points)      as done,
       sum(total_points)     as total
from public.v_story_category_points
where team_id = '<your-team-uuid>'
  -- and sprint_name in ('Sprint 15','Sprint 16')   -- optional: a subset
group by category_label
order by done desc;
```

A story with several tags counts under **each** of them, so category totals can
add up to more than the sprint itself — that's intended for "how much did we spend
on X". Carry-over bookkeeping tags ("carry-over 26.14", "COLS") are excluded.
To see a feature here, tag its stories with that feature's name.

## 2.7b How capacity is estimated (sprint bandwidth)

Capacity is **not** derived from hours per day. Each member has a **bandwidth** —
the story points they typically deliver in a full sprint (`members.sprint_bandwidth_points`,
falling back to `settings.default_sprint_bandwidth_points`). A sprint's expected
capacity for that member is:

```
expected = sprint_bandwidth_points
         × capacity_factor            -- FTE: 1 = full time, 0.5 = half
         × (net_days / gross_days)    -- availability: holidays + PTO + tenure
```

`net_days / gross_days` is the share of the sprint the person is actually around,
so holidays and PTO still move the number — someone out 2 of 10 working days
counts for 80% of their bandwidth. `v_member_sprint_capacity.expected_points`
holds this per member, and `v_sprint_forecast.capacity_points` sums it.

Bandwidth is set per member in **Admin → Team**, and `0004_capacity_bandwidth.sql`
seeds it from measured history on first run (each member's average completed
points across finished sprints), so you don't start from the flat default. The
old day-rate inputs (hours/day, focus factor, points/day) are retired as capacity
drivers — the columns remain so nothing breaks, but no view reads them.

---

## 2.8 Bringing the existing workbook across

`velocity_avg_points` is the workbook's `AVERAGE($F$27:F{n})` — a running mean
anchored at your first sprint. Start the app with an empty history and that
series is permanently wrong and chart 1 shows a single bar on day one. Import the
history first:

```bash
npm install                       # exceljs is a devDependency
node scripts/import-workbook.mjs Scrum_Metrics.xlsx > backfill.sql
```

It prints SQL on stdout and a **parity report** on stderr diffing every Velocity
figure it derived against the value the workbook itself had cached. Read the
report, read the SQL, then run it in Supabase → SQL Editor. Nothing is written
until you do, and every insert is `ON CONFLICT DO NOTHING`, so it is safe twice.

On the sample workbook all three completed sprints reconcile exactly:

| | Commitment | Unplanned | Done | Total | Carry-over | Capacity SP |
|---|---|---|---|---|---|---|
| Sprint 15 | 47 | 35 | 77 | 82 | 2 | 80 |
| Sprint 16 | 62 | 12 | 69 | 74 | 2 | 72 |
| Sprint 17 | 143 | 32 | 135 | 162 | 18 | 144 |

It reads columns by **header name**, never position, because the tabs are not
uniform — one carries two stacked header rows and the planning tab has Commited
and Scope Creep Amount the other way round. It also distinguishes a hand-typed
value in the Commited column from a copied formula, so the five real overrides on
the Sprint 17 tab come across as `committed_points` and the ~90 formula cells do
not.

**The one thing it cannot bring across is PTO.** The Capacity sheet records a
*count* of days per person per sprint, never which days. Those statements are
emitted commented out with the count stated; until you fill in real dates,
historical Workday % reads high by exactly those days. Everything derived from
the work items is exact.

---

## 3. Automations

| Manual step in the workbook | Now |
|---|---|
| Paste the ADO export into a new tab, add the derived columns | Import wizard → `user_stories`; the derived columns are views |
| Retype the sprint's SUM ranges on the Velocity row | `v_sprint_velocity` has one row per sprint, automatically |
| Duplicate the tab into a hidden "Comit" sheet to freeze commitment | `snapshot_sprint_commitment(sprint_id)` |
| Hand-type a carry-over number per unfinished story | `recompute_carry_over(sprint_id)` fills the default (full estimate); a human only edits the exceptions |
| Copy unfinished stories into the next sprint's tab | `close_sprint(sprint_id, next_sprint_id)` |
| Type Holidays / PTO per member per sprint | Computed from `public.holidays` + `public.pto` by `member_sprint_days()` |
| Maintain the country holiday table by hand | **Calendar → Sync public holidays** (`POST /api/holidays/sync`) |
| Work out who a company holiday actually applies to | A holiday with **no country** applies to everyone; one with a country applies to that country's members; one with a region applies only to members explicitly in that region |
| Type each member's Completed and Committed points | Derived from the story rows, keyed on the ADO **Developer** column |
| Re-point the chart ranges at the new tab | The `/metrics` page reads the views |
| Eyeball the tab for rows that break the numbers | `v_sprint_data_quality` |
| Re-link people after a roster change | `relink_story_members(team_id)` |

### The one-click close

**Sprints → (a sprint) → Close sprint** runs `public.close_sprint()`, which in one
transaction:

1. marks every unfinished story as carry-over with its remaining points,
2. stamps `velocity_committed_points` / `velocity_completed_points` on the sprint,
3. copies the carried work into the next sprint (creating it if you ask), and
4. closes the sprint.

### What still needs a human

- **Estimating** and deciding what goes into a sprint.
- **Partial spill.** The default carry-over is the full estimate. The workbook's
  rule of thumb — "if only testing is pending, at least 2 SP are spilled" — is
  judgement; edit the value on the story.
- **Commitment overrides.** When the created-date rule gets it wrong, set
  `user_stories.committed_points`. On the real Sprint 17 sheet this happened five
  times, for 25 SP.
- **Exclusions.** `excluded_from_metrics` + `exclusion_reason` replace the
  workbook comment "13 points not to be considered in metrics". **Admin only** —
  excluding a story removes its points from every total.

### Who can change what

Team members may edit carry-over, and only on **their own** stories in an **open**
sprint. That is deliberately narrow: `carry_over_points` drives `done_points`, so
anyone able to set it across a sprint could zero out that sprint's delivery and
drag the running velocity average with it. Everything else — commitment
overrides, exclusions, points, state — is admin-only, and a closed sprint is not
editable at all until an admin reopens it.

> If you ever re-run `0001_init.sql`, re-run `0003_scrum_metrics.sql` after it.
> 0001 ends by recreating `guard_story_member_update()` in its original, laxer
> form.

---

## 4. Two definitions of "Done"

The workbook computes `Done = IF(CarryOver > 0, "", StoryPoints)` — a story counts
as delivered whenever nobody wrote a carry-over number against it, **whatever its
state says**. Its own header comment says something stricter: "SP from fully done
tickets according the DoD".

Both are exposed, and the difference is reported:

- `done_points` — the sheet's rule, so historical numbers reconcile.
- `delivered_points` — points that reached a done state, **net of anything that
  spilled**. This is stricter than the sheet in one direction and more generous in
  the other: it refuses to credit unfinished work, and it stops throwing away a
  finished story's whole estimate because one point carried over. (On Sprint 15
  the sheet reports 77 and this reports 80, because two stories were *Done* with
  one point outstanding each and the sheet discarded their full 5.)
- `unverified_done_points` — the gap. On the sample data, Sprint 17 shows **135 vs
  107**: 28 story points counted as delivered while five work items were still
  *In Progress* and one was *Removed*.

A sprint that is neither closed nor past its end date is flagged
`is_provisional`. Nothing in it has been marked as spilled yet, so the sheet's
Done rule credits the whole sprint — fine as a live figure, wrong as history.
Provisional sprints are kept out of the running velocity average.

The `/metrics` page has a toggle, and the data-quality view lists the exact rows
(`DONE_WITHOUT_DOD`), so the gap is a to-do list rather than a silent overstatement.

`Removed` is treated as **not done** here. The app's original `DONE_STATES` set
included it, which counted cancelled work as delivered.

---

## 5. Verification

`supabase/tests/scrum_metrics_test.sql` asserts every metric against a fixture with
hand-computed expectations, including the rule that a day which is both a public
holiday and PTO is subtracted **once**.

The model was also checked against the real workbook by loading its three completed
sprints and comparing every cell:

| | Result |
|---|---|
| `Velocity` sheet — Commitment, Unplanned, Done, Done %, Velocity AVG, Total SP, Carry-over, Carry-over %, Capacity SP | **exact match** on all three sprints |
| `Capacity` sheet — Holidays / PTO / Working Days | **exact match**, 33 of 33 member×sprint cells |
| `Capacity` sheet — hand-typed **Completed** | **8 of 33 cells disagreed** with the story rows they claim to summarise (individual errors up to ±6 SP) |
| `Velocity!M` Workday % | The formulas on the Sprint 16 and Sprint 17 rows read the **next** sprint's column block (`SUM(Capacity!S…)` and `SUM(Capacity!Y…)` instead of `N` and `S`), so both rows report another sprint's number |
| `Capacity!E` Capacity per day | Every row reads `AVERAGE(K,P,V,AC)` — four sprints — but the `V` and `AC` cells were never filled in, on any of the 11 rows. `AVERAGE` ignores blanks, so the per-member capacity behind chart 2 comes from Sprints 15–16 only and silently drops the two most recent sprints. Measured across the three completed sprints instead, it **understates team capacity by 37%** (individual members by up to +143%) |

The first two lines are why the migration can be trusted; the last three are why the
spreadsheet should be retired. None of the three defects is a typo a reviewer would catch by
looking at the chart — each one produces a plausible-looking number that is simply about the
wrong thing.

### `Capacity!E`, member by member

| Member | Sheet `Capacity!E` (S15–16 only) | `v_member_capacity_profile` (all finished sprints) | Change |
|---|---|---|---|
| Ataul Khalique | 0.417 | 1.011 | +143% |
| Tomas Olivera | 0.267 | 0.548 | +106% |
| Ignacio Toledo | 0.644 | 1.163 | +80% |
| Apala Sen | 0.761 | 1.315 | +73% |
| Victor Cabrera | 0.400 | 0.667 | +67% |
| Carlos Juarez | 0.800 | 1.256 | +57% |
| Sebastian Perez | 0.967 | 1.078 | +11% |
| Manish Raj | 1.389 | 1.474 | +6% |
| Mahika Agrawal | 0.872 | 0.781 | −10% |
| Jacobo Salazar | 0.889 | 0.556 | −37% |
| Santiago Epalza | 0.000 | 0.296 | from zero |
| **Team total** | **7.41** | **10.14** | **+37%** |
