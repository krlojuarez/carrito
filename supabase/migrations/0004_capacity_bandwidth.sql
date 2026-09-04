-- ============================================================================
-- Carrito 0004 — capacity by per-sprint bandwidth
--
-- The team does not estimate capacity from hours/day. Each member has a
-- BANDWIDTH: the story points they typically deliver in a full sprint. Capacity
-- for a given sprint is that bandwidth, scaled by FTE and by how much of the
-- sprint the person is actually available:
--
--     capacity = sprint_bandwidth_points
--              × capacity_factor              (FTE: 1 = full time, 0.5 = half)
--              × (net_days / gross_days)      (holidays + PTO + tenure)
--
-- net_days / gross_days is the availability fraction: a person out 2 of 10
-- working days counts for 80% of their bandwidth. Holidays and PTO therefore
-- still drive the numbers — the calendar is not just informational.
--
-- Run in Supabase → SQL Editor AFTER 0003_scrum_metrics.sql. Idempotent.
--
-- This retires the day-rate inputs (hours/day, focus factor, points/day) as
-- capacity drivers. Those columns stay in the schema so nothing breaks and old
-- data is preserved, but no view reads them any more.
-- ============================================================================

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. The bandwidth columns
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists sprint_bandwidth_points numeric(6,2);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'members_sprint_bandwidth_ck') then
    alter table public.members
      add constraint members_sprint_bandwidth_ck
      check (sprint_bandwidth_points is null or sprint_bandwidth_points >= 0);
  end if;
end $$;

-- Team-wide fallback for a member who has no bandwidth of their own yet.
alter table public.settings
  add column if not exists default_sprint_bandwidth_points numeric(6,2) not null default 8;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'settings_default_bandwidth_ck') then
    alter table public.settings
      add constraint settings_default_bandwidth_ck
      check (default_sprint_bandwidth_points >= 0);
  end if;
end $$;

create or replace function public.metrics_default_bandwidth()
returns numeric language sql stable as $$
  select coalesce(
    (select default_sprint_bandwidth_points from public.settings where team_id is null limit 1),
    8
  );
$$;
grant execute on function public.metrics_default_bandwidth() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Rebuild the two capacity views. v_member_sprint_capacity gains three
--    trailing columns (bandwidth_points, availability, expected_points);
--    `create or replace` appends them without disturbing the views that depend
--    on it (v_sprint_velocity, v_member_capacity_profile), so no CASCADE drop.
-- ---------------------------------------------------------------------------
create or replace view public.v_member_sprint_capacity as
select
  s.id            as sprint_id,
  s.team_id,
  s.name          as sprint_name,
  s.start_date,
  s.end_date,
  s.is_closed,
  m.id            as member_id,
  m.full_name     as member_name,
  m.country_code,
  m.capacity_factor,
  d.gross_days,
  d.tenure_days,
  d.holiday_days,
  d.pto_days,
  d.net_days,
  coalesce(sm.committed_points, 0)::numeric  as committed_points,
  coalesce(sm.done_points, 0)::numeric       as completed_points,
  coalesce(sm.total_points, 0)::numeric      as total_points,
  coalesce(sm.carry_over_points, 0)::numeric as carry_over_points,
  case
    when d.net_days > 0
      then round(coalesce(sm.done_points, 0) / d.net_days, 4)
  end as points_per_day,
  -- The member's full-sprint bandwidth (their own, else the team default).
  coalesce(m.sprint_bandwidth_points, public.metrics_default_bandwidth()) as bandwidth_points,
  -- Fraction of the sprint the member was available: net working days over the
  -- sprint's nominal working days. 1.0 = full time, whole sprint, no time off.
  case when d.gross_days > 0 then round(d.net_days / d.gross_days, 4) else 0 end as availability,
  -- Expected capacity for THIS sprint = bandwidth × FTE × availability.
  round(
    coalesce(m.sprint_bandwidth_points, public.metrics_default_bandwidth())
    * m.capacity_factor
    * case when d.gross_days > 0 then d.net_days / d.gross_days else 0 end,
  1) as expected_points
from public.sprints s
join public.members m
  on m.team_id = s.team_id
 and (m.is_active or m.end_date is not null)
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
  'One row per member × sprint: the workbook Capacity block, plus each member''s sprint bandwidth and the expected capacity it yields after FTE and availability.';

-- ---------------------------------------------------------------------------
-- 3. Forecast now sums bandwidth-based expected capacity, not a day rate.
-- ---------------------------------------------------------------------------
create or replace view public.v_sprint_forecast as
select
  c.sprint_id,
  c.team_id,
  c.sprint_name,
  c.start_date,
  c.end_date,
  round(sum(c.net_days * c.capacity_factor), 2) as available_person_days,
  round(sum(c.expected_points), 1)              as capacity_points,
  -- Demand comes from the SPRINT total, not the per-member roll-up: a story
  -- with no resolved developer is real work, and summing per-member drops it.
  round(min(sv.committed_points), 1)            as committed_points,
  round(min(sv.carry_over_points), 1)           as carry_over_points,
  round(
    sum(c.expected_points) - min(sv.committed_points) - min(sv.carry_over_points),
  1)                                            as free_points
from public.v_member_sprint_capacity c
join public.v_sprint_velocity sv on sv.sprint_id = c.sprint_id
group by c.sprint_id, c.team_id, c.sprint_name, c.start_date, c.end_date;

alter view public.v_sprint_forecast set (security_invoker = on);
comment on view public.v_sprint_forecast is
  'Forward-looking capacity vs. commitment per sprint, from each member''s sprint bandwidth scaled by FTE and availability.';

grant select on public.v_member_sprint_capacity, public.v_sprint_forecast to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Seed bandwidth from measured history where we have it, so the change is
--    not starting from the flat default. Each member's bandwidth becomes their
--    average completed points across the sprints they actually delivered in
--    (v_member_capacity_profile already computes this per finished sprint).
--    Only fills members who have no bandwidth set yet; safe to re-run.
-- ---------------------------------------------------------------------------
update public.members m
   set sprint_bandwidth_points = round(p.avg_completed, 1)
  from (
    select member_id, avg(completed_points) as avg_completed
    from public.v_member_sprint_capacity
    where is_closed or end_date < current_date
    group by member_id
    having avg(completed_points) > 0
  ) p
 where p.member_id = m.id
   and m.sprint_bandwidth_points is null;
