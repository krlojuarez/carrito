-- ============================================================================
-- Regression test for the Scrum Metrics model (0003_scrum_metrics.sql).
--
-- Run it in Supabase → SQL Editor, or:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/scrum_metrics_test.sql
--
-- It inserts a small fixture whose every expected number is worked out by hand
-- below, asserts each one, and ROLLS BACK. Nothing is left behind.
-- On success the last line prints "ALL SCRUM METRICS ASSERTIONS PASSED".
--
-- THE FIXTURE
--   Sprint A: Mon 2026-03-02 → Fri 2026-03-13  = 10 working weekdays.
--   M1  country ZZ.  ZZ has a public holiday on Wed 2026-03-04.
--                    M1 also books PTO on that same day — it must count ONCE,
--                    as a holiday, never twice.
--        -> gross 10, holidays 1, pto 0, net 9
--   M2  no country (so no public holidays), 2 days PTO (Mar 5-6).
--        -> gross 10, holidays 0, pto 2, net 8
--   M3  LEFT the team mid-sprint: is_active = false, end_date = Fri 2026-03-06.
--       Departing must not erase the days they worked, and the days after they
--       left must stay VISIBLE in the denominator — losing people is the single
--       largest capacity event a team has, so Workday % has to move.
--        -> gross 10 (nominal), tenure 5, holidays 0, pto 0, net 5
--   M4  is_active = false with NO end date — someone who was never really on
--       the team. Contributes nothing at all.
--        -> gross 0
--   team totals: gross 30, net 22  -> workday_pct = 22/30 = 0.7333
--
--   S1 created before the sprint,  5 pts, Done,        carry 0
--   S2 created DURING the sprint,  3 pts, Done,        carry 0   (scope creep)
--   S3 created before the sprint,  8 pts, In Progress, carry 8
--   S4 created before the sprint,  2 pts, Removed,     carry 0
--   S5 created before the sprint,100 pts, New,         excluded_from_metrics
--   S6 created DURING the sprint,  1 pt,  Done,        carry 0,
--      but committed_points is overridden to 4 (the human says it was planned)
--
--   committed   = 5 + 8 + 2 + 4          = 19
--   unplanned   = 3 + max(1-4,0)         = 3
--   total       = 5 + 3 + 8 + 2 + 1      = 19   (S5 excluded)
--   carry-over  = 8                      = 8
--   done sheet  = 5 + 3 + 2 + 1          = 11   (S3 spilled -> 0)
--   delivered   = 5 + 3 + 1              = 9    (S4 Removed is not Done;
--                                                S3 is not in a done state)
--   capacity SP = total - carry = 19 - 8 = 11
--   stories_done (S1,S2,S6)              = 3
-- ============================================================================

begin;

do $$
declare
  v_team    uuid := gen_random_uuid();
  v_sprint  uuid := gen_random_uuid();
  v_m1      uuid := gen_random_uuid();
  v_m2      uuid := gen_random_uuid();
  v_m3      uuid := gen_random_uuid();
  v_m4      uuid := gen_random_uuid();
  r         record;
  d         record;
