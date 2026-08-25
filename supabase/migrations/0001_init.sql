-- ============================================================================
-- Carrito — initial schema, security, triggers, seed
-- Paste this whole file into Supabase → SQL Editor and run once.
-- It is written to be idempotent (safe to re-run).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "btree_gist";

-- ---------------------------------------------------------------------------
-- 1. Enums (guarded so re-runs don't fail)
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'member');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'work_item_state') then
    create type public.work_item_state as enum
      ('new','active','resolved','closed','removed','committed','done');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'pto_type') then
    create type public.pto_type as enum ('vacation','sick','personal','other');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Shared helper functions
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Non-recursive admin check. SECURITY DEFINER bypasses RLS on profiles.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       citext not null,
  full_name   text,
  role        public.app_role not null default 'member',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists profiles_email_key on public.profiles (email);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. Lookups: roles, seniorities
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint roles_name_key unique (name)
);

create table if not exists public.seniorities (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  focus_modifier numeric(4,2) not null default 1.00 check (focus_modifier >= 0),
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint seniorities_name_key unique (name)
);

drop trigger if exists trg_roles_updated on public.roles;
create trigger trg_roles_updated before update on public.roles
  for each row execute function public.set_updated_at();
drop trigger if exists trg_seniorities_updated on public.seniorities;
create trigger trg_seniorities_updated before update on public.seniorities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. teams & members
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint teams_name_key unique (name)
);

create table if not exists public.members (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete set null,
  full_name     text not null,
  email         citext,
  country_code  char(2) not null,
  region_code   text,
  role_id       uuid references public.roles(id) on delete set null,
  seniority_id  uuid references public.seniorities(id) on delete set null,
  hours_per_day  numeric(4,2) not null default 8.00 check (hours_per_day >= 0),
  focus_factor   numeric(4,2) check (focus_factor is null or (focus_factor > 0 and focus_factor <= 1)),
  points_per_day numeric(6,2) check (points_per_day is null or points_per_day >= 0),
  min_capacity_days numeric(6,2) check (min_capacity_days is null or min_capacity_days >= 0),
  start_date    date,
  end_date      date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint members_country_upper check (country_code = upper(country_code))
);
create index if not exists members_team_idx on public.members (team_id);
create index if not exists members_profile_idx on public.members (profile_id);
create unique index if not exists members_team_email_key
  on public.members (team_id, email) where email is not null;

drop trigger if exists trg_teams_updated on public.teams;
create trigger trg_teams_updated before update on public.teams
  for each row execute function public.set_updated_at();
drop trigger if exists trg_members_updated on public.members;
create trigger trg_members_updated before update on public.members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. sprints
-- ---------------------------------------------------------------------------
create table if not exists public.sprints (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  name          text not null,
  ado_iteration_path text,
  start_date    date not null,
  end_date      date not null,
  working_days  int check (working_days is null or working_days >= 0),
  velocity_committed_points numeric(8,2),
  velocity_completed_points numeric(8,2),
  is_closed     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint sprints_dates_ck check (end_date >= start_date),
  constraint sprints_team_name_key unique (team_id, name)
);
create index if not exists sprints_team_dates_idx on public.sprints (team_id, start_date, end_date);

