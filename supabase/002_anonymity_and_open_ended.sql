-- ══════════════════════════════════════════════════════════════════════════
-- Migration 002 — real anonymity, and hangouts that don't need an end time.
--
-- Run this in the Supabase SQL Editor after schema.sql. Safe to re-run.
--
-- 1. Aliases lose their trailing number. "Cuber #4" was a pseudonym, not
--    anonymity: it was stable across every post, so anyone could follow one
--    person around the board. Now every member of a group is simply "Cuber".
--    Real names still exist on `profiles` and are still visible to owners —
--    that half of the model is unchanged and is what makes approvals work.
--
-- 2. Posting no longer asks how long you'll stay. `ends_at` becomes a hidden
--    12-hour cap so stale posts eventually fall off the board; whether anyone
--    is actually there is answered by the attendance counter alone.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Aliases without numbers ────────────────────────────────────────────

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

  if exists (select 1 from group_members
             where group_id = g.id and user_id = auth.uid()) then
    return g.id;
  end if;

  v_status := case when g.requires_approval then 'pending' else 'approved' end;

  -- Every member shares the same alias. That is the point.
  insert into group_members (group_id, user_id, display_alias, status, join_reason)
  values (g.id, auth.uid(), g.alias_prefix, v_status, coalesce(p_reason, ''));

  return g.id;
end;
$$;

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

-- Strip the numbers off everyone who already joined.
update public.group_members
   set display_alias = regexp_replace(display_alias, '\s*#\d+$', '')
 where display_alias ~ '#\d+$';

-- ── 2. Hangouts don't need a stated end time ──────────────────────────────
-- Anything already posted gets the same 12-hour cap.

alter table public.hangouts
  alter column ends_at set default (now() + interval '12 hours');

-- Only extend hangouts that are still open; never reopen a closed one.
update public.hangouts
   set ends_at = created_at + interval '12 hours'
 where now() < ends_at
   and ends_at < created_at + interval '12 hours';

-- ── 3. A closed hangout reports nobody present ────────────────────────────
-- People forget to tap "Leaving", and RLS rightly stops an author from
-- clearing someone else's attendance row. So the view answers it instead:
-- once a hangout is over, here_count is 0 regardless of stale rows.

create or replace view public.hangout_feed
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
left join lateral (
  select min(t) as first_response_at from (
    select created_at as t from rsvps      where hangout_id = h.id and user_id <> h.author_id
    union all
    select created_at as t from messages   where hangout_id = h.id and user_id <> h.author_id
    union all
    select arrived_at as t from attendance where hangout_id = h.id and user_id <> h.author_id
  ) x
) fr on true;
