-- ══════════════════════════════════════════════════════════════════════════
-- Migration 003 — per-thread letters, and closing the identity leak.
--
-- Run after 002. Safe to re-run.
--
-- Within one hangout, each participant is "Cuber A", "Cuber B" … so a
-- conversation can be followed. Letters are assigned randomly per hangout, so
-- the same person is a different letter on every post and cannot be tracked
-- across the board.
--
-- This also fixes a real hole: until now `author_id` and `user_id` were
-- readable by any group member. The interface said "Cuber", but one query
-- against the API would have linked every post to a person. Anonymity has to
-- hold at the database, not in the UI. So peers no longer read those tables
-- directly — they read sanitised views that carry letters and never ids.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Letter assignments ────────────────────────────────────────────────────

create table if not exists public.thread_aliases (
  hangout_id uuid not null references public.hangouts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  letter     text not null,
  primary key (hangout_id, user_id)
);

alter table public.thread_aliases enable row level security;

-- Nobody reads this table directly. The views join to it as the definer.
drop policy if exists thread_aliases_own on public.thread_aliases;
create policy thread_aliases_own on public.thread_aliases
  for select using (user_id = auth.uid());

create or replace function public.ensure_thread_letter(hid uuid, uid uuid)
returns text language plpgsql security definer
set search_path = public as $$
declare
  v_letter text;
  v_used   text[];
  v_pool   text[];
begin
  select letter into v_letter
    from thread_aliases where hangout_id = hid and user_id = uid;
  if found then return v_letter; end if;

  select coalesce(array_agg(letter), '{}') into v_used
    from thread_aliases where hangout_id = hid;

  select coalesce(array_agg(l), '{}') into v_pool
    from unnest(string_to_array(
      'A,B,C,D,E,F,G,H,J,K,L,M,N,P,Q,R,S,T,U,V,W,X,Y,Z', ',')) l
   where not (l = any(v_used));

  if coalesce(array_length(v_pool, 1), 0) = 0 then
    v_letter := 'Z' || (coalesce(array_length(v_used, 1), 0) + 1);
  else
    -- Random, not sequential: if letters were handed out in order, "A" would
    -- always be the poster and order of arrival would be public.
    v_letter := v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
  end if;

  insert into thread_aliases (hangout_id, user_id, letter)
  values (hid, uid, v_letter)
  on conflict (hangout_id, user_id) do nothing;

  select letter into v_letter
    from thread_aliases where hangout_id = hid and user_id = uid;
  return v_letter;
end;
$$;

-- Anyone who touches a hangout gets a letter in it.
create or replace function public.assign_thread_letter()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if TG_TABLE_NAME = 'hangouts' then
    perform public.ensure_thread_letter(new.id, new.author_id);
  else
    perform public.ensure_thread_letter(new.hangout_id, new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists letter_on_hangout on public.hangouts;
create trigger letter_on_hangout after insert on public.hangouts
  for each row execute function public.assign_thread_letter();

drop trigger if exists letter_on_message on public.messages;
create trigger letter_on_message after insert on public.messages
  for each row execute function public.assign_thread_letter();

drop trigger if exists letter_on_rsvp on public.rsvps;
create trigger letter_on_rsvp after insert on public.rsvps
  for each row execute function public.assign_thread_letter();

drop trigger if exists letter_on_attendance on public.attendance;
create trigger letter_on_attendance after insert on public.attendance
  for each row execute function public.assign_thread_letter();

-- Backfill everything that already exists.
do $$
declare r record;
begin
  for r in select id as hid, author_id as uid from hangouts loop
    perform public.ensure_thread_letter(r.hid, r.uid);
  end loop;
  for r in select hangout_id as hid, user_id as uid from messages loop
    perform public.ensure_thread_letter(r.hid, r.uid);
  end loop;
  for r in select hangout_id as hid, user_id as uid from rsvps loop
    perform public.ensure_thread_letter(r.hid, r.uid);
  end loop;
  for r in select hangout_id as hid, user_id as uid from attendance loop
    perform public.ensure_thread_letter(r.hid, r.uid);
  end loop;
end $$;

-- ── Sanitised views ───────────────────────────────────────────────────────
-- Deliberately NOT security_invoker: these run as the definer so they can
-- read the base tables, and they check membership themselves in the WHERE
-- clause. No user id is ever selected into the output.

drop view if exists public.hangout_feed;
create view public.hangout_feed as
select
  h.id,
  h.group_id,
  h.location_text,
  h.note,
  h.starts_at,
  h.ends_at,
  h.created_at,
  (h.author_id = auth.uid())                          as is_mine,
  g.alias_prefix || ' ' || coalesce(ta.letter, '?')   as author_alias,
  case when now() < h.ends_at
       then coalesce(att.here_count, 0) else 0 end::int as here_count,
  coalesce(rs.otw_count, 0)::int                      as otw_count,
  coalesce(msg.reply_count, 0)::int                   as reply_count,
  fr.first_response_at,
  (now() < h.ends_at)                                 as is_open,
  case
    when not g.airball_enabled then null
    when fr.first_response_at is null
         and now() > h.created_at + interval '1 hour'      then 'airball'
    when fr.first_response_at > h.created_at + interval '1 hour' then 'rebound'
    else null
  end                                                 as tag
from public.hangouts h
join public.groups g on g.id = h.group_id
left join public.thread_aliases ta
  on ta.hangout_id = h.id and ta.user_id = h.author_id
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
) fr on true
where public.is_member(h.group_id);

