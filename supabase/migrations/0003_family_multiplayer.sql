-- =============================================================================
-- LifeQuest — family multiplayer (0003)
--
-- Password-free family play. A parent creates a family and gets two codes:
--   * FAMILY code (e.g. SUNNY-7KD2-Q9XM): children join with it
--   * PARENT code (e.g. P-7KD2Q-9XMRT): other parents/guardians join with it,
--     so a child can never claim a parent seat.
-- Every device signs in anonymously and claims one family member ("seat").
--
-- Security model (builds on 0001):
--   * family_members.claimed_by = the auth uid of the device playing the seat.
--     Claiming also sets profile_id, so the 0001 helpers (is_family_member /
--     is_family_guardian) keep working: parent seats use guardian roles.
--   * Seats are only claimed/created/released through the SECURITY DEFINER RPCs
--     below. A trigger stops clients from changing seat identity columns
--     (claimed_by, profile_id, role, kind, game_member_id) directly unless they
--     are a guardian of that family.
--   * parent_code is NOT selectable by clients (column privileges); parents get
--     it from create_family / join_family / get_family_codes / regenerate_codes.
--   * preview_code / join_family are rate limited per auth uid (20 per 10 min)
--     and per client IP (60 per 10 min). Codes carry >= 45 bits of entropy.
--   * CLIENT-TRUSTED (as in 0001): saves and live status are written by the
--     browser and are not authoritative.
--
-- Re-runnable: create ... if not exists / create or replace / drop ... if exists.
-- Nothing here deletes or rewrites existing rows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- families: codes + shared profile/settings
-- -----------------------------------------------------------------------------
alter table public.families add column if not exists family_code text;
alter table public.families add column if not exists parent_code text;
alter table public.families add column if not exists profile     jsonb;
alter table public.families add column if not exists settings    jsonb;
alter table public.families add column if not exists updated_at  timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'families_family_code_key') then
    alter table public.families add constraint families_family_code_key unique (family_code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'families_parent_code_key') then
    alter table public.families add constraint families_parent_code_key unique (parent_code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'families_profile_size') then
    alter table public.families add constraint families_profile_size
      check (profile is null or pg_column_size(profile) <= 200000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'families_settings_size') then
    alter table public.families add constraint families_settings_size
      check (settings is null or pg_column_size(settings) <= 50000);
  end if;
end
$$;

-- codes are looked up without their dashes (users may type them without)
create index if not exists families_family_code_norm_idx
  on public.families ((replace(family_code, '-', ''))) where family_code is not null;
create index if not exists families_parent_code_norm_idx
  on public.families ((replace(parent_code, '-', ''))) where parent_code is not null;

drop trigger if exists families_set_updated_at on public.families;
create trigger families_set_updated_at before update on public.families
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- family_members: seats
-- -----------------------------------------------------------------------------
alter table public.family_members add column if not exists kind           text;
alter table public.family_members add column if not exists game_member_id text;
alter table public.family_members add column if not exists claimed_by     uuid references auth.users (id) on delete set null;
alter table public.family_members add column if not exists last_seen      timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'family_members_kind_check') then
    alter table public.family_members add constraint family_members_kind_check
      check (kind is null or kind in ('parent', 'child'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'family_members_game_member_id_len') then
    alter table public.family_members add constraint family_members_game_member_id_len
      check (game_member_id is null or char_length(game_member_id) between 1 and 64);
  end if;
end
$$;

create unique index if not exists family_members_game_member_id_key
  on public.family_members (family_id, game_member_id) where game_member_id is not null;
create index if not exists family_members_claimed_by_idx on public.family_members (claimed_by);

-- -----------------------------------------------------------------------------
-- assigned_missions: game ids so devices can talk about the same assignment
-- -----------------------------------------------------------------------------
alter table public.assigned_missions add column if not exists mission_id         text;
alter table public.assigned_missions add column if not exists game_assignment_id text;
alter table public.assigned_missions add column if not exists result_id          text;
-- missions without a seeded template (e.g. new content) are stored by mission_id
alter table public.assigned_missions alter column template_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assigned_missions_mission_ref') then
    alter table public.assigned_missions add constraint assigned_missions_mission_ref
      check (template_id is not null or mission_id is not null) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assigned_missions_game_ids_len') then
    alter table public.assigned_missions add constraint assigned_missions_game_ids_len
      check ((mission_id is null or char_length(mission_id) <= 64)
         and (game_assignment_id is null or char_length(game_assignment_id) <= 64)
         and (result_id is null or char_length(result_id) <= 64)) not valid;
  end if;
end
$$;

-- full (not partial) unique index so clients can upsert on it; NULLs stay distinct
drop index if exists public.assigned_missions_game_assignment_key;
create unique index if not exists assigned_missions_family_game_assignment_key
  on public.assigned_missions (family_id, game_assignment_id);

-- -----------------------------------------------------------------------------
-- New tables
-- -----------------------------------------------------------------------------

-- Each seat's own game save (a child's GameState). CLIENT-TRUSTED.
create table if not exists public.member_saves (
  member_id  uuid primary key references public.family_members (id) on delete cascade,
  save       jsonb not null check (pg_column_size(save) <= 2000000),
  updated_at timestamptz not null default now()
);

