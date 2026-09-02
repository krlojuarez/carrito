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
| `Velocity!F` Done | "SP from fully done tickets according the DoD" | `.done_points` (sheet rule) · `.done_points_strict` (actual DoD) |
| `Velocity!G` Done Percentage | Done ÷ Commitment | `.done_pct` |
| `Velocity!H` Velocity AVG | "Average speed considering Done SP per sprint" | `.velocity_avg_points` (running mean) |
| `Velocity!I` Total Sprint SP | "committed and adhered (Scope Creep)" | `.total_points` |
| `Velocity!J` Carry Over SP | "SP that spill into the following sprint" | `.carry_over_points` |
| `Velocity!K` Carry Over % | Carry-over ÷ Commitment | `.carry_over_pct` |
| `Velocity!L` Capacity SP | Total − Carry-over | `.capacity_points` |
| `Velocity!M` Workday % | "Percentage of the workdays that were not Holidays or PTOs" | `.workday_pct` |
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
  workbook comment "13 points not to be considered in metrics".

---

## 4. Two definitions of "Done"

The workbook computes `Done = IF(CarryOver > 0, "", StoryPoints)` — a story counts
as delivered whenever nobody wrote a carry-over number against it, **whatever its
state says**. Its own header comment says something stricter: "SP from fully done
tickets according the DoD".

Both are exposed, and the difference is reported:

- `done_points` — the sheet's rule, so historical numbers reconcile.
- `done_points_strict` — only stories in a done state.
- `unverified_done_points` — the gap. On the sample data, Sprint 17 shows **135 vs
  107**: 28 story points counted as delivered while five work items were still
  *In Progress* and one was *Removed*.

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

The first two lines are why the migration can be trusted; the last two are why the
spreadsheet should be retired.