-- The thread. Carries a letter and whether it's yours; never a user id.
drop view if exists public.message_feed;
create view public.message_feed as
select
  m.id,
  m.hangout_id,
  m.body,
  m.created_at,
  (m.user_id = auth.uid())                          as is_mine,
  g.alias_prefix || ' ' || coalesce(ta.letter, '?') as alias
from public.messages m
join public.hangouts h on h.id = m.hangout_id
join public.groups g   on g.id = h.group_id
left join public.thread_aliases ta
  on ta.hangout_id = m.hangout_id and ta.user_id = m.user_id
where public.is_member(h.group_id);

grant select on public.hangout_feed  to authenticated;
grant select on public.message_feed  to authenticated;

-- ── Close the direct-read leak ────────────────────────────────────────────
-- Members may now read only their OWN rows in these tables. Everything they
-- see about other people comes through the views above, stripped of ids.

drop policy if exists hangouts_read on public.hangouts;
drop policy if exists hangouts_read_own on public.hangouts;
create policy hangouts_read_own on public.hangouts
  for select using (author_id = auth.uid());

drop policy if exists messages_read on public.messages;
drop policy if exists messages_read_own on public.messages;
create policy messages_read_own on public.messages
  for select using (user_id = auth.uid());

drop policy if exists rsvps_read on public.rsvps;
drop policy if exists attendance_read on public.attendance;
-- rsvps_write / attendance_write are FOR ALL on user_id = auth.uid(), which
-- already permits reading your own rows and nothing else.

-- ── Realtime without identity ─────────────────────────────────────────────
-- Realtime applies RLS, so with the tables above locked to their owners a
-- member would stop receiving other people's events and the live counter
-- would die. And subscribing to those tables directly would have shipped
-- user ids inside the websocket payload anyway — anonymity that survives the
-- UI but not devtools is not anonymity.
--
-- So activity is announced on a table that carries no identity at all: just
-- "something happened on this hangout". Clients refetch through the views.

create table if not exists public.activity_pings (
  id         bigserial primary key,
  group_id   uuid not null references public.groups(id) on delete cascade,
  -- Null when the hangout itself was deleted: the row is gone by the time the
  -- AFTER trigger runs, so there is nothing left to point at. Clients only
  -- need to know that this group changed.
  hangout_id uuid references public.hangouts(id) on delete cascade,
  at         timestamptz not null default now()
);

create index if not exists activity_pings_group_idx
  on public.activity_pings (group_id, at desc);

alter table public.activity_pings enable row level security;

drop policy if exists pings_read on public.activity_pings;
create policy pings_read on public.activity_pings
  for select using (public.is_member(group_id));

create or replace function public.ping_activity()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  rec  record;
  v_h  uuid;
  v_g  uuid;
begin
  rec := case when TG_OP = 'DELETE' then old else new end;

  if TG_TABLE_NAME = 'hangouts' then
    v_h := case when TG_OP = 'DELETE' then null else rec.id end;
    v_g := rec.group_id;
  else
    v_h := rec.hangout_id;
    select group_id into v_g from hangouts where id = v_h;
  end if;

  if v_g is not null then
    insert into activity_pings (group_id, hangout_id) values (v_g, v_h);
  end if;

  -- Occasional sweep; these are disposable the moment they're delivered.
  if random() < 0.02 then
    delete from activity_pings where at < now() - interval '1 hour';
  end if;

  return rec;
end;
$$;

drop trigger if exists ping_on_attendance on public.attendance;
create trigger ping_on_attendance
  after insert or update or delete on public.attendance
  for each row execute function public.ping_activity();

drop trigger if exists ping_on_message on public.messages;
create trigger ping_on_message
  after insert or delete on public.messages
  for each row execute function public.ping_activity();

drop trigger if exists ping_on_rsvp on public.rsvps;
create trigger ping_on_rsvp
  after insert or update or delete on public.rsvps
  for each row execute function public.ping_activity();

drop trigger if exists ping_on_hangout on public.hangouts;
create trigger ping_on_hangout
  after insert or update or delete on public.hangouts
  for each row execute function public.ping_activity();

-- Swap what realtime publishes: pings in, identity-bearing tables out.
do $$
begin
  begin alter publication supabase_realtime drop table public.attendance; exception when others then null; end;
  begin alter publication supabase_realtime drop table public.messages;   exception when others then null; end;
  begin alter publication supabase_realtime drop table public.rsvps;      exception when others then null; end;
  begin alter publication supabase_realtime add  table public.activity_pings; exception when others then null; end;
end $$;