-- Live status a child's game publishes for the parent dashboard. CLIENT-TRUSTED.
create table if not exists public.member_status (
  member_id  uuid primary key,
  family_id  uuid not null references public.families (id) on delete cascade,
  status     jsonb not null check (pg_column_size(status) <= 20000),
  updated_at timestamptz not null default now(),
  foreign key (family_id, member_id)
    references public.family_members (family_id, id) on delete cascade
);
create index if not exists member_status_family_id_idx on public.member_status (family_id);

-- Nudges / messages between family members (to_member_id null = whole family).
create table if not exists public.family_messages (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families (id) on delete cascade,
  from_member_id uuid not null,
  to_member_id   uuid,
  text           text not null check (char_length(text) between 1 and 280),
  created_at     timestamptz not null default now(),
  foreign key (family_id, from_member_id)
    references public.family_members (family_id, id) on delete cascade,
  -- same-family recipients only (no cross-family messages)
  foreign key (family_id, to_member_id)
    references public.family_members (family_id, id) on delete cascade
);
create index if not exists family_messages_family_created_idx on public.family_messages (family_id, created_at desc);
create index if not exists family_messages_from_idx on public.family_messages (from_member_id);
create index if not exists family_messages_to_idx   on public.family_messages (to_member_id);

-- Brute-force protection for code lookups. No client access at all.
create table if not exists public.code_attempts (
  id           bigint generated always as identity primary key,
  uid          uuid,
  ip           text,
  attempted_at timestamptz not null default now()
);
create index if not exists code_attempts_uid_idx on public.code_attempts (uid, attempted_at);
create index if not exists code_attempts_ip_idx  on public.code_attempts (ip, attempted_at);
create index if not exists code_attempts_at_idx  on public.code_attempts (attempted_at);

drop trigger if exists member_saves_set_updated_at on public.member_saves;
create trigger member_saves_set_updated_at before update on public.member_saves
  for each row execute function public.set_updated_at();

drop trigger if exists member_status_set_updated_at on public.member_status;
create trigger member_status_set_updated_at before update on public.member_status
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER, only answer questions about the caller)
-- -----------------------------------------------------------------------------

-- true when the calling device holds (plays) seat mid
create or replace function public.is_seat_holder(mid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_members m
    where m.id = mid and m.claimed_by = auth.uid()
  );
$$;

revoke all on function public.is_seat_holder(uuid) from public, anon;
grant execute on function public.is_seat_holder(uuid) to authenticated;

-- n random characters from the unambiguous alphabet (no 0/O/1/I/L);
-- rejection sampling over gen_random_uuid() bytes (CSPRNG) avoids modulo bias.
create or replace function public.lq_random_code_chars(n int)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- 31 chars
  out_text text := '';
  buf bytea;
  b int;
  i int;
