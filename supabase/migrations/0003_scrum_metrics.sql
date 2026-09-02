-- ============================================================================
-- Carrito 0003 — Scrum Metrics
--
-- Replaces the hand-maintained "Scrum Metrics" workbook (Velocity / Capacity /
-- Holidays / one tab per sprint) with a queryable model.
--
-- Run in Supabase → SQL Editor AFTER 0001_init.sql and 0002_optional_country.sql.
-- Idempotent: safe to re-run.
--
-- WHAT THIS REPRODUCES (workbook cell -> object here)
--   Velocity!D  Commitment          -> v_sprint_velocity.committed_points
--   Velocity!E  Unplanned           -> v_sprint_velocity.unplanned_points
--   Velocity!F  Done                -> v_sprint_velocity.done_points
--   Velocity!G  Done Percentage     -> v_sprint_velocity.done_pct
--   Velocity!H  Velocity AVG        -> v_sprint_velocity.velocity_avg_points
--   Velocity!I  Total Sprint SP     -> v_sprint_velocity.total_points
--   Velocity!J  Carry Over SP       -> v_sprint_velocity.carry_over_points
--   Velocity!K  Carry Over %        -> v_sprint_velocity.carry_over_pct
--   Velocity!L  Capacity SP         -> v_sprint_velocity.capacity_points
--   Velocity!M  Workday %           -> v_sprint_velocity.workday_pct
--   Velocity!N  User Stories Done   -> v_sprint_velocity.stories_done
--   Capacity!A..AC  per-member block-> v_member_sprint_capacity
--   Capacity!E  Capacity per day    -> v_member_capacity_profile.avg_points_per_day
--   Capacity!F  Capacity per sprint -> v_member_capacity_profile.capacity_points_per_sprint
--   Sprint tab!M Scope Creep        -> v_story_metrics.is_scope_creep
--   Sprint tab!N Commited           -> v_story_metrics.committed_points
--   Sprint tab!O Scope Creep Amount -> v_story_metrics.unplanned_points
--   Sprint tab!P Done               -> v_story_metrics.done_points
--   Holidays sheet                  -> public.holidays (+ "Impacts Work Calendar"
--                                      is implicit: a holiday only counts when it
--                                      falls on a configured working weekday)
--
-- VERIFIED against the workbook's own cached values:
--   Sprint 15 -> committed 47, unplanned 35, done 77, total 82, carry-over 2,
--                capacity SP 80, workday% 0.918
--   Sprint 16 -> committed 62, unplanned 12, done 69, total 74, carry-over 2
--   Sprint 17 -> total 162, carry-over 18, done 135; committed 143 / unplanned 32
--                only once the five hand-typed overrides on that sheet are
--                expressed as user_stories.committed_points (see section 4).
-- ============================================================================

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Settings: reporting timezone
--    The workbook compares a story's Created Date (a timestamp) against the
--    sprint start (a midnight date). Which midnight depends on the timezone the
--    team reports in, so make it explicit instead of implicitly UTC.
-- ---------------------------------------------------------------------------
alter table public.settings
  add column if not exists reporting_timezone text not null default 'UTC';

-- ---------------------------------------------------------------------------
-- 2. Members: FTE / capacity factor (workbook Capacity!B — 1 = full time, 0.5 = half)
--    The workbook stores this but never multiplies by it; here it is applied to
--    forward-looking forecasts only, so historical numbers stay reproducible.
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists capacity_factor numeric(4,2) not null default 1.00;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'members_capacity_factor_ck'
  ) then
    alter table public.members
      add constraint members_capacity_factor_ck
      check (capacity_factor > 0 and capacity_factor <= 1);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Sprints: commitment snapshot marker
--    The workbook froze commitment by duplicating the sprint tab into a hidden
--    "Sprint 17 Comit" sheet. Here, "start sprint" stamps the snapshot instead.
-- ---------------------------------------------------------------------------
alter table public.sprints
  add column if not exists committed_snapshot_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. user_stories: the columns the metrics need
