-- ============================================================================
-- Carrito 0005 — capacity by category
--
-- "How many points did we spend on <feature> across these sprints?" Each story
-- can carry tags (Admin, Dev, DigitSec, Trust360, …); this explodes them so any
-- tag becomes a category you can total points against, per sprint.
--
-- A story with two tags contributes to BOTH categories — that is intended
-- ("how much did we spend on X" counts a shared story under each X), so summing
-- points across categories can exceed the sprint total. Story counts likewise.
--
-- Carry-over bookkeeping tags ("carry-over 26.14", "COLS") are dropped — they
-- mark spill history, not a feature.
--
-- Run in Supabase → SQL Editor AFTER 0003_scrum_metrics.sql. Idempotent.
-- ============================================================================

create or replace view public.v_story_category_points as
select
  v.team_id,
  v.sprint_id,
  v.sprint_name,
  v.sprint_start,
  lower(btrim(tag))                        as category,
  min(btrim(tag))                          as category_label,  -- a representative original casing
  count(*)::int                            as story_count,
  round(sum(v.committed_points), 1)        as committed_points,
  round(sum(v.done_points), 1)             as done_points,
  round(sum(v.delivered_points), 1)        as delivered_points,
  round(sum(v.counted_points), 1)          as total_points,
  round(sum(v.carry_over_points), 1)       as carry_over_points
from public.v_story_metrics v
cross join lateral unnest(coalesce(v.tags, array[]::text[])) as tag
where not v.excluded_from_metrics
  and btrim(tag) <> ''
  -- drop carry-over / spill bookkeeping tags; they are not categories
  and lower(btrim(tag)) !~ '^(carry[ -]?over|cols)\y'
group by v.team_id, v.sprint_id, v.sprint_name, v.sprint_start, lower(btrim(tag));

alter view public.v_story_category_points set (security_invoker = on);
comment on view public.v_story_category_points is
  'Story points per tag (category) per sprint. A story with N tags is counted under each; carry-over bookkeeping tags are excluded.';

grant select on public.v_story_category_points to authenticated;