begin
  while char_length(out_text) < n loop
    buf := uuid_send(gen_random_uuid());
    for i in 0..15 loop
      -- skip the uuid version/variant bytes (not fully random)
      continue when i in (6, 8);
      b := get_byte(buf, i);
      continue when b >= 248; -- 248 = 31 * 8
      out_text := out_text || substr(alphabet, (b % 31) + 1, 1);
      exit when char_length(out_text) >= n;
    end loop;
  end loop;
  return out_text;
end;
$$;

-- FAMILY code: WORD-XXXX-XXXX  (64 words = 6 bits + 8 chars * 4.95 bits = ~45.6 bits)
create or replace function public.lq_new_family_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  words constant text[] := array[
    'SUNNY','HAPPY','BRAVE','CLEVER','MANGO','TIGER','PANDA','RIVER',
    'MAPLE','CORAL','EMBER','FROST','HONEY','JOLLY','KOALA','LEMON',
    'MAGIC','NOBLE','OCEAN','PEARL','QUICK','ROBIN','STORM','TULIP',
    'UNITY','VIVID','WHALE','ZEBRA','AMBER','BERRY','CEDAR','DAISY',
    'EAGLE','FABLE','GRAPE','HAZEL','IVORY','JADE','KITE','LOTUS',
    'MELON','NOVA','OLIVE','PIXEL','QUILT','RAVEN','SPARK','THYME',
    'URBAN','VELVET','WILLOW','YONDER','ZESTY','ACORN','BLOOM','COMET',
    'DREAM','FLAME','GLOW','HAVEN','ISLAND','JUMBO','KARMA','LUCKY'
  ];
  b int;
begin
  b := get_byte(uuid_send(gen_random_uuid()), 0) % 64; -- 256 % 64 = 0: unbiased
  return words[b + 1] || '-' || public.lq_random_code_chars(4) || '-' || public.lq_random_code_chars(4);
end;
$$;

-- PARENT code: P-XXXXX-XXXXX  (10 chars = ~49.5 bits)
create or replace function public.lq_new_parent_code()
returns text
language sql
volatile
set search_path = public
as $$
  select 'P-' || public.lq_random_code_chars(5) || '-' || public.lq_random_code_chars(5);
$$;

