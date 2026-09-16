-- ══════════════════════════════════════════════════════════════════════════
-- Airball — full schema, with row-level security on from the very first day.
--
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- It is safe to re-run: every object is created with `if not exists` or
-- `create or replace`.
--
-- Design notes that matter:
--   * A hangout's state (open/closed) and its tag (airball/rebound) are NEVER
--     stored. They are computed in the `hangout_feed` view. No cron, no jobs.
--   * Real names live on `profiles` and are visible only to group owners/mods.
--     Everyone else sees `group_members.display_alias`. That split is the
--     whole anonymity model.
--   * Membership checks go through SECURITY DEFINER functions. Doing them
--     inline in a policy on `group_members` causes infinite RLS recursion —
--     this is the single most common way a Supabase schema breaks.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Tables ────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  real_name   text not null default '',
  email       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.groups (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(trim(name)) between 1 and 60),
  description       text not null default '',
  owner_id          uuid not null references auth.users(id) on delete cascade,
  join_code         text not null unique,
  -- When true, joining with the code creates a PENDING membership that an
  -- owner must approve. When false, the code admits people immediately.
  requires_approval boolean not null default false,
  -- Owners can switch the joke off for their group.
  airball_enabled   boolean not null default true,
  -- "Cuber" -> members are auto-aliased "Cuber #4".
  alias_prefix      text not null default 'Member',
  created_at        timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id      uuid not null references public.groups(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_alias text not null,
  role          text not null default 'member' check (role in ('owner','mod','member')),
  status        text not null default 'approved' check (status in ('pending','approved','banned')),
  join_reason   text not null default '',
  joined_at     timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.hangouts (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id) on delete cascade,
  author_id     uuid not null references auth.users(id) on delete cascade,
  location_text text not null check (length(trim(location_text)) between 1 and 120),
  note          text not null default '',
  starts_at     timestamptz not null default now(),
  -- Nobody states how long they'll stay. This is just a cap so stale posts
  -- fall off the board; presence is answered by the attendance counter.
  ends_at       timestamptz not null default (now() + interval '12 hours'),
  created_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.rsvps (
  hangout_id  uuid not null references public.hangouts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('otw','maybe_next_time')),
  eta_minutes int check (eta_minutes between 0 and 240),
  created_at  timestamptz not null default now(),
  primary key (hangout_id, user_id)
);

create table if not exists public.attendance (
  hangout_id uuid not null references public.hangouts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  arrived_at timestamptz not null default now(),
  left_at    timestamptz,
  primary key (hangout_id, user_id)
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('hangout','message','user')),
  target_id   uuid not null,
  reason      text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists hangouts_group_created_idx
  on public.hangouts (group_id, created_at desc);
create index if not exists messages_hangout_created_idx
  on public.messages (hangout_id, created_at);
create index if not exists group_members_user_idx
  on public.group_members (user_id) where status = 'approved';

-- ── Helper functions ──────────────────────────────────────────────────────
-- SECURITY DEFINER so they bypass RLS on group_members. Without this, any
-- policy that reads group_members from within a group_members policy will
-- recurse forever and every query fails.

create or replace function public.is_member(gid uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid() and status = 'approved'
  );
$$;

create or replace function public.is_staff(gid uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid()
      and status = 'approved' and role in ('owner','mod')
  );
$$;

create or replace function public.can_see_hangout(hid uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select public.is_member((select group_id from hangouts where id = hid));
$$;

-- ── New user → profile row ────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, real_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'real_name', ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Joining a group by code ───────────────────────────────────────────────
-- Done in a function so nobody needs read access to `groups` in order to
-- look a code up. Returns the group id.

create or replace function public.join_with_code(p_code text, p_reason text default '')
returns uuid language plpgsql security definer
set search_path = public as $$
declare
  g        record;
  v_status text;
begin
  select * into g from groups where upper(join_code) = upper(trim(p_code));
  if not found then
    raise exception 'No group with that code' using errcode = 'P0002';
  end if;

  -- Already in (or pending, or banned)? Don't create a second row.
  if exists (select 1 from group_members
             where group_id = g.id and user_id = auth.uid()) then
    return g.id;
  end if;

  v_status := case when g.requires_approval then 'pending' else 'approved' end;

  -- Every member of a group shares one alias. A per-person number would be a
  -- pseudonym, not anonymity: stable across posts, so people could be tracked.
  insert into group_members (group_id, user_id, display_alias, status, join_reason)
  values (g.id, auth.uid(), g.alias_prefix, v_status, coalesce(p_reason, ''));

  return g.id;
end;
$$;

-- Creating a group: makes the group, a unique code, and an owner membership.
create or replace function public.create_group(
  p_name text,
  p_alias_prefix text default 'Member',
  p_requires_approval boolean default false
)
returns uuid language plpgsql security definer
set search_path = public as $$
declare
  v_code   text;
  v_id     uuid;
  v_prefix text := coalesce(nullif(trim(p_alias_prefix), ''), 'Member');
begin
  -- No 0/O/1/I — these get read off a projector screen at a club meeting.
  loop
    v_code := string_agg(
      substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
             (random() * 31)::int + 1, 1), '')
      from generate_series(1, 6);
    exit when not exists (select 1 from groups where join_code = v_code);
  end loop;

  insert into groups (name, owner_id, join_code, alias_prefix, requires_approval)
  values (trim(p_name), auth.uid(), v_code, v_prefix, coalesce(p_requires_approval, false))
  returning id into v_id;

  insert into group_members (group_id, user_id, display_alias, role, status)
  values (v_id, auth.uid(), v_prefix, 'owner', 'approved');

  return v_id;
