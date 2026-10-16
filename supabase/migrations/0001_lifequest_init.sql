-- =============================================================================
-- LifeQuest — initial Supabase schema (0001)
--
-- Optional cloud persistence for a local-first browser game. The game always
-- saves to localStorage first; this schema mirrors that state per family.
--
-- Security model (prototype):
--   * The browser only ever holds the ANON key. Every table has RLS enabled and
--     every policy is scoped `to authenticated` (anonymous-auth users are
--     `authenticated` too). The `anon` role gets no table privileges at all.
--   * A "family" is owned by the account that created it. In the single-account
--     prototype that creator is also the guardian who assigns missions.
--   * CLIENT-TRUSTED DATA: scores, XP, skill levels, wallet/money balances,
--     mission outcomes and the whole `game_saves.save` snapshot are computed in
--     the browser and written as-is. They are NOT authoritative: a player can
--     edit them. Do not use them for anything with real-world value (rewards,
--     payments, rankings) without moving the scoring to an Edge Function or
--     database function first.
--
-- The script is written to be re-runnable from the SQL editor
-- (create ... if not exists / create or replace / drop ... if exists).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- One row per auth user (created automatically by trigger further below).
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) <= 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Family members are game characters. profile_id links a member to a real
-- account (in the prototype only the player member is linked).
create table if not exists public.family_members (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families (id) on delete cascade,
  profile_id       uuid references public.profiles (id) on delete set null,
  display_name     text not null check (char_length(display_name) between 1 and 80),
  role             text not null check (role in (
                     'mother', 'father', 'player', 'older-sibling',
                     'younger-sibling', 'grandparent', 'guardian')),
  -- appearance + the game's own member id (character_config.gameId)
  character_config jsonb not null default '{}'::jsonb,
  trust            int not null default 50 check (trust between 0 and 100),
  created_at       timestamptz not null default now(),
  -- lets assigned_missions use a composite FK so a mission can only be
  -- assigned to a member of the same family
  unique (family_id, id)
);