drop trigger if exists trg_sprints_updated on public.sprints;
create trigger trg_sprints_updated before update on public.sprints
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. holidays & pto
-- ---------------------------------------------------------------------------
create table if not exists public.holidays (
  id           uuid primary key default gen_random_uuid(),
  country_code char(2) not null,
  region_code  text,
  holiday_date date not null,
  name         text not null,
  is_manual    boolean not null default false,
  team_id      uuid references public.teams(id) on delete cascade,
  source       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint holidays_country_upper check (country_code = upper(country_code))
);
create unique index if not exists holidays_natural_key
  on public.holidays (country_code, coalesce(region_code,''), holiday_date,
                      coalesce(team_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists holidays_date_idx on public.holidays (holiday_date);

create table if not exists public.pto (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id) on delete cascade,
  start_date   date not null,
  end_date     date not null,
  pto_type     public.pto_type not null default 'vacation',
  day_fraction numeric(3,2) not null default 1.00 check (day_fraction > 0 and day_fraction <= 1),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint pto_dates_ck check (end_date >= start_date),
  constraint pto_no_overlap
    exclude using gist (member_id with =, daterange(start_date, end_date, '[]') with &&)
);
create index if not exists pto_member_idx on public.pto (member_id);

drop trigger if exists trg_holidays_updated on public.holidays;
create trigger trg_holidays_updated before update on public.holidays
  for each row execute function public.set_updated_at();
drop trigger if exists trg_pto_updated on public.pto;
create trigger trg_pto_updated before update on public.pto
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. settings / parameters + branding (single global row where team_id is null)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid references public.teams(id) on delete cascade,
  default_focus_factor  numeric(4,2) not null default 0.80
                          check (default_focus_factor > 0 and default_focus_factor <= 1),
  points_per_day        numeric(6,2) not null default 1.00 check (points_per_day >= 0),
  min_capacity_per_member numeric(6,2) not null default 0 check (min_capacity_per_member >= 0),
  default_sprint_length_days int not null default 14 check (default_sprint_length_days > 0),
  working_days_per_week  int not null default 5 check (working_days_per_week between 1 and 7),
  working_weekdays       int[] not null default '{1,2,3,4,5}',
  -- Warning thresholds (fractions)
  warn_capacity_drop     numeric(4,2) not null default 0.15,
  crit_capacity_drop     numeric(4,2) not null default 0.30,
  warn_over_commit       numeric(4,2) not null default 1.00,
  crit_over_commit       numeric(4,2) not null default 1.15,
  warn_carryover_ratio   numeric(4,2) not null default 0.30,
  crit_carryover_ratio   numeric(4,2) not null default 0.50,
  warn_pto_cluster       numeric(4,2) not null default 0.30,
  crit_pto_cluster       numeric(4,2) not null default 0.50,
  -- Velocity bridge (optional; fill after a few sprints)
  velocity_avg_points        numeric(8,2),
  velocity_avg_person_days   numeric(8,2),
  -- Branding
  company_name          text,
  logo_url              text,
  brand_primary_color   text check (brand_primary_color is null or brand_primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  brand_secondary_color text check (brand_secondary_color is null or brand_secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists settings_team_key
  on public.settings (coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists trg_settings_updated on public.settings;
create trigger trg_settings_updated before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. ADO import provenance + user stories
-- ---------------------------------------------------------------------------
create table if not exists public.import_batches (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  sprint_id       uuid references public.sprints(id) on delete set null,
  imported_by     uuid references public.profiles(id) on delete set null,
  source_filename text,
  row_count       int,
  raw_headers     jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists import_batches_team_idx on public.import_batches (team_id, created_at desc);

create table if not exists public.user_stories (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.teams(id) on delete cascade,
  sprint_id          uuid references public.sprints(id) on delete set null,
  ado_work_item_id   bigint not null,
  ado_iteration_path text,
  title              text not null,
  work_item_type     text,
  state_raw          text,
  state_normalized   public.work_item_state,
  story_points       numeric(6,2) check (story_points is null or story_points >= 0),
  priority           int,
  assignee_member_id uuid references public.members(id) on delete set null,
  assignee_raw       text,
  assignee_email     citext,
  is_carry_over      boolean not null default false,
  tags               text[] not null default '{}',
  raw                jsonb not null default '{}',
  import_batch_id    uuid references public.import_batches(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint user_stories_ado_sprint_key unique (ado_work_item_id, sprint_id)
);
create index if not exists user_stories_sprint_idx on public.user_stories (sprint_id);
create index if not exists user_stories_team_idx on public.user_stories (team_id);
create index if not exists user_stories_assignee_idx on public.user_stories (assignee_member_id);
create index if not exists user_stories_carry_idx on public.user_stories (sprint_id) where is_carry_over;
create index if not exists user_stories_tags_gin on public.user_stories using gin (tags);

drop trigger if exists trg_user_stories_updated on public.user_stories;
create trigger trg_user_stories_updated before update on public.user_stories
  for each row execute function public.set_updated_at();

-- Auto-detect carry-over on INSERT only (manual toggles are preserved on UPDATE).
create or replace function public.set_story_carry_over()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_start date;
  v_prior boolean;
begin
  if new.sprint_id is null then
    return new;
  end if;
  select start_date into v_start from public.sprints where id = new.sprint_id;
  if v_start is null then
    return new;
  end if;
  select exists (
    select 1
    from public.user_stories us
    join public.sprints s on s.id = us.sprint_id
    where us.ado_work_item_id = new.ado_work_item_id
      and us.team_id = new.team_id
      and us.sprint_id is distinct from new.sprint_id
      and s.start_date < v_start
  ) into v_prior;
  if v_prior and lower(coalesce(new.state_raw,'')) not in ('done','closed','resolved','removed') then
    new.is_carry_over := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_story_carry_over on public.user_stories;
create trigger trg_story_carry_over
  before insert on public.user_stories
  for each row execute function public.set_story_carry_over();

-- Guard: non-admins may only change is_carry_over (and updated_at) on user_stories.
create or replace function public.guard_story_member_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.team_id            is distinct from old.team_id            or
     new.sprint_id          is distinct from old.sprint_id          or
     new.ado_work_item_id   is distinct from old.ado_work_item_id   or
     new.ado_iteration_path is distinct from old.ado_iteration_path or
     new.title              is distinct from old.title              or
     new.work_item_type     is distinct from old.work_item_type     or
     new.state_raw          is distinct from old.state_raw          or
     new.state_normalized   is distinct from old.state_normalized   or
     new.story_points       is distinct from old.story_points       or
     new.priority           is distinct from old.priority           or
     new.assignee_member_id is distinct from old.assignee_member_id or
     new.assignee_raw       is distinct from old.assignee_raw       or
     new.assignee_email     is distinct from old.assignee_email     or
     new.tags               is distinct from old.tags               or
     new.raw                is distinct from old.raw                or
     new.import_batch_id    is distinct from old.import_batch_id
  then
    raise exception 'Only the carry-over flag may be changed by non-admin users';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_story_member_update on public.user_stories;
create trigger trg_guard_story_member_update
  before update on public.user_stories
  for each row execute function public.guard_story_member_update();

-- ---------------------------------------------------------------------------
-- 10. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.roles          enable row level security;
alter table public.seniorities    enable row level security;
alter table public.teams          enable row level security;
alter table public.members        enable row level security;
alter table public.sprints        enable row level security;
alter table public.holidays       enable row level security;
alter table public.pto            enable row level security;
alter table public.settings       enable row level security;
alter table public.import_batches enable row level security;
alter table public.user_stories   enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- profiles
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and role = 'member');

-- Read-all / admin-write helper applied to config + data tables
drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated using (true);
drop policy if exists roles_admin_write on public.roles;
create policy roles_admin_write on public.roles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists sen_read on public.seniorities;
create policy sen_read on public.seniorities for select to authenticated using (true);
drop policy if exists sen_admin_write on public.seniorities;
create policy sen_admin_write on public.seniorities for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select to authenticated using (true);
drop policy if exists teams_admin_write on public.teams;
create policy teams_admin_write on public.teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (true);
drop policy if exists members_admin_write on public.members;
create policy members_admin_write on public.members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists sprints_read on public.sprints;
create policy sprints_read on public.sprints for select to authenticated using (true);
drop policy if exists sprints_admin_write on public.sprints;
create policy sprints_admin_write on public.sprints for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists holidays_read on public.holidays;
create policy holidays_read on public.holidays for select to authenticated using (true);
drop policy if exists holidays_admin_write on public.holidays;
create policy holidays_admin_write on public.holidays for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists pto_read on public.pto;
create policy pto_read on public.pto for select to authenticated using (true);
drop policy if exists pto_admin_write on public.pto;
create policy pto_admin_write on public.pto for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (true);
drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists batches_read on public.import_batches;
create policy batches_read on public.import_batches for select to authenticated using (true);
drop policy if exists batches_admin_write on public.import_batches;
create policy batches_admin_write on public.import_batches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- user_stories: read-all; admin full; normal members may UPDATE (guarded to carry-over only)
drop policy if exists stories_read on public.user_stories;
create policy stories_read on public.user_stories for select to authenticated using (true);
drop policy if exists stories_admin_all on public.user_stories;
create policy stories_admin_all on public.user_stories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists stories_member_update on public.user_stories;
create policy stories_member_update on public.user_stories for update to authenticated
  using (not public.is_admin()) with check (not public.is_admin());

-- ---------------------------------------------------------------------------
-- 11. Storage bucket for branding logo (public read, authenticated write)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "branding public read" on storage.objects;
create policy "branding public read" on storage.objects
  for select using (bucket_id = 'branding');
drop policy if exists "branding auth write" on storage.objects;
create policy "branding auth write" on storage.objects
  for insert to authenticated with check (bucket_id = 'branding');
drop policy if exists "branding auth update" on storage.objects;
create policy "branding auth update" on storage.objects
  for update to authenticated using (bucket_id = 'branding');
drop policy if exists "branding auth delete" on storage.objects;
create policy "branding auth delete" on storage.objects
  for delete to authenticated using (bucket_id = 'branding');

-- ---------------------------------------------------------------------------
-- 12. Seed defaults
-- ---------------------------------------------------------------------------
insert into public.roles (name, sort_order) values
  ('Developer',1),('QA',2),('Tech Lead',3),('Support',4)
  on conflict (name) do nothing;

insert into public.seniorities (name, focus_modifier, sort_order) values
  ('Junior',0.80,1),('Semi-Senior',0.90,2),('Senior',1.00,3),('Lead',1.00,4)
  on conflict (name) do nothing;

insert into public.settings (team_id) values (null)
  on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 13. Backfill profiles for anyone who signed up BEFORE this migration ran.
--     (The handle_new_user trigger only fires on new signups, so existing
--      auth users would otherwise have no profiles row and get bounced to /login.)
-- ---------------------------------------------------------------------------
insert into public.profiles (id, email, full_name)
select u.id, u.email,
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')
from auth.users u
where u.email is not null
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 14. First admin bootstrap (edit the email to yours).
-- ---------------------------------------------------------------------------
update public.profiles set role = 'admin'
  where email = 'c.juarez@globant.com';
