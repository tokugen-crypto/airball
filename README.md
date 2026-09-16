# Airball

Post where you are. See who shows up.

A group-gated app for spontaneous, in-person hangouts. You post a place and a
time to a group you belong to, people reply "on my way", and a live counter
shows how many are actually there right now. If an hour passes and nobody
answered, the post gets tagged **🏀 Airball**.

Built for a college club: everyone joins by typing a six-character code off a
screen at a meeting.

## Running it locally

```bash
npm install
cp .env.local.example .env.local   # then paste your Supabase URL and anon key
npm run dev
```

Open http://localhost:3000. The terminal also prints a Network address — use
that to open Airball on your phone on the same wifi, which is the only way to
test what actually matters (two people, one counter).

Database setup is in [supabase/README.md](supabase/README.md). Run those SQL
files in order in the Supabase SQL Editor.

## Deploying

Free, on Vercel:

1. **vercel.com** → sign in with GitHub
2. **Add New… → Project** → import `airball`
3. Under **Environment Variables**, add the two from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**

Every push to `main` deploys automatically after that. No build settings to
change — Vercel detects Next.js on its own.

Nothing else needs configuring: Supabase is already reachable from anywhere,
so the deployed app talks to the same database as local development.

## How it's built

| | |
|---|---|
| Framework | Next.js 16 (App Router), React, TypeScript |
| Styling | Tailwind v4, tokens in `src/app/globals.css` |
| Backend | Supabase — Postgres, auth, realtime, row-level security |
| Hosting | Vercel |

Installs to a phone home screen as a PWA. No native app, no App Store, no
$99/year — a link is enough for a club that already knows each other.

## The three ideas the code is organised around

**Anonymity has to hold at the database, not in the interface.** Members read
sanitised views (`hangout_feed`, `message_feed`, `group_roster`) that carry
aliases, letters and real names but never user ids. In the raw tables you can
read only your own rows. Anonymity that survives the UI but not devtools is
not anonymity.

**Inside one hangout you're "Cuber A"; on the next one you're someone else.**
Letters are assigned randomly per hangout, so a conversation is readable while
nobody can be followed around the board. You can see *who is in the group* —
that's the roster, by real name — and still not know who posted what.

**Nothing about a hangout's state is stored.** Open or closed comes from
`ends_at`, the Airball tag from response timestamps. No cron, no workers,
nothing to keep running.

## Moderation, and why it looks odd

There is **no block button**. Blocking would identify people by subtraction:
block someone, watch which posts disappear, and you know who wrote them. In a
group where joining is already gated, the remedy is the owner removing someone.

And **owners can't see who wrote reported content**. If they could, reporting
any post would become a way to unmask its author. Staff delete the content or
remove whoever posted it through functions that look the author up internally
and never return it.

## What isn't built

- Push notifications — the real reason to go native later; "someone just
  posted" needs to reach a phone in seconds, and iOS web push is unreliable
- Public groups and discovery
- Photos, DMs, reactions, recurring events
- Password reset (needs an email provider; Resend's free tier covers it)
