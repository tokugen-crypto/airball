-- ══════════════════════════════════════════════════════════════════════════
-- Migration 006 — owner tools and reporting.
--
-- Run after 005. Safe to re-run.
--
-- The hard part here is that ordinary moderation deanonymises people.
--
--   * A per-user block would give it away by subtraction: block someone,
--     watch which posts disappear, and you know who wrote them. So there is
--     no personal block. In a group-gated app the real remedy is the owner
--     removing someone, which is why joining is gated in the first place.
--
--   * A report queue showing "posted by Alice" would let an owner report any
--     post themselves purely to unmask its author. So the queue never shows
--     an identity. Staff act on the content — delete it, or remove whoever
--     wrote it — through functions that look the author up internally and
--     never return it.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Reports get a group, and a resolved flag ──────────────────────────────

alter table public.reports
  add column if not exists group_id uuid references public.groups(id) on delete cascade;
alter table public.reports
  add column if not exists resolved_at timestamptz;

create index if not exists reports_group_open_idx
  on public.reports (group_id) where resolved_at is null;

-- Reporters may file, and may not read the queue (it would expose what other
-- people reported). Staff read it through the view below.
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert with check (
    reporter_id = auth.uid() and public.is_member(group_id)
  );

-- ── The queue: content and reason, never an identity ──────────────────────

drop view if exists public.report_queue;

create view public.report_queue as
select
  r.id,
  r.group_id,
  r.target_type,
  r.reason,
  r.created_at,
  r.resolved_at,
  case r.target_type
    when 'hangout' then (select h.location_text from hangouts h where h.id = r.target_id)
    when 'message' then (select m.body         from messages m where m.id = r.target_id)
  end as content,
  case r.target_type
    when 'hangout' then exists (select 1 from hangouts h where h.id = r.target_id)
    when 'message' then exists (select 1 from messages m where m.id = r.target_id)
    else false
  end as still_exists
from public.reports r
where public.is_staff(r.group_id);

grant select on public.report_queue to authenticated;

-- ── Acting on a report without learning who wrote it ──────────────────────

create or replace function public.resolve_report(p_report uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare r record;
begin
  select * into r from reports where id = p_report;
  if not found or not public.is_staff(r.group_id) then
    raise exception 'Not allowed';
  end if;
  update reports set resolved_at = now() where id = p_report;
end;
$$;

create or replace function public.delete_reported_content(p_report uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare r record;
begin
  select * into r from reports where id = p_report;
  if not found or not public.is_staff(r.group_id) then
    raise exception 'Not allowed';
  end if;

  if r.target_type = 'hangout' then
    delete from hangouts where id = r.target_id;
  elsif r.target_type = 'message' then
    delete from messages where id = r.target_id;
  end if;

  update reports set resolved_at = now() where id = p_report;
end;
$$;

-- Removes whoever posted the reported thing. The caller never sees who that
-- was; the lookup happens in here and the id never leaves the function.
create or replace function public.remove_reported_author(p_report uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare
  r     record;
  v_uid uuid;
begin
  select * into r from reports where id = p_report;
  if not found or not public.is_staff(r.group_id) then
    raise exception 'Not allowed';
  end if;

  if r.target_type = 'hangout' then
    select author_id into v_uid from hangouts where id = r.target_id;
  elsif r.target_type = 'message' then
    select user_id into v_uid from messages where id = r.target_id;
  end if;

  if v_uid is null then
    raise exception 'That post is already gone, so there is nobody left to remove.';
  end if;

  if exists (select 1 from group_members
              where group_id = r.group_id and user_id = v_uid
                and role in ('owner', 'mod')) then
    raise exception 'That was posted by an owner or moderator. Remove them from the members list instead.';
  end if;

  update group_members set status = 'banned'
   where group_id = r.group_id and user_id = v_uid;

  update reports set resolved_at = now() where id = p_report;
end;
$$;

-- ── Join code rotation ────────────────────────────────────────────────────

create or replace function public.regenerate_join_code(p_group uuid)
returns text language plpgsql security definer
set search_path = public as $$
declare v_code text;
begin
  if not exists (select 1 from groups where id = p_group and owner_id = auth.uid()) then
    raise exception 'Only the owner can change the join code';
  end if;

  loop
    v_code := string_agg(
      substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
             (random() * 31)::int + 1, 1), '')
      from generate_series(1, 6);
    exit when not exists (select 1 from groups where join_code = v_code);
  end loop;

  update groups set join_code = v_code where id = p_group;
  return v_code;
end;
$$;

-- ── Approving and removing members ────────────────────────────────────────
-- Both are plain table writes covered by members_staff_write / members_delete,
-- but wrapping them keeps owners from locking themselves out or being removed.

create or replace function public.set_member_status(
  p_group uuid, p_user uuid, p_status text
)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_staff(p_group) then
    raise exception 'Not allowed';
  end if;
  if p_status not in ('approved', 'banned') then
    raise exception 'Unknown status';
  end if;
  if exists (select 1 from groups where id = p_group and owner_id = p_user) then
    raise exception 'The owner cannot be removed from their own group.';
  end if;

  update group_members set status = p_status
   where group_id = p_group and user_id = p_user;
end;
$$;

create or replace function public.remove_member(p_group uuid, p_user uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_staff(p_group) then
    raise exception 'Not allowed';
  end if;
  if exists (select 1 from groups where id = p_group and owner_id = p_user) then
    raise exception 'The owner cannot be removed from their own group.';
  end if;

  delete from group_members where group_id = p_group and user_id = p_user;
end;
$$;