-- upper-case, keep only A-Z / 0-9 (codes are compared without dashes/spaces)
create or replace function public.lq_normalize_code(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
$$;

revoke all on function public.lq_random_code_chars(int) from public, anon, authenticated;
revoke all on function public.lq_new_family_code()      from public, anon, authenticated;
revoke all on function public.lq_new_parent_code()      from public, anon, authenticated;
revoke all on function public.lq_normalize_code(text)   from public, anon, authenticated;

-- Rolling rate limit for code lookups. Raises when the caller is over the limit,
-- otherwise records the attempt (in the caller's transaction).
create or replace function public.lq_check_code_rate()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ip  text;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  begin
    v_ip := nullif(trim(split_part(
      coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  exception when others then
    v_ip := null;
  end;

  delete from public.code_attempts where attempted_at < now() - interval '1 day';

  if (select count(*) from public.code_attempts
      where uid = v_uid and attempted_at > now() - interval '10 minutes') >= 20
     or (v_ip is not null and (select count(*) from public.code_attempts
      where ip = v_ip and attempted_at > now() - interval '10 minutes') >= 60) then
    raise exception 'You have tried too many codes. Please wait a few minutes and try again.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into public.code_attempts (uid, ip) values (v_uid, v_ip);
end;
$$;

revoke all on function public.lq_check_code_rate() from public, anon, authenticated;

-- Make sure the caller has a profiles row (anonymous users created before 0001).
create or replace function public.lq_ensure_profile()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.profiles (id) select auth.uid() where auth.uid() is not null
  on conflict (id) do nothing;
$$;

revoke all on function public.lq_ensure_profile() from public, anon, authenticated;

-- JSON describing the caller's session for one seat
create or replace function public.lq_session_json(p_member_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'family_id',      f.id,
    'family_name',    f.name,
    'member_id',      m.id,
    'game_member_id', m.game_member_id,
    'role',           m.role,
    'display_name',   m.display_name,
    'kind',           m.kind,
    'family_code',    f.family_code,
    'parent_code',    case when m.kind = 'parent' then f.parent_code end
  )
  from public.family_members m
  join public.families f on f.id = m.family_id
  where m.id = p_member_id;
$$;

revoke all on function public.lq_session_json(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Guards
-- -----------------------------------------------------------------------------

-- family_members: clients (role "authenticated") that are not guardians of the
-- family may not touch seat identity. RPCs run as the function owner and skip this.
create or replace function public.family_members_seat_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if public.is_family_guardian(new.family_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.profile_id is not null or new.claimed_by is not null
       or new.kind is not null or new.game_member_id is not null then
      raise exception 'Only a parent can add family seats' using errcode = '42501';
    end if;
  elsif (new.family_id, new.profile_id, new.claimed_by, new.kind, new.role, new.game_member_id)
        is distinct from
        (old.family_id, old.profile_id, old.claimed_by, old.kind, old.role, old.game_member_id) then
    raise exception 'Only a parent can change family seats' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists family_members_seat_guard on public.family_members;
create trigger family_members_seat_guard
  before insert or update on public.family_members
  for each row execute function public.family_members_seat_guard();

-- assigned_missions guard (replaces 0001's): players may update progress fields
-- (status, state, result_id, completed_at); only a guardian changes the rest.
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
          new.template_id, new.deadline_minutes, new.budget, new.note,
          new.mission_id, new.game_assignment_id, new.assigned_at)
         is distinct from
         (old.family_id, old.assigned_to_member_id, old.assigned_by_member_id,
          old.template_id, old.deadline_minutes, old.budget, old.note,
          old.mission_id, old.game_assignment_id, old.assigned_at)
     and not public.is_family_guardian(old.family_id) then
    raise exception 'Only a family guardian can change mission assignment details'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- member_status keeps family_members.last_seen fresh
create or replace function public.member_status_touch_seat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- at most once a minute, so realtime seat listeners aren't flooded
  update public.family_members set last_seen = now()
  where id = new.member_id and (last_seen is null or last_seen < now() - interval '60 seconds');
  return new;
end;
$$;

revoke all on function public.member_status_touch_seat() from public, anon, authenticated;

drop trigger if exists member_status_touch_seat on public.member_status;
create trigger member_status_touch_seat
  after insert or update on public.member_status
  for each row execute function public.member_status_touch_seat();

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Create a family as a parent/guardian; claims p_parent_game_member_id.
create or replace function public.create_family(
  p_name text,
  p_profile jsonb,
  p_settings jsonb,
  p_parent_game_member_id text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_name     text := left(trim(coalesce(p_name, '')), 80);
  v_family   uuid;
  v_fcode    text;
  v_pcode    text;
  v_member   jsonb;
  v_role     text;
  v_kind     text;
  v_gid      text;
  v_seat     uuid;
  v_tries    int := 0;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if v_name = '' then v_name := 'My family'; end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object'
     or jsonb_typeof(p_profile -> 'members') <> 'array' then
    raise exception 'Family profile is missing its members' using errcode = '22023';
  end if;
  if jsonb_array_length(p_profile -> 'members') > 20 then
    raise exception 'Too many family members (max 20)' using errcode = '22023';
  end if;
  if p_settings is not null and jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Settings must be an object' using errcode = '22023';
  end if;
  if (select count(*) from public.families
      where created_by = v_uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many families created recently. Please wait a while.' using errcode = 'P0001';
  end if;

  perform public.lq_ensure_profile();

  loop
    v_tries := v_tries + 1;
    v_fcode := public.lq_new_family_code();
    v_pcode := public.lq_new_parent_code();
    exit when not exists (
      select 1 from public.families
      where replace(family_code, '-', '') in (replace(v_fcode, '-', ''), replace(v_pcode, '-', ''))
         or replace(parent_code, '-', '') in (replace(v_fcode, '-', ''), replace(v_pcode, '-', ''))
    );
    if v_tries > 10 then
      raise exception 'Could not generate a unique code, please try again';
    end if;
  end loop;

  insert into public.families (name, created_by, family_code, parent_code, profile, settings)
  values (v_name, v_uid, v_fcode, v_pcode, p_profile, coalesce(p_settings, '{}'::jsonb))
  returning id into v_family;

  for v_member in select * from jsonb_array_elements(p_profile -> 'members') loop
    v_role := v_member ->> 'role';
    v_gid  := left(nullif(trim(coalesce(v_member ->> 'id', '')), ''), 64);
    -- 'partner' (not a household member) and unknown roles are not stored
    continue when v_gid is null or v_role is null or v_role not in (
      'mother', 'father', 'player', 'older-sibling', 'younger-sibling', 'grandparent', 'guardian');
    continue when exists (select 1 from public.family_members where family_id = v_family and game_member_id = v_gid);
    v_kind := case
      when v_role in ('mother', 'father', 'grandparent', 'guardian') then 'parent'
      when v_role = 'player' then 'child'
      else null -- siblings stay game characters (not playable seats)
    end;
    insert into public.family_members (family_id, display_name, role, character_config, trust, kind, game_member_id)
    values (
      v_family,
      left(coalesce(nullif(trim(v_member ->> 'name'), ''), 'Family member'), 80),
      v_role,
      jsonb_build_object('gameId', v_gid, 'appearance', coalesce(v_member -> 'appearance', '{}'::jsonb)),
      case when jsonb_typeof(v_member -> 'trust') = 'number'
           then greatest(0, least(100, round((v_member ->> 'trust')::numeric)::int)) else 50 end,
      v_kind,
      v_gid
    );
  end loop;

  select id into v_seat from public.family_members
  where family_id = v_family and game_member_id = p_parent_game_member_id and kind = 'parent';
  if v_seat is null then
    raise exception 'The creating member must be a parent or guardian in the family profile' using errcode = '22023';
  end if;

  update public.family_members
  set claimed_by = v_uid, profile_id = v_uid, last_seen = now()
  where id = v_seat;

  return json_build_object(
    'family_id', v_family, 'family_code', v_fcode, 'parent_code', v_pcode, 'member_id', v_seat,
    'session', public.lq_session_json(v_seat));
end;
$$;

-- Look up a code without joining. null = unknown code.
create or replace function public.preview_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   text := public.lq_normalize_code(p_code);
  v_family public.families%rowtype;
  v_kind   text;
begin
  perform public.lq_check_code_rate();
  if char_length(v_code) < 6 or char_length(v_code) > 32 then
    return null;
  end if;

  select * into v_family from public.families where replace(family_code, '-', '') = v_code;
  if found then
    v_kind := 'child';
  else
    select * into v_family from public.families where replace(parent_code, '-', '') = v_code;
    if not found then
      return null;
    end if;
    v_kind := 'parent';
  end if;

  return json_build_object(
    'family_name', v_family.name,
    'kind', v_kind,
    'region', v_family.settings ->> 'region',
    'seats', coalesce((
      select json_agg(json_build_object(
               'member_id', m.id,
               'game_member_id', m.game_member_id,
               'name', m.display_name,
               'role', m.role,
               'kind', m.kind,
               'appearance', m.character_config -> 'appearance',
               'claimed', m.claimed_by is not null and m.claimed_by <> auth.uid()
             ) order by m.created_at, m.game_member_id)
      from public.family_members m
      where m.family_id = v_family.id and m.kind = v_kind
    ), '[]'::json)
  );
end;
$$;

-- Join with a code: claim p_member_id, or (family code only) add a new child seat.
-- Returns the session json, or null when the code is unknown.
create or replace function public.join_family(p_code text, p_member_id uuid, p_new_child_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_code   text := public.lq_normalize_code(p_code);
  v_family public.families%rowtype;
  v_kind   text;
  v_seat   public.family_members%rowtype;
  v_name   text;
  v_n      int;
begin
  perform public.lq_check_code_rate();
  if char_length(v_code) < 6 or char_length(v_code) > 32 then
    return null;
  end if;

  select * into v_family from public.families where replace(family_code, '-', '') = v_code;
  if found then
    v_kind := 'child';
  else
    select * into v_family from public.families where replace(parent_code, '-', '') = v_code;
    if not found then
      return null;
    end if;
    v_kind := 'parent';
  end if;

  perform public.lq_ensure_profile();

  if p_member_id is not null then
    select * into v_seat from public.family_members
    where id = p_member_id and family_id = v_family.id
    for update;
    if not found then
      raise exception 'That family member was not found' using errcode = '22023';
    end if;
    if v_seat.kind is distinct from v_kind then
      if v_seat.kind = 'parent' then
        raise exception 'Parent seats need the parent code' using errcode = '42501';
      end if;
      raise exception 'That seat cannot be joined with this code' using errcode = '42501';
    end if;
    if v_seat.claimed_by is not null and v_seat.claimed_by <> v_uid then
      raise exception '% is already taken by another device. Ask a parent to free the seat.', v_seat.display_name
        using errcode = 'P0001', hint = 'seat_taken';
    end if;
  elsif nullif(trim(coalesce(p_new_child_name, '')), '') is not null then
    if v_kind <> 'child' then
      raise exception 'New children join with the family code' using errcode = '42501';
    end if;
    if (select count(*) from public.family_members where family_id = v_family.id) >= 24 then
      raise exception 'This family is full' using errcode = 'P0001';
    end if;
    v_name := left(trim(p_new_child_name), 40);
    select coalesce(max(substring(game_member_id from '^child-([0-9]+)$')::int), 1) + 1
      into v_n
      from public.family_members
      where family_id = v_family.id and game_member_id ~ '^child-[0-9]+$';
    insert into public.family_members (family_id, display_name, role, character_config, kind, game_member_id)
    values (v_family.id, v_name, 'player',
            jsonb_build_object('gameId', 'child-' || v_n), 'child', 'child-' || v_n)
    returning * into v_seat;
  else
    raise exception 'Pick a family member or enter a name' using errcode = '22023';
  end if;

  -- one seat per device per family: free any other seat this device held here
  update public.family_members
  set claimed_by = null, profile_id = null
  where family_id = v_family.id and claimed_by = v_uid and id <> v_seat.id;

  update public.family_members
  set claimed_by = v_uid, profile_id = v_uid, last_seen = now()
  where id = v_seat.id;

  return public.lq_session_json(v_seat.id);
end;
$$;

-- Free a seat so another device can claim it (parents of that family only).
create or replace function public.release_seat(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select family_id into v_family from public.family_members where id = p_member_id;
  if v_family is null or not public.is_family_guardian(v_family) then
    raise exception 'Only a parent of this family can free a seat' using errcode = '42501';
  end if;
  update public.family_members
  set claimed_by = null, profile_id = null, last_seen = null
  where id = p_member_id;
end;
$$;

-- The caller's parent family (explicit id, or the one family they parent)
create or replace function public.lq_parent_family(p_family_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_family uuid := p_family_id;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if v_family is null then
    select m.family_id into v_family
    from public.family_members m
    where m.claimed_by = auth.uid() and m.kind = 'parent'
    order by m.last_seen desc nulls last
    limit 1;
  end if;
  if v_family is null or not public.is_family_guardian(v_family) then
    raise exception 'Only a parent of this family can do that' using errcode = '42501';
  end if;
  return v_family;
end;
$$;

revoke all on function public.lq_parent_family(uuid) from public, anon, authenticated;

-- New codes (old ones stop working). Parents only.
create or replace function public.regenerate_codes(p_family_id uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid := public.lq_parent_family(p_family_id);
  v_fcode  text;
  v_pcode  text;
  v_tries  int := 0;
begin
  loop
    v_tries := v_tries + 1;
    v_fcode := public.lq_new_family_code();
    v_pcode := public.lq_new_parent_code();
    exit when not exists (
      select 1 from public.families
      where replace(family_code, '-', '') in (replace(v_fcode, '-', ''), replace(v_pcode, '-', ''))
         or replace(parent_code, '-', '') in (replace(v_fcode, '-', ''), replace(v_pcode, '-', ''))
    );
    if v_tries > 10 then
      raise exception 'Could not generate a unique code, please try again';
    end if;
  end loop;
  update public.families set family_code = v_fcode, parent_code = v_pcode where id = v_family;
  return json_build_object('family_code', v_fcode, 'parent_code', v_pcode);
end;
$$;

-- Current codes (parents only; parent_code is not selectable directly).
create or replace function public.get_family_codes(p_family_id uuid default null)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object('family_code', f.family_code, 'parent_code', f.parent_code)
  from public.families f
  where f.id = public.lq_parent_family(p_family_id);
$$;

revoke all on function public.create_family(text, jsonb, jsonb, text)  from public, anon;
revoke all on function public.preview_code(text)                       from public, anon;
revoke all on function public.join_family(text, uuid, text)            from public, anon;
revoke all on function public.release_seat(uuid)                       from public, anon;
revoke all on function public.regenerate_codes(uuid)                   from public, anon;
revoke all on function public.get_family_codes(uuid)                   from public, anon;
grant execute on function public.create_family(text, jsonb, jsonb, text) to authenticated;
grant execute on function public.preview_code(text)                      to authenticated;
grant execute on function public.join_family(text, uuid, text)           to authenticated;
grant execute on function public.release_seat(uuid)                      to authenticated;
grant execute on function public.regenerate_codes(uuid)                  to authenticated;
grant execute on function public.get_family_codes(uuid)                  to authenticated;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on public.member_saves, public.member_status, public.family_messages, public.code_attempts
  from anon;
revoke all on public.code_attempts from authenticated;
revoke delete, truncate on public.member_saves, public.member_status, public.family_messages
  from authenticated;
revoke update on public.family_messages from authenticated;
grant select, insert, update on public.member_saves, public.member_status to authenticated;
grant select, insert on public.family_messages to authenticated;

-- families: parent_code is never selectable by clients
revoke select on public.families from authenticated;
grant select (id, name, created_by, created_at, family_code, profile, settings, updated_at)
  on public.families to authenticated;
-- guardians may update the shared profile/settings (policy below); codes only via RPC
revoke update on public.families from authenticated;
grant update (name, profile, settings) on public.families to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.member_saves    enable row level security;
alter table public.member_status   enable row level security;
alter table public.family_messages enable row level security;
alter table public.code_attempts   enable row level security; -- no policies: no client access

-- families: only guardians may update (was: any member) --------------------------
drop policy if exists families_update_member on public.families;
drop policy if exists families_update_guardian on public.families;
create policy families_update_guardian on public.families
  for update to authenticated
  using (public.is_family_guardian(id))
  with check (public.is_family_guardian(id));

-- assigned_missions: guardians insert/update; a child updates only its own -------
drop policy if exists assigned_missions_update_member on public.assigned_missions;
drop policy if exists assigned_missions_update_guardian_or_assignee on public.assigned_missions;
create policy assigned_missions_update_guardian_or_assignee on public.assigned_missions
  for update to authenticated
  using (public.is_family_guardian(family_id) or public.is_seat_holder(assigned_to_member_id))
  with check (public.is_family_guardian(family_id) or public.is_seat_holder(assigned_to_member_id));

-- member_saves: the seat's device reads/writes; family parents read -------------
drop policy if exists member_saves_select on public.member_saves;
create policy member_saves_select on public.member_saves
  for select to authenticated
  using (public.is_seat_holder(member_id)
         or public.is_family_guardian(public.member_family_id(member_id)));

drop policy if exists member_saves_insert_own on public.member_saves;
create policy member_saves_insert_own on public.member_saves
  for insert to authenticated
  with check (public.is_seat_holder(member_id));

drop policy if exists member_saves_update_own on public.member_saves;
create policy member_saves_update_own on public.member_saves
  for update to authenticated
  using (public.is_seat_holder(member_id))
  with check (public.is_seat_holder(member_id));

-- member_status: family reads; only the seat's device writes its row -----------
drop policy if exists member_status_select_family on public.member_status;
create policy member_status_select_family on public.member_status
  for select to authenticated
  using (public.is_family_member(family_id));

drop policy if exists member_status_insert_own on public.member_status;
create policy member_status_insert_own on public.member_status
  for insert to authenticated
  with check (public.is_seat_holder(member_id) and family_id = public.member_family_id(member_id));

drop policy if exists member_status_update_own on public.member_status;
create policy member_status_update_own on public.member_status
  for update to authenticated
  using (public.is_seat_holder(member_id))
  with check (public.is_seat_holder(member_id) and family_id = public.member_family_id(member_id));

-- family_messages ----------------------------------------------------------------
-- Parents read all family messages; children read family-wide ones, ones to them
-- and their own. Senders must hold the from seat; recipients must be in the same
-- family (composite FK).
drop policy if exists family_messages_select on public.family_messages;
create policy family_messages_select on public.family_messages
  for select to authenticated
  using (
    public.is_family_member(family_id)
    and (
      public.is_family_guardian(family_id)
      or to_member_id is null
      or public.is_seat_holder(to_member_id)
      or public.is_seat_holder(from_member_id)
    )
  );

drop policy if exists family_messages_insert on public.family_messages;
create policy family_messages_insert on public.family_messages
  for insert to authenticated
  with check (
    public.is_seat_holder(from_member_id)
    and family_id = public.member_family_id(from_member_id)
    and (to_member_id is null or public.member_family_id(to_member_id) = family_id)
  );

-- -----------------------------------------------------------------------------
-- Voice messages: family_messages.audio_path points into the private
-- `family-voice` bucket at '<family_id>/<file>'. Clips are meant to live 7 days
-- (clean-up is not automatic yet: delete old objects from the dashboard or a
-- scheduled job). Only members of that family can upload or read.
-- -----------------------------------------------------------------------------
alter table public.family_messages add column if not exists audio_path  text;
alter table public.family_messages add column if not exists duration_ms int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'family_messages_audio_check') then
    alter table public.family_messages add constraint family_messages_audio_check
      check ((audio_path is null and duration_ms is null)
          or (audio_path is not null
              and audio_path like family_id::text || '/%'
              and char_length(audio_path) <= 200
              and duration_ms between 0 and 31000));
  end if;
end
$$;

-- uuid from text or null (storage paths are user-supplied)
create or replace function public.lq_try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function public.lq_try_uuid(text) from public, anon;
grant execute on function public.lq_try_uuid(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-voice', 'family-voice', false, 2097152,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do nothing;

drop policy if exists "family-voice member read" on storage.objects;
create policy "family-voice member read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'family-voice'
         and public.is_family_member(public.lq_try_uuid((storage.foldername(name))[1])));

drop policy if exists "family-voice member upload" on storage.objects;
create policy "family-voice member upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'family-voice'
              and public.is_family_member(public.lq_try_uuid((storage.foldername(name))[1])));

-- the uploader may delete their own clip (unsend)
drop policy if exists "family-voice owner delete" on storage.objects;
create policy "family-voice owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'family-voice' and owner_id = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- Realtime (RLS applies to postgres_changes subscribers)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['member_status', 'family_messages', 'assigned_missions', 'family_members'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;