end;
$$;

-- ── The feed view: where airball and rebound are computed ─────────────────
-- security_invoker means this view respects the caller's RLS on `hangouts`.

-- Dropped rather than replaced: CREATE OR REPLACE VIEW can only append
-- columns, never reorder them, so re-running would fail after any change.
drop view if exists public.hangout_feed;

create view public.hangout_feed
with (security_invoker = true) as
select
  h.id,
  h.group_id,
  h.author_id,
  h.location_text,
  h.note,
  h.starts_at,
  h.ends_at,
  h.created_at,
  gm.display_alias                      as author_alias,
  -- People forget to tap "Leaving", so a closed hangout reports nobody there.
  case when now() < h.ends_at
       then coalesce(att.here_count, 0) else 0 end::int as here_count,
  coalesce(rs.otw_count, 0)::int        as otw_count,
  coalesce(msg.reply_count, 0)::int     as reply_count,
  fr.first_response_at,
  (now() < h.ends_at)                   as is_open,
  case
    when not g.airball_enabled then null
    when fr.first_response_at is null
         and now() > h.created_at + interval '1 hour'      then 'airball'
    when fr.first_response_at > h.created_at + interval '1 hour' then 'rebound'
    else null
  end                                   as tag
from public.hangouts h
join public.groups g on g.id = h.group_id
left join public.group_members gm
  on gm.group_id = h.group_id and gm.user_id = h.author_id
left join lateral (
  select count(*) as here_count from attendance a
  where a.hangout_id = h.id and a.left_at is null
) att on true
left join lateral (
  select count(*) as otw_count from rsvps r
  where r.hangout_id = h.id and r.kind = 'otw'
) rs on true
left join lateral (
  select count(*) as reply_count from messages m
  where m.hangout_id = h.id
) msg on true
-- "A response" = any RSVP, message, or arrival by someone other than the author.
left join lateral (
  select min(t) as first_response_at from (
    select created_at as t from rsvps      where hangout_id = h.id and user_id <> h.author_id
    union all
    select created_at as t from messages   where hangout_id = h.id and user_id <> h.author_id
    union all
    select arrived_at as t from attendance where hangout_id = h.id and user_id <> h.author_id
  ) x
) fr on true;

-- ── Row-level security ────────────────────────────────────────────────────

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.hangouts      enable row level security;
alter table public.rsvps         enable row level security;
alter table public.attendance    enable row level security;
alter table public.messages      enable row level security;
alter table public.reports       enable row level security;
alter table public.blocks        enable row level security;

-- profiles: you see your own. Staff see members of groups they run — this is
-- the ONLY path by which a real name is ever exposed.
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from group_members gm
      where gm.user_id = profiles.id and public.is_staff(gm.group_id)
    )
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- groups: members read. Only owners change settings. Creation goes through
-- create_group(), so there is no plain insert policy.
drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups
  for select using (public.is_member(id));

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete using (owner_id = auth.uid());

-- group_members: you always see your own row; members see approved peers;
-- staff see everyone including pending requests.
drop policy if exists members_read on public.group_members;
create policy members_read on public.group_members
  for select using (
    user_id = auth.uid()
    or (status = 'approved' and public.is_member(group_id))
    or public.is_staff(group_id)
  );

drop policy if exists members_staff_write on public.group_members;
create policy members_staff_write on public.group_members
  for update using (public.is_staff(group_id)) with check (public.is_staff(group_id));

-- Leave a group yourself, or be removed by staff.
drop policy if exists members_delete on public.group_members;
create policy members_delete on public.group_members
  for delete using (user_id = auth.uid() or public.is_staff(group_id));

-- hangouts
drop policy if exists hangouts_read on public.hangouts;
create policy hangouts_read on public.hangouts
  for select using (public.is_member(group_id));

drop policy if exists hangouts_insert on public.hangouts;
create policy hangouts_insert on public.hangouts
  for insert with check (author_id = auth.uid() and public.is_member(group_id));

drop policy if exists hangouts_update on public.hangouts;
create policy hangouts_update on public.hangouts
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

-- Authors delete their own posts (airballed or not); staff can moderate.
drop policy if exists hangouts_delete on public.hangouts;
create policy hangouts_delete on public.hangouts
  for delete using (author_id = auth.uid() or public.is_staff(group_id));

-- rsvps / attendance / messages: readable by group members, writable only
-- as yourself.
drop policy if exists rsvps_read on public.rsvps;
create policy rsvps_read on public.rsvps
  for select using (public.can_see_hangout(hangout_id));
drop policy if exists rsvps_write on public.rsvps;
create policy rsvps_write on public.rsvps
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_see_hangout(hangout_id));

drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance
  for select using (public.can_see_hangout(hangout_id));
drop policy if exists attendance_write on public.attendance;
create policy attendance_write on public.attendance
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_see_hangout(hangout_id));

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
  for select using (public.can_see_hangout(hangout_id));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (user_id = auth.uid() and public.can_see_hangout(hangout_id));
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete using (user_id = auth.uid());

-- reports: write-only from a user's perspective. You cannot read the queue.
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert with check (reporter_id = auth.uid());

-- blocks: entirely private to the blocker.
drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks
  for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- ── Realtime ──────────────────────────────────────────────────────────────
-- These three drive the live counter and the thread chat.

alter publication supabase_realtime add table public.attendance;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.rsvps;