begin
  -- Make the assertions independent of whatever the live settings row says.
  update public.settings
     set working_weekdays = '{1,2,3,4,5}', reporting_timezone = 'UTC'
   where team_id is null;

  insert into public.teams (id, name) values (v_team, 'test-team-' || v_team);

  insert into public.members (id, team_id, full_name, country_code, is_active, end_date)
  values (v_m1, v_team, 'Member One',   'ZZ', true,  null),
         (v_m2, v_team, 'Member Two',   null, true,  null),
         (v_m3, v_team, 'Member Three', null, false, date '2026-03-06'),
         (v_m4, v_team, 'Member Four',  null, false, null);

  insert into public.sprints (id, team_id, name, start_date, end_date)
  values (v_sprint, v_team, 'Sprint A', date '2026-03-02', date '2026-03-13');

  insert into public.holidays (country_code, holiday_date, name, is_manual, source)
  values ('ZZ', date '2026-03-04', 'Test Day', false, 'test');

  -- M1's PTO collides with the holiday on purpose.
  insert into public.pto (member_id, start_date, end_date, day_fraction)
  values (v_m1, date '2026-03-04', date '2026-03-04', 1.0),
         (v_m2, date '2026-03-05', date '2026-03-06', 1.0);

  insert into public.user_stories
    (team_id, sprint_id, ado_work_item_id, title, state_raw, story_points,
     created_date, carry_over_points, committed_points, excluded_from_metrics,
     developer_member_id)
  values
    (v_team, v_sprint, 1, 'S1', 'Done',        5,   timestamptz '2026-02-20 09:00+00', 0, null, false, v_m1),
    (v_team, v_sprint, 2, 'S2', 'Done',        3,   timestamptz '2026-03-05 09:00+00', 0, null, false, v_m1),
    (v_team, v_sprint, 3, 'S3', 'In Progress', 8,   timestamptz '2026-02-25 09:00+00', 8, null, false, v_m2),
    (v_team, v_sprint, 4, 'S4', 'Removed',     2,   timestamptz '2026-02-25 09:00+00', 0, null, false, v_m2),
    (v_team, v_sprint, 5, 'S5', 'New',         100, timestamptz '2026-02-25 09:00+00', 0, null, true,  v_m2),
    (v_team, v_sprint, 6, 'S6', 'Done',        1,   timestamptz '2026-03-06 09:00+00', 0, 4,    false, v_m1);

  -- ---- member_sprint_days: holiday wins over PTO on the same day ----------
  select * into d from public.member_sprint_days(v_m1, date '2026-03-02', date '2026-03-13');
  assert d.gross_days   = 10, format('M1 gross_days: expected 10, got %s', d.gross_days);
  assert d.holiday_days = 1,  format('M1 holiday_days: expected 1, got %s', d.holiday_days);
  assert d.pto_days     = 0,  format('M1 pto_days: expected 0 (holiday wins), got %s', d.pto_days);
  assert d.net_days     = 9,  format('M1 net_days: expected 9, got %s', d.net_days);

  select * into d from public.member_sprint_days(v_m2, date '2026-03-02', date '2026-03-13');
  assert d.gross_days   = 10, format('M2 gross_days: expected 10, got %s', d.gross_days);
  assert d.holiday_days = 0,  format('M2 holiday_days: expected 0 (no country), got %s', d.holiday_days);
  assert d.pto_days     = 2,  format('M2 pto_days: expected 2, got %s', d.pto_days);
  assert d.net_days     = 8,  format('M2 net_days: expected 8, got %s', d.net_days);

  -- A member who left keeps the days they worked...
  select * into d from public.member_sprint_days(v_m3, date '2026-03-02', date '2026-03-13');
  assert d.gross_days  = 10, format('M3 gross_days: expected 10 (nominal), got %s', d.gross_days);
  assert d.tenure_days = 5,  format('M3 tenure_days: expected 5 (left Mar 6), got %s', d.tenure_days);
  assert d.net_days    = 5,  format('M3 net_days: expected 5, got %s', d.net_days);

  -- ...but a member deactivated with no end date contributes nothing.
  select * into d from public.member_sprint_days(v_m4, date '2026-03-02', date '2026-03-13');
  assert d.gross_days = 0, format('M4 gross_days: expected 0, got %s', d.gross_days);

  -- ---- v_sprint_velocity: the Velocity sheet ------------------------------
  select * into r from public.v_sprint_velocity where sprint_id = v_sprint;
  assert r.committed_points   = 19, format('committed_points: expected 19, got %s', r.committed_points);
  assert r.unplanned_points   = 3,  format('unplanned_points: expected 3, got %s', r.unplanned_points);
  assert r.total_points       = 19, format('total_points: expected 19, got %s', r.total_points);
  assert r.carry_over_points  = 8,  format('carry_over_points: expected 8, got %s', r.carry_over_points);
  assert r.done_points        = 11, format('done_points: expected 11, got %s', r.done_points);
  assert r.delivered_points   = 9,  format('delivered_points: expected 9, got %s', r.delivered_points);
  assert r.unverified_done_points = 2,
    format('unverified_done_points: expected 2, got %s', r.unverified_done_points);
  assert r.capacity_points    = 11, format('capacity_points: expected 11, got %s', r.capacity_points);
  assert r.removed_points     = 2,  format('removed_points: expected 2, got %s', r.removed_points);
  assert r.stories_done       = 3,  format('stories_done: expected 3, got %s', r.stories_done);
  assert r.story_count        = 6,  format('story_count: expected 6, got %s', r.story_count);
  assert round(r.done_pct, 4)       = round(11.0/19, 4),
    format('done_pct: expected %s, got %s', round(11.0/19,4), round(r.done_pct,4));
  assert round(r.carry_over_pct, 4) = round(8.0/19, 4),
    format('carry_over_pct: expected %s, got %s', round(8.0/19,4), round(r.carry_over_pct,4));
  assert r.gross_working_days  = 30, format('gross_working_days: expected 30, got %s', r.gross_working_days);
  assert r.tenure_working_days = 25, format('tenure_working_days: expected 25, got %s', r.tenure_working_days);
  assert r.net_working_days    = 22, format('net_working_days: expected 22, got %s', r.net_working_days);
  assert round(r.workday_pct, 4) = round(22.0/30, 4),
    format('workday_pct: expected %s, got %s', round(22.0/30,4), round(r.workday_pct, 4));
  -- The sprint ended in the past, so it counts as finished and the running
  -- average (one sprint) equals its Done figure.
  assert r.is_provisional = false, 'a sprint that ended in the past is not provisional';
  assert r.velocity_avg_points = 11,
    format('velocity_avg_points: expected 11, got %s', r.velocity_avg_points);

  -- ---- v_story_metrics: scope creep, override, exclusion ------------------
  assert (select is_scope_creep from public.v_story_metrics
           where sprint_id = v_sprint and ado_work_item_id = 1) = false,
    'S1 created before the sprint must not be scope creep';
  assert (select is_scope_creep from public.v_story_metrics
           where sprint_id = v_sprint and ado_work_item_id = 2) = true,
    'S2 created during the sprint must be scope creep';
  assert (select committed_points from public.v_story_metrics
           where sprint_id = v_sprint and ado_work_item_id = 6) = 4,
    'S6 must use the manual committed_points override';
  assert (select counted_points from public.v_story_metrics
           where sprint_id = v_sprint and ado_work_item_id = 5) = 0,
    'S5 is excluded from metrics and must contribute nothing';

  -- ---- v_member_sprint_capacity: per-member split -------------------------
  -- M1 owns S1(5) + S2(3) + S6(1) = 9 done points over 9 net days -> 1.0 SP/day
  select * into r from public.v_member_sprint_capacity
   where sprint_id = v_sprint and member_id = v_m1;
  assert r.completed_points = 9, format('M1 completed_points: expected 9, got %s', r.completed_points);
  assert r.points_per_day   = 1.0, format('M1 points_per_day: expected 1.0, got %s', r.points_per_day);

  -- ---- v_sprint_data_quality: the review checklist ------------------------
  assert exists (select 1 from public.v_sprint_data_quality
                  where sprint_id = v_sprint and ado_work_item_id = 4
                    and issue_code = 'REMOVED_WITH_POINTS'),
    'S4 (Removed with points) must be flagged';
  assert not exists (select 1 from public.v_sprint_data_quality
                      where sprint_id = v_sprint and ado_work_item_id = 5),
    'S5 is explicitly excluded and must not raise data-quality noise';

  raise notice 'ALL SCRUM METRICS ASSERTIONS PASSED';
end $$;

rollback;
