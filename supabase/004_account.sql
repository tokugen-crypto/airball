-- ══════════════════════════════════════════════════════════════════════════
-- Migration 004 — deleting your own account.
--
-- Run after 003. Safe to re-run.
--
-- Supabase gives the browser no way to delete an auth user, so this runs as
-- the definer. Every table referencing auth.users cascades, so one delete
-- takes the profile, memberships, posts, replies and attendance with it.
--
-- The guard matters: groups.owner_id also cascades, so an owner deleting
-- their account would silently destroy the group for everyone in it. A club
-- of eighteen people should not vanish because one person closed an account.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.delete_own_account()
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_blocking text;
begin
  select string_agg(g.name, ', ') into v_blocking
    from groups g
   where g.owner_id = auth.uid()
     and (select count(*) from group_members m
           where m.group_id = g.id and m.status = 'approved') > 1;

  if v_blocking is not null then
    raise exception
      'You still own these groups, and other people are in them: %. Delete the group or remove the other members first.',
      v_blocking using errcode = 'P0001';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

-- Owners can already delete a group (groups_delete policy in schema.sql);
-- this just makes the escape hatch above reachable from the interface.