--
--   created_date          ADO "Created Date" — drives scope-creep detection.
--   closed_date           ADO "Closed Date"  — optional, for cycle-time reporting.
--   developer_*           The workbook's Capacity sheet is keyed on the ADO
--                         "Developer" column, which differs from "Assigned To"
--                         on ~7% of rows (a story assigned to a tester is still
--                         a developer's capacity). Both are kept; metrics prefer
--                         developer and fall back to assignee.
--   carry_over_points     Sprint tab column J. The existing is_carry_over boolean
--                         cannot express a PARTIAL spill ("only testing pending
--                         -> at least 2 SP are spilled").
--   committed_points      Manual override of the scope-creep rule. On the real
--                         Sprint 17 sheet five rows were hand-typed into the
--                         Commited column (25 SP) because the automatic rule got
--                         them wrong. NULL = derive automatically.
--   excluded_from_metrics The sheet's "13 points not to be considered in
--                         metrics" comment, made machine-readable.
-- ---------------------------------------------------------------------------
alter table public.user_stories
  add column if not exists created_date          timestamptz,
  add column if not exists closed_date           timestamptz,
  add column if not exists developer_raw         text,
  add column if not exists developer_email       citext,
  add column if not exists developer_member_id   uuid references public.members(id) on delete set null,
  add column if not exists carry_over_points     numeric(6,2) not null default 0,
  add column if not exists committed_points      numeric(6,2),
  add column if not exists excluded_from_metrics boolean not null default false,
  add column if not exists exclusion_reason      text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_stories_carry_over_points_ck') then
    alter table public.user_stories
      add constraint user_stories_carry_over_points_ck check (carry_over_points >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_stories_committed_points_ck') then
    alter table public.user_stories
      add constraint user_stories_committed_points_ck
      check (committed_points is null or committed_points >= 0);
  end if;
end $$;

create index if not exists user_stories_created_date_idx
  on public.user_stories (created_date);
create index if not exists user_stories_developer_idx
  on public.user_stories (developer_member_id);
create index if not exists user_stories_sprint_dev_idx
  on public.user_stories (sprint_id, developer_member_id);

-- Keep the boolean in sync with the points so old code paths keep working.
create or replace function public.sync_carry_over_flag()
returns trigger language plpgsql as $$
begin
  if new.carry_over_points > 0 then
    new.is_carry_over := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_story_sync_carry_over on public.user_stories;
create trigger trg_story_sync_carry_over
  before insert or update of carry_over_points on public.user_stories
  for each row execute function public.sync_carry_over_flag();

-- ---------------------------------------------------------------------------
-- 5. Rewrite the non-admin update guard as a WHITELIST.
--
--    The 0001 version enumerated every locked column, so any column added later
--    (including the ones above) silently became member-writable. Inverting it
--    means new columns are locked by default.
-- ---------------------------------------------------------------------------
create or replace function public.guard_story_member_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- Columns a non-admin team member is allowed to curate.
  allowed text[] := array[
    'is_carry_over',
    'carry_over_points',
    'excluded_from_metrics',
    'exclusion_reason',
    'updated_at'
  ];
begin
  if public.is_admin() then
    return new;
  end if;
  if (to_jsonb(old) - allowed) is distinct from (to_jsonb(new) - allowed) then
    raise exception
      'Only carry-over and metric-exclusion fields may be changed by non-admin users';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Helper functions
-- ---------------------------------------------------------------------------

-- 'Removed' is NOT done — the app's original DONE_STATES wrongly included it.
create or replace function public.is_done_state(p_state text)
returns boolean language sql immutable as $$
  select lower(coalesce(p_state, '')) in ('done', 'closed', 'resolved', 'completed', 'accepted');
$$;

create or replace function public.is_removed_state(p_state text)
returns boolean language sql immutable as $$
  select lower(coalesce(p_state, '')) in ('removed', 'cut', 'cancelled', 'canceled');
$$;

create or replace function public.metrics_working_weekdays()
returns int[] language sql stable as $$
  select coalesce(
    (select working_weekdays from public.settings where team_id is null limit 1),
    '{1,2,3,4,5}'::int[]
  );
$$;

create or replace function public.metrics_timezone()
returns text language sql stable as $$
  select coalesce(
    (select reporting_timezone from public.settings where team_id is null limit 1),
    'UTC'
  );
$$;

-- Sprint start as an absolute instant, for comparison against created_date.
create or replace function public.sprint_start_ts(p_start date)
returns timestamptz language sql stable as $$
  select (p_start::timestamp) at time zone public.metrics_timezone();
$$;

-- Every configured working weekday in [p_start, p_end].
create or replace function public.business_days(
  p_start    date,
  p_end      date,
  p_weekdays int[] default null
)
returns setof date language sql stable as $$
  select g.d::date
  from generate_series(p_start, p_end, interval '1 day') g(d)
  where extract(dow from g.d)::int
        = any (coalesce(p_weekdays, public.metrics_working_weekdays()));
$$;

-- ---------------------------------------------------------------------------
-- 7. member_sprint_days — the Capacity sheet's G/H/I block, computed.
--
--    gross   = working weekdays in the sprint the member was on the team
--    holiday = those days that are a public holiday for the member's country,
--              or a company-wide manual holiday  (workbook "Holidays" columns,
--              filtered by "Impacts Work Calendar" — implicit here because only
--              working weekdays are considered at all)
--    pto     = sum of PTO day fractions on the remaining days
--    net     = gross - holiday - pto
--
--    A day that is BOTH a holiday and PTO counts ONCE, as a holiday — matching
--    lib/capacity/engine.ts so SQL and TypeScript never disagree.
-- ---------------------------------------------------------------------------
create or replace function public.member_sprint_days(
  p_member_id uuid,
  p_start     date,
  p_end       date
)
returns table (
  gross_days   numeric,
  holiday_days numeric,
  pto_days     numeric,
  net_days     numeric
)
language sql stable as $$
  with m as (
    select id, team_id, country_code, region_code, is_active, start_date, end_date
    from public.members
    where id = p_member_id
  ),
  days as (
    select b.d
    from m
    cross join public.business_days(p_start, p_end) b(d)
    where m.is_active
      and (m.start_date is null or b.d >= m.start_date)
      and (m.end_date   is null or b.d <= m.end_date)
  ),
  hol as (
    select distinct h.holiday_date as d
    from public.holidays h
    cross join m
    where h.holiday_date between p_start and p_end
      and (
        -- company / team-wide manual holiday: applies to everyone
        (h.is_manual and (h.team_id is null or h.team_id = m.team_id))
        -- public holiday: only for members of that country (and region, if set)
        or (
          not h.is_manual
          and m.country_code is not null
          and h.country_code = m.country_code
          and (h.region_code is null or m.region_code is null or h.region_code = m.region_code)
        )
      )
  ),
  pto_frac as (
    select d.d, least(1.0, sum(p.day_fraction))::numeric as frac
    from days d
    join public.pto p
      on p.member_id = p_member_id
     and d.d between p.start_date and p.end_date
    group by d.d
  ),
  ledger as (
    select
      d.d,
      (h.d is not null)               as is_holiday,
      coalesce(pf.frac, 0)::numeric   as pto
    from days d
    left join hol      h  on h.d  = d.d
    left join pto_frac pf on pf.d = d.d
  )
  select
    coalesce(count(*), 0)::numeric                                                as gross_days,
    coalesce(count(*) filter (where is_holiday), 0)::numeric                      as holiday_days,
    coalesce(sum(case when is_holiday then 0 else pto end), 0)::numeric           as pto_days,
    coalesce(sum(case when is_holiday then 0 else 1 - pto end), 0)::numeric       as net_days
  from ledger;
$$;

-- ---------------------------------------------------------------------------
-- 8. v_story_metrics — one row per story = the derived columns M/N/O/P of a
--    sprint tab, made explicit.
-- ---------------------------------------------------------------------------
drop view if exists public.v_sprint_forecast      cascade;
drop view if exists public.v_sprint_data_quality  cascade;
drop view if exists public.v_sprint_velocity      cascade;
drop view if exists public.v_member_capacity_profile cascade;
drop view if exists public.v_member_sprint_capacity  cascade;
drop view if exists public.v_story_metrics        cascade;

create view public.v_story_metrics as
with base as (
  select
    us.id                                   as story_id,
    us.team_id,
    us.sprint_id,
    us.ado_work_item_id,
    us.title,
    us.work_item_type,
    us.state_raw,
    us.tags,
    us.created_date,
    us.closed_date,
    us.excluded_from_metrics,
    us.exclusion_reason,
    coalesce(us.story_points, 0)::numeric     as story_points,
    coalesce(us.carry_over_points, 0)::numeric as carry_over_points,
    us.committed_points                       as committed_override,
    coalesce(us.developer_member_id, us.assignee_member_id) as metrics_member_id,
    coalesce(us.developer_raw, us.assignee_raw)             as metrics_member_raw,
    sp.name       as sprint_name,
    sp.start_date as sprint_start,
    sp.end_date   as sprint_end,
    public.is_done_state(us.state_raw)    as is_done_state,
    public.is_removed_state(us.state_raw) as is_removed_state,
    -- Sprint tab column M: IF(SprintStart < CreatedDate,"True","False")
    (
      us.created_date is not null
      and us.created_date > public.sprint_start_ts(sp.start_date)
    ) as is_scope_creep
  from public.user_stories us
  join public.sprints sp on sp.id = us.sprint_id
)
select
  b.*,
  -- Column N: committed. Manual override wins, else "not scope creep".
  case
    when b.excluded_from_metrics       then 0
    when b.committed_override is not null then b.committed_override
    when b.is_scope_creep              then 0
    else b.story_points
  end::numeric as committed_points,
  -- Column O: unplanned / scope-creep amount.
  case
    when b.excluded_from_metrics       then 0
    when b.committed_override is not null then greatest(b.story_points - b.committed_override, 0)
    when b.is_scope_creep              then b.story_points
    else 0
  end::numeric as unplanned_points,
  -- Column P: done = IF(CarryOver>0,"",SP). Faithful to the workbook.
  case
    when b.excluded_from_metrics    then 0
    when b.carry_over_points > 0    then 0
    else b.story_points
  end::numeric as done_points,
  -- Same, but honouring the stated Definition of Done. Where this differs from
  -- done_points the sprint tab is claiming credit for work that is not Done.
  case
    when b.excluded_from_metrics then 0
    when b.carry_over_points > 0 then 0
    when not b.is_done_state     then 0
    else b.story_points
  end::numeric as done_points_strict,
  case when b.excluded_from_metrics or not b.is_removed_state then 0
       else b.story_points end::numeric as removed_points,
  case when b.excluded_from_metrics then 0 else b.story_points end::numeric as counted_points
from base b;

alter view public.v_story_metrics set (security_invoker = on);
comment on view public.v_story_metrics is
  'Per-story scrum metrics: reproduces the Scope Creep / Commited / Scope Creep Amount / Done columns of a sprint tab in the Scrum Metrics workbook.';

-- ---------------------------------------------------------------------------
-- 9. v_member_sprint_capacity — the Capacity sheet, one row per member × sprint.
-- ---------------------------------------------------------------------------
create view public.v_member_sprint_capacity as
select
  s.id            as sprint_id,
  s.team_id,
  s.name          as sprint_name,
  s.start_date,
  s.end_date,
  m.id            as member_id,
  m.full_name     as member_name,
  m.country_code,
  m.capacity_factor,
  d.gross_days,
  d.holiday_days,
  d.pto_days,
  d.net_days,
  coalesce(sm.committed_points, 0)::numeric as committed_points,
  coalesce(sm.done_points, 0)::numeric      as completed_points,
  coalesce(sm.total_points, 0)::numeric     as total_points,
  coalesce(sm.carry_over_points, 0)::numeric as carry_over_points,
  case
    when d.net_days > 0
      then round(coalesce(sm.done_points, 0) / d.net_days, 4)
  end as points_per_day
from public.sprints s
join public.members m
  on m.team_id = s.team_id
 and m.is_active
cross join lateral public.member_sprint_days(m.id, s.start_date, s.end_date) d
left join lateral (
  select
    sum(v.committed_points)  as committed_points,
    sum(v.done_points)       as done_points,
    sum(v.counted_points)    as total_points,
    sum(v.carry_over_points) as carry_over_points
  from public.v_story_metrics v
  where v.sprint_id = s.id
    and v.metrics_member_id = m.id
) sm on true;

alter view public.v_member_sprint_capacity set (security_invoker = on);
comment on view public.v_member_sprint_capacity is
  'Reproduces one per-sprint block of the workbook Capacity sheet: Holidays / PTO / Working Days / Committed / Completed / AVG SP per member.';

-- ---------------------------------------------------------------------------
-- 10. v_member_capacity_profile — Capacity!E and Capacity!F. Feeds chart 2
--     ("AVG Capacity per day" by Developer/Admin).
-- ---------------------------------------------------------------------------
create view public.v_member_capacity_profile as
select
  c.team_id,
  c.member_id,
  c.member_name,
  c.country_code,
  c.capacity_factor,
  count(*) filter (where c.points_per_day is not null)      as sprints_measured,
  round(avg(c.points_per_day) filter (where c.points_per_day is not null), 4)
                                                            as avg_points_per_day,
  round(avg(c.gross_days), 2)                               as avg_gross_days,
  round(
    coalesce(avg(c.points_per_day) filter (where c.points_per_day is not null), 0)
    * coalesce(avg(c.gross_days), 0),
  2)                                                        as capacity_points_per_sprint,
  round(avg(c.net_days), 2)                                 as avg_net_days,
  sum(c.completed_points)                                   as completed_points_total,
  sum(c.committed_points)                                   as committed_points_total
from public.v_member_sprint_capacity c
group by c.team_id, c.member_id, c.member_name, c.country_code, c.capacity_factor;

alter view public.v_member_capacity_profile set (security_invoker = on);
comment on view public.v_member_capacity_profile is
  'Workbook Capacity!E (AVERAGE of per-sprint SP/day) and Capacity!F (that average x working days).';

-- ---------------------------------------------------------------------------
-- 11. v_sprint_velocity — the Velocity sheet, one row per sprint.
-- ---------------------------------------------------------------------------
create view public.v_sprint_velocity as
with agg as (
  select
    s.id          as sprint_id,
    s.team_id,
    s.name        as sprint_name,
    s.start_date,
    s.end_date,
    s.is_closed,
    s.committed_snapshot_at,
    count(v.story_id)::int                                       as story_count,
    count(v.story_id) filter (where v.is_done_state)::int         as stories_done,
    count(v.story_id) filter (where v.carry_over_points > 0)::int as stories_carried,
    coalesce(sum(v.committed_points),   0)::numeric as committed_points,
    coalesce(sum(v.unplanned_points),   0)::numeric as unplanned_points,
    coalesce(sum(v.done_points),        0)::numeric as done_points,
    coalesce(sum(v.done_points_strict), 0)::numeric as done_points_strict,
    coalesce(sum(v.counted_points),     0)::numeric as total_points,
    coalesce(sum(v.carry_over_points),  0)::numeric as carry_over_points,
    coalesce(sum(v.removed_points),     0)::numeric as removed_points
  from public.sprints s
  left join public.v_story_metrics v on v.sprint_id = s.id
  group by s.id, s.team_id, s.name, s.start_date, s.end_date, s.is_closed, s.committed_snapshot_at
),
days as (
  select
    sprint_id,
    sum(gross_days) as gross_days,
    sum(net_days)   as net_days,
    sum(holiday_days) as holiday_days,
    sum(pto_days)   as pto_days
  from public.v_member_sprint_capacity
  group by sprint_id
)
select
  a.sprint_id,
  a.team_id,
  a.sprint_name,
  a.start_date,
  a.end_date,
  a.is_closed,
  a.committed_snapshot_at,
  a.story_count,
  a.stories_done,
  a.stories_carried,
  a.committed_points,
  a.unplanned_points,
  a.done_points,
  a.done_points_strict,
  -- Work the sprint tab counts as Done but whose state says otherwise. This is
  -- the workbook's silent defect, surfaced as a number you can act on.
  (a.done_points - a.done_points_strict)::numeric as unverified_done_points,
  a.total_points,
  a.carry_over_points,
  a.removed_points,
  round(a.done_points / nullif(a.committed_points, 0), 4)       as done_pct,
  round(a.carry_over_points / nullif(a.committed_points, 0), 4) as carry_over_pct,
  (a.total_points - a.carry_over_points)::numeric               as capacity_points,
  round(d.net_days / nullif(d.gross_days, 0), 4)                as workday_pct,
  coalesce(d.gross_days, 0)   as gross_working_days,
  coalesce(d.net_days, 0)     as net_working_days,
  coalesce(d.holiday_days, 0) as holiday_days,
  coalesce(d.pto_days, 0)     as pto_days,
  -- Velocity!H: running AVERAGE($F$27:F<n>) — cumulative mean of Done, over the
  -- sprints that actually carry work.
  round(
    avg(a.done_points) filter (where a.story_count > 0) over (
      partition by a.team_id
      order by a.start_date, a.sprint_id
      rows between unbounded preceding and current row
    ),
  2) as velocity_avg_points
from agg a
left join days d on d.sprint_id = a.sprint_id;

alter view public.v_sprint_velocity set (security_invoker = on);
comment on view public.v_sprint_velocity is
  'Reproduces the workbook Velocity sheet, one row per sprint, plus the data-quality delta (unverified_done_points).';

-- ---------------------------------------------------------------------------
-- 12. v_sprint_forecast — what the workbook could never do: forward-looking
--     free capacity for a sprint, from each member''s own measured SP/day.
-- ---------------------------------------------------------------------------
create view public.v_sprint_forecast as
select
  c.sprint_id,
  c.team_id,
  c.sprint_name,
  c.start_date,
  c.end_date,
  round(sum(c.net_days * c.capacity_factor), 2) as available_person_days,
  round(sum(
    c.net_days * c.capacity_factor * coalesce(p.avg_points_per_day, 0)
  ), 1)                                          as capacity_points,
  round(sum(c.committed_points), 1)              as committed_points,
  round(sum(c.carry_over_points), 1)             as carry_over_points,
  round(
    sum(c.net_days * c.capacity_factor * coalesce(p.avg_points_per_day, 0))
    - sum(c.committed_points) - sum(c.carry_over_points),
  1)                                             as free_points
from public.v_member_sprint_capacity c
left join public.v_member_capacity_profile p on p.member_id = c.member_id
group by c.sprint_id, c.team_id, c.sprint_name, c.start_date, c.end_date;

alter view public.v_sprint_forecast set (security_invoker = on);
comment on view public.v_sprint_forecast is
  'Forward-looking capacity vs. commitment per sprint, using each member''s measured SP/day and FTE factor.';

-- ---------------------------------------------------------------------------
-- 13. v_sprint_data_quality — the manual review checklist, generated.
--     Every row here is something a human used to have to spot by eye.
-- ---------------------------------------------------------------------------
create view public.v_sprint_data_quality as
select
  v.team_id,
  v.sprint_id,
  v.sprint_name,
  v.story_id,
  v.ado_work_item_id,
  v.title,
  v.state_raw,
  v.story_points,
  v.carry_over_points,
  q.issue_code,
  q.issue
from public.v_story_metrics v
cross join lateral (
  values
    ('NO_CREATED_DATE', 'No Created Date — cannot classify as committed vs. unplanned',
      v.created_date is null),
    ('NO_POINTS', 'No story points — invisible to every points metric',
      v.story_points = 0 and not v.excluded_from_metrics),
    ('DONE_WITHOUT_DOD', 'Counted as Done but the state is not a done state — set carry-over or update the state',
      v.carry_over_points = 0 and not v.is_done_state and not v.is_removed_state
      and not v.excluded_from_metrics),
    ('CARRY_OVER_EXCEEDS_POINTS', 'Carry-over is larger than the estimate',
      v.carry_over_points > v.story_points),
    ('REMOVED_WITH_POINTS', 'Removed but still carrying points into the totals',
      v.is_removed_state and v.story_points > 0 and not v.excluded_from_metrics),
    ('NO_OWNER', 'No developer or assignee — excluded from every per-member metric',
      v.metrics_member_id is null and not v.excluded_from_metrics)
) as q(issue_code, issue, hit)
where q.hit;

alter view public.v_sprint_data_quality set (security_invoker = on);
comment on view public.v_sprint_data_quality is
  'Rows that would silently distort the metrics. Replaces eyeballing the sprint tab.';

-- ---------------------------------------------------------------------------
-- 14. Automations
-- ---------------------------------------------------------------------------

-- 14a. Freeze commitment — replaces duplicating the sprint tab into a hidden
--      "Comit" sheet. Everything in the sprint right now IS the commitment.
create or replace function public.snapshot_sprint_commitment(p_sprint_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rows int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can snapshot a sprint commitment';
  end if;

  update public.user_stories us
     set committed_points = coalesce(us.story_points, 0)
   where us.sprint_id = p_sprint_id
     and us.committed_points is null
     and not us.excluded_from_metrics;
  get diagnostics v_rows = row_count;

  update public.sprints
     set committed_snapshot_at = now()
   where id = p_sprint_id;

  return jsonb_build_object('sprint_id', p_sprint_id, 'stories_snapshotted', v_rows);
end;
$$;

-- 14b. Default carry-over for everything left unfinished. Humans can still lower
--      an individual value (e.g. "only testing pending -> 2 SP"); this only
--      fills rows that are still at zero.
create or replace function public.recompute_carry_over(p_sprint_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rows int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can recompute carry-over';
  end if;

  update public.user_stories us
     set carry_over_points = coalesce(us.story_points, 0),
         is_carry_over     = true
   where us.sprint_id = p_sprint_id
     and us.carry_over_points = 0
     and coalesce(us.story_points, 0) > 0
     and not us.excluded_from_metrics
     and not public.is_done_state(us.state_raw)
     and not public.is_removed_state(us.state_raw);
  get diagnostics v_rows = row_count;

  return jsonb_build_object('sprint_id', p_sprint_id, 'stories_flagged', v_rows);
end;
$$;

-- 14c. One-click close + roll over.
--      Stamps velocity on the sprint, defaults carry-over, and (optionally)
--      copies every unfinished story into the next sprint — the single action
--      that removes most of the workbook's per-sprint manual work.
create or replace function public.close_sprint(
  p_sprint_id      uuid,
  p_next_sprint_id uuid    default null,
  p_carry_forward  boolean default true
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_team        uuid;
  v_committed   numeric;
  v_completed   numeric;
  v_carried     int := 0;
  v_moved       int := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can close a sprint';
  end if;

  select team_id into v_team from public.sprints where id = p_sprint_id;
  if v_team is null then
    raise exception 'Sprint % not found', p_sprint_id;
  end if;

  if p_next_sprint_id is not null then
    if not exists (
      select 1 from public.sprints
      where id = p_next_sprint_id and team_id = v_team
    ) then
      raise exception 'Target sprint % is not in the same team', p_next_sprint_id;
    end if;
    if p_next_sprint_id = p_sprint_id then
      raise exception 'Cannot roll a sprint over into itself';
    end if;
  end if;

  -- 1. Default carry-over on everything unfinished.
  select (public.recompute_carry_over(p_sprint_id) ->> 'stories_flagged')::int
    into v_carried;

  -- 2. Stamp the velocity numbers onto the sprint row.
  select committed_points, done_points
    into v_committed, v_completed
    from public.v_sprint_velocity
   where sprint_id = p_sprint_id;

  update public.sprints
     set is_closed                 = true,
         velocity_committed_points = coalesce(v_committed, 0),
         velocity_completed_points = coalesce(v_completed, 0)
   where id = p_sprint_id;

  -- 3. Carry the unfinished work forward.
  if p_carry_forward and p_next_sprint_id is not null then
    insert into public.user_stories (
      team_id, sprint_id, ado_work_item_id, ado_iteration_path, title,
      work_item_type, state_raw, state_normalized, story_points, priority,
      assignee_member_id, assignee_raw, assignee_email,
      developer_member_id, developer_raw, developer_email,
      created_date, closed_date, is_carry_over, carry_over_points,
      excluded_from_metrics, exclusion_reason, tags, raw
    )
    select
      us.team_id, p_next_sprint_id, us.ado_work_item_id, us.ado_iteration_path, us.title,
      us.work_item_type, us.state_raw, us.state_normalized, us.story_points, us.priority,
      us.assignee_member_id, us.assignee_raw, us.assignee_email,
      us.developer_member_id, us.developer_raw, us.developer_email,
      us.created_date, us.closed_date, true, 0,
      us.excluded_from_metrics, us.exclusion_reason, us.tags, us.raw
    from public.user_stories us
    where us.sprint_id = p_sprint_id
      and us.carry_over_points > 0
      and not us.excluded_from_metrics
    on conflict (ado_work_item_id, sprint_id) do update
      set is_carry_over = true,
          story_points  = excluded.story_points,
          state_raw     = excluded.state_raw;
    get diagnostics v_moved = row_count;
  end if;

  return jsonb_build_object(
    'sprint_id',          p_sprint_id,
    'next_sprint_id',     p_next_sprint_id,
    'committed_points',   coalesce(v_committed, 0),
    'completed_points',   coalesce(v_completed, 0),
    'stories_carried',    v_carried,
    'stories_moved',      v_moved
  );
end;
$$;

-- 14d. Re-link the Developer / Assigned To columns to members after the roster
--      changes, so per-member metrics repair themselves instead of being
--      re-typed.
create or replace function public.relink_story_members(p_team_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_dev int;
  v_asg int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can relink story members';
  end if;

  update public.user_stories us
     set developer_member_id = m.id
    from public.members m
   where us.team_id = p_team_id
     and m.team_id  = p_team_id
     and us.developer_member_id is null
     and (
       (us.developer_email is not null and m.email = us.developer_email)
       or (us.developer_email is null and us.developer_raw is not null
           and lower(m.full_name) = lower(split_part(us.developer_raw, '<', 1)))
     );
  get diagnostics v_dev = row_count;

  update public.user_stories us
     set assignee_member_id = m.id
    from public.members m
   where us.team_id = p_team_id
     and m.team_id  = p_team_id
     and us.assignee_member_id is null
     and us.assignee_email is not null
     and m.email = us.assignee_email;
  get diagnostics v_asg = row_count;

  return jsonb_build_object('developers_linked', v_dev, 'assignees_linked', v_asg);
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. Grants
-- ---------------------------------------------------------------------------
grant select on
  public.v_story_metrics,
  public.v_member_sprint_capacity,
  public.v_member_capacity_profile,
  public.v_sprint_velocity,
  public.v_sprint_forecast,
  public.v_sprint_data_quality
to authenticated;

grant execute on function
  public.is_done_state(text),
  public.is_removed_state(text),
  public.metrics_working_weekdays(),
  public.metrics_timezone(),
  public.sprint_start_ts(date),
  public.business_days(date, date, int[]),
  public.member_sprint_days(uuid, date, date),
  public.snapshot_sprint_commitment(uuid),
  public.recompute_carry_over(uuid),
  public.close_sprint(uuid, uuid, boolean),
  public.relink_story_members(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- 16. Backfill for data imported before this migration
--     Stories already flagged is_carry_over but with no points recorded get
--     their full estimate as the spill, which is the workbook's default.
-- ---------------------------------------------------------------------------
update public.user_stories
   set carry_over_points = coalesce(story_points, 0)
 where is_carry_over
   and carry_over_points = 0
   and coalesce(story_points, 0) > 0;