-- Read-only catalogue, maintained via seed.sql / service role only.
create table if not exists public.mission_templates (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  description text not null default '',
  category    text not null,
  difficulty  int not null check (difficulty between 1 and 3),
  definition  jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.assigned_missions (
  id                    uuid primary key default gen_random_uuid(),
  family_id             uuid not null references public.families (id) on delete cascade,
  assigned_to_member_id uuid not null,
  assigned_by_member_id uuid references public.family_members (id) on delete set null,
  template_id           uuid not null references public.mission_templates (id) on delete restrict,
  status                text not null default 'assigned' check (status in (
                          'available', 'assigned', 'in-progress', 'blocked',
                          'completed', 'incomplete', 'cancelled')),
  deadline_minutes      int check (deadline_minutes is null or deadline_minutes > 0),
  budget                numeric(10, 2) check (budget is null or budget >= 0),
  note                  text check (note is null or char_length(note) <= 500),
  -- client state; holds the game's assignment id as state.gameAssignmentId
  state                 jsonb not null default '{}'::jsonb,
  assigned_at           timestamptz not null default now(),
  completed_at          timestamptz,
  foreign key (family_id, assigned_to_member_id)
    references public.family_members (family_id, id) on delete cascade
);

-- CLIENT-TRUSTED: progress/outcome (including scores) are computed in the browser.
create table if not exists public.mission_progress (
  id                  uuid primary key default gen_random_uuid(),
  assigned_mission_id uuid not null unique references public.assigned_missions (id) on delete cascade,
  current_objective   text,
  progress            jsonb not null default '{}'::jsonb,
  outcome             jsonb,
  updated_at          timestamptz not null default now()
);

create table if not exists public.player_inventory (
  id               uuid primary key default gen_random_uuid(),
  family_member_id uuid not null unique references public.family_members (id) on delete cascade,
  items            jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);

-- CLIENT-TRUSTED: experience, skill levels and money are game numbers computed
-- in the browser. Not authoritative.
create table if not exists public.player_stats (
  id               uuid primary key default gen_random_uuid(),
  family_member_id uuid not null unique references public.family_members (id) on delete cascade,
  experience       int not null default 0 check (experience >= 0),
  skill_levels     jsonb not null default '{}'::jsonb,
  money_balance    numeric(12, 2) not null default 0,
  updated_at       timestamptz not null default now()
);

-- Full local snapshot (the GameState object) — one per family.
-- CLIENT-TRUSTED: everything inside `save` is whatever the browser sent.
create table if not exists public.game_saves (
  family_id      uuid primary key references public.families (id) on delete cascade,
  save           jsonb not null check (pg_column_size(save) <= 2000000),
  client_version int,
  updated_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Indexes on foreign keys / policy columns
-- (unique constraints already index mission_progress, player_inventory,
--  player_stats and game_saves keys)
-- -----------------------------------------------------------------------------
create index if not exists families_created_by_idx            on public.families (created_by);
create index if not exists family_members_family_id_idx       on public.family_members (family_id);
create index if not exists family_members_profile_id_idx      on public.family_members (profile_id);
create index if not exists assigned_missions_family_id_idx    on public.assigned_missions (family_id);
create index if not exists assigned_missions_assigned_to_idx  on public.assigned_missions (assigned_to_member_id);
create index if not exists assigned_missions_assigned_by_idx  on public.assigned_missions (assigned_by_member_id);
create index if not exists assigned_missions_template_id_idx  on public.assigned_missions (template_id);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists mission_progress_set_updated_at on public.mission_progress;
create trigger mission_progress_set_updated_at before update on public.mission_progress
  for each row execute function public.set_updated_at();

drop trigger if exists player_inventory_set_updated_at on public.player_inventory;
create trigger player_inventory_set_updated_at before update on public.player_inventory
  for each row execute function public.set_updated_at();

drop trigger if exists player_stats_set_updated_at on public.player_stats;
create trigger player_stats_set_updated_at before update on public.player_stats
  for each row execute function public.set_updated_at();

drop trigger if exists game_saves_set_updated_at on public.game_saves;
create trigger game_saves_set_updated_at before update on public.game_saves
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER so policies can check membership
-- without recursing through each other's RLS). They only answer questions
-- about the *calling* user (auth.uid()), so exposing them via RPC leaks
-- nothing beyond "am I in family X?". All names are schema-qualified.
-- -----------------------------------------------------------------------------
create or replace function public.is_family_member(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.families f
           where f.id = fid and f.created_by = auth.uid()
         )
      or exists (
           select 1 from public.family_members m
           where m.family_id = fid and m.profile_id = auth.uid()
         );
$$;

create or replace function public.is_family_guardian(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.families f
           where f.id = fid and f.created_by = auth.uid()
         )
      or exists (
           select 1 from public.family_members m
           where m.family_id = fid
             and m.profile_id = auth.uid()
             and m.role in ('mother', 'father', 'grandparent', 'guardian')
         );
$$;

-- family id of a family_members row (used by per-member table policies)
create or replace function public.member_family_id(mid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.family_id from public.family_members m where m.id = mid;
$$;

-- family id of an assigned_missions row (used by mission_progress policies)
create or replace function public.assigned_mission_family_id(aid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.family_id from public.assigned_missions a where a.id = aid;
$$;

revoke all on function public.is_family_member(uuid)           from public, anon;
revoke all on function public.is_family_guardian(uuid)         from public, anon;
revoke all on function public.member_family_id(uuid)           from public, anon;
revoke all on function public.assigned_mission_family_id(uuid) from public, anon;
grant execute on function public.is_family_member(uuid)           to authenticated;
grant execute on function public.is_family_guardian(uuid)         to authenticated;
grant execute on function public.member_family_id(uuid)           to authenticated;
grant execute on function public.assigned_mission_family_id(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Create a profile row for every new auth user (including anonymous users)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Player'), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- assigned_missions guard:
--   * players may update progress fields (status, state, completed_at)
--   * only a guardian may change the assignment itself
--   * assigned_by must belong to the same family
-- Privileged contexts (SQL editor / service role) have no auth.uid() and skip
-- the guardian check.
-- -----------------------------------------------------------------------------
create or replace function public.assigned_missions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.assigned_by_member_id is not null and not exists (
       select 1 from public.family_members m
       where m.id = new.assigned_by_member_id and m.family_id = new.family_id
     ) then
    raise exception 'assigned_by_member_id must belong to the same family'
      using errcode = '23503';
  end if;

  if tg_op = 'UPDATE' and auth.uid() is not null
     and (new.family_id, new.assigned_to_member_id, new.assigned_by_member_id,
          new.template_id, new.deadline_minutes, new.budget, new.note)
         is distinct from
         (old.family_id, old.assigned_to_member_id, old.assigned_by_member_id,
          old.template_id, old.deadline_minutes, old.budget, old.note)
     and not public.is_family_guardian(old.family_id) then
    raise exception 'Only a family guardian can change mission assignment details'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists assigned_missions_guard on public.assigned_missions;
create trigger assigned_missions_guard
  before insert or update on public.assigned_missions
  for each row execute function public.assigned_missions_guard();

-- -----------------------------------------------------------------------------
-- Privileges. Supabase grants everything on public tables to anon and
-- authenticated by default; RLS is the real gate, but we also trim grants as
-- defence in depth. No DELETE is exposed to clients in the prototype
-- (deleting the auth user cascades everything).
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.families, public.family_members,
              public.mission_templates, public.assigned_missions,
              public.mission_progress, public.player_inventory,
              public.player_stats, public.game_saves
  from anon;

revoke delete, truncate on public.profiles, public.families, public.family_members,
              public.mission_templates, public.assigned_missions,
              public.mission_progress, public.player_inventory,
              public.player_stats, public.game_saves
  from authenticated;

-- templates are read-only for clients
revoke insert, update on public.mission_templates from authenticated;

-- families: clients may only rename (created_by can never be reassigned)
revoke update on public.families from authenticated;
grant update (name) on public.families to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.families          enable row level security;
alter table public.family_members    enable row level security;
alter table public.mission_templates enable row level security;
alter table public.assigned_missions enable row level security;
alter table public.mission_progress  enable row level security;
alter table public.player_inventory  enable row level security;
alter table public.player_stats      enable row level security;
alter table public.game_saves        enable row level security;

-- profiles: own row only -------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- families ---------------------------------------------------------------------
-- The inline created_by check matters: INSERT ... RETURNING evaluates the
-- SELECT policy against the new row, which a STABLE helper cannot yet see.
drop policy if exists families_select_member on public.families;
create policy families_select_member on public.families
  for select to authenticated
  using (created_by = (select auth.uid()) or public.is_family_member(id));

drop policy if exists families_insert_own on public.families;
create policy families_insert_own on public.families
  for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists families_update_member on public.families;
create policy families_update_member on public.families
  for update to authenticated
  using (public.is_family_member(id))
  with check (public.is_family_member(id));

-- family_members ---------------------------------------------------------------
-- Members may add/edit characters, but only a guardian may create guardian-type
-- roles or link a member to someone else's account (prevents self-promotion).
drop policy if exists family_members_select_member on public.family_members;
create policy family_members_select_member on public.family_members
  for select to authenticated
  using (public.is_family_member(family_id));

drop policy if exists family_members_insert_member on public.family_members;
create policy family_members_insert_member on public.family_members
  for insert to authenticated
  with check (
    public.is_family_member(family_id)
    and (
      public.is_family_guardian(family_id)
      or (role not in ('mother', 'father', 'grandparent', 'guardian')
          and (profile_id is null or profile_id = (select auth.uid())))
    )
  );

drop policy if exists family_members_update_member on public.family_members;
create policy family_members_update_member on public.family_members
  for update to authenticated
  using (public.is_family_member(family_id))
  with check (
    public.is_family_member(family_id)
    and (
      public.is_family_guardian(family_id)
      or (role not in ('mother', 'father', 'grandparent', 'guardian')
          and (profile_id is null or profile_id = (select auth.uid())))
    )
  );

-- mission_templates: active templates readable by any signed-in user ------------
drop policy if exists mission_templates_select_active on public.mission_templates;
create policy mission_templates_select_active on public.mission_templates
  for select to authenticated
  using (is_active);

-- assigned_missions ------------------------------------------------------------
-- INSERT: guardians only. UPDATE: any member, but the guard trigger above
-- rejects changes to assignment fields unless the caller is a guardian.
-- In the single-account prototype the family creator is the guardian.
drop policy if exists assigned_missions_select_member on public.assigned_missions;
create policy assigned_missions_select_member on public.assigned_missions
  for select to authenticated
  using (public.is_family_member(family_id));

drop policy if exists assigned_missions_insert_guardian on public.assigned_missions;
create policy assigned_missions_insert_guardian on public.assigned_missions
  for insert to authenticated
  with check (public.is_family_guardian(family_id));

drop policy if exists assigned_missions_update_member on public.assigned_missions;
create policy assigned_missions_update_member on public.assigned_missions
  for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- mission_progress (CLIENT-TRUSTED outcome/scores) -----------------------------
drop policy if exists mission_progress_select_member on public.mission_progress;
create policy mission_progress_select_member on public.mission_progress
  for select to authenticated
  using (public.is_family_member(public.assigned_mission_family_id(assigned_mission_id)));

drop policy if exists mission_progress_insert_member on public.mission_progress;
create policy mission_progress_insert_member on public.mission_progress
  for insert to authenticated
  with check (public.is_family_member(public.assigned_mission_family_id(assigned_mission_id)));

drop policy if exists mission_progress_update_member on public.mission_progress;
create policy mission_progress_update_member on public.mission_progress
  for update to authenticated
  using (public.is_family_member(public.assigned_mission_family_id(assigned_mission_id)))
  with check (public.is_family_member(public.assigned_mission_family_id(assigned_mission_id)));

-- player_inventory -------------------------------------------------------------
drop policy if exists player_inventory_select_member on public.player_inventory;
create policy player_inventory_select_member on public.player_inventory
  for select to authenticated
  using (public.is_family_member(public.member_family_id(family_member_id)));

drop policy if exists player_inventory_insert_member on public.player_inventory;
create policy player_inventory_insert_member on public.player_inventory
  for insert to authenticated
  with check (public.is_family_member(public.member_family_id(family_member_id)));

drop policy if exists player_inventory_update_member on public.player_inventory;
create policy player_inventory_update_member on public.player_inventory
  for update to authenticated
  using (public.is_family_member(public.member_family_id(family_member_id)))
  with check (public.is_family_member(public.member_family_id(family_member_id)));

-- player_stats (CLIENT-TRUSTED xp/skills/money) --------------------------------
drop policy if exists player_stats_select_member on public.player_stats;
create policy player_stats_select_member on public.player_stats
  for select to authenticated
  using (public.is_family_member(public.member_family_id(family_member_id)));

drop policy if exists player_stats_insert_member on public.player_stats;
create policy player_stats_insert_member on public.player_stats
  for insert to authenticated
  with check (public.is_family_member(public.member_family_id(family_member_id)));

drop policy if exists player_stats_update_member on public.player_stats;
create policy player_stats_update_member on public.player_stats
  for update to authenticated
  using (public.is_family_member(public.member_family_id(family_member_id)))
  with check (public.is_family_member(public.member_family_id(family_member_id)));

-- game_saves (CLIENT-TRUSTED full snapshot) ------------------------------------
drop policy if exists game_saves_select_member on public.game_saves;
create policy game_saves_select_member on public.game_saves
  for select to authenticated
  using (public.is_family_member(family_id));

drop policy if exists game_saves_insert_member on public.game_saves;
create policy game_saves_insert_member on public.game_saves
  for insert to authenticated
  with check (public.is_family_member(family_id));

drop policy if exists game_saves_update_member on public.game_saves;
create policy game_saves_update_member on public.game_saves
  for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));
