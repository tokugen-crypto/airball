# Database

Run these in the Supabase **SQL Editor**, in this order. Each one is safe to
re-run — if a run fails partway, fix the error and run the whole file again.

| # | File | What it does |
|---|------|--------------|
| 1 | `schema.sql` | Tables, row-level security, the feed view, join-by-code |
| 2 | `002_anonymity_and_open_ended.sql` | Drops the number from aliases; hangouts stop needing an end time |
| 3 | `003_thread_letters.sql` | Per-thread letters; closes the user-id leak; identity-free realtime pings |
| 4 | `004_account.sql` | Deleting your own account, guarded against wiping a group you own |
| 5 | `005_airball_only_and_roster.sql` | Removes Rebound; adds the group roster view |

A fresh project needs all five. An existing one needs only the files it hasn't
run yet.

## The two rules the schema is built around

**No user id ever reaches another member.** Peers read `hangout_feed`,
`message_feed` and `group_roster` — views that carry aliases, letters and real
names but never ids. In the raw tables, members can read only their own rows.
This is why anonymity holds in devtools and not just in the interface.

**Nothing about a hangout's state is stored.** Open/closed comes from
`ends_at`, and the Airball tag from response timestamps. There are no
scheduled jobs, which the free tier doesn't really provide anyway.

## Why the roster shows real names

Seeing who is in the group and not knowing who posted are separate facts. The
roster is deliberately public within a group; the feeds carry no ids, so the
two never join up.

## Gotchas worth remembering

- `CREATE OR REPLACE VIEW` can only append columns. Any change to shape needs
  `DROP VIEW` first — this bit us once already.
- Membership checks must go through the `SECURITY DEFINER` helpers
  (`is_member`, `is_staff`). Reading `group_members` inside a policy *on*
  `group_members` recurses forever and every query fails.
- Realtime applies row-level security, so it can't be pointed at the locked
  tables. That's what `activity_pings` is for.
