-- ══════════════════════════════════════════════════════════════════════════
-- Migration 005 — drop Rebound, and let members see who's in the group.
--
-- Run after 004. Safe to re-run.
--
-- 1. Rebound is gone. Airball now means "nobody replied within the first
--    hour", which is permanent once earned rather than something that
--    silently disappears the moment a late reply lands. Still derived from
--    timestamps — nothing is stored, no jobs run.
--
-- 2. A group roster. Members can see WHO is in the group by real name, while
--    posts and threads stay anonymous. Those two facts coexist because
--    nothing in the feeds carries a user id: you know the eighteen people in
--    the club, you just can't tell which one posted.
--
--    Served as a view rather than by opening up `profiles`, so email
--    addresses stay private and only staff get the ids needed to moderate.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Airball only ───────────────────────────────────────────────────────

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
    -- Nobody answered inside the first hour. A reply afterwards doesn't
    -- undo it; the hour passed with silence and that's the joke.
    when now() > h.created_at + interval '1 hour'
         and (fr.first_response_at is null
              or fr.first_response_at > h.created_at + interval '1 hour')
    then 'airball'
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

grant select on public.hangout_feed to authenticated;

-- ── 2. The roster ─────────────────────────────────────────────────────────
-- Real names, no emails, and no user ids unless you're staff (who need them
-- to approve and remove people). Definer, with the membership check inline.

drop view if exists public.group_roster;

create view public.group_roster as
select
  gm.group_id,
  p.real_name,
  gm.display_alias,
  gm.role,
  gm.status,
  gm.joined_at,
  (gm.user_id = auth.uid())                              as is_me,
  -- Staff-only, for the approve/remove tools.
  case when public.is_staff(gm.group_id) then gm.user_id end        as member_id,
  case when public.is_staff(gm.group_id) then gm.join_reason end    as join_reason
from public.group_members gm
join public.profiles p on p.id = gm.user_id
where public.is_member(gm.group_id)
  -- Pending requests are visible to staff only.
  and (gm.status = 'approved' or public.is_staff(gm.group_id));

grant select on public.group_roster to authenticated;
