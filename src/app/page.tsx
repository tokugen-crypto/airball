/**
 * Static preview of the group board.
 *
 * No data, no auth yet — this exists so the look and feel is settled before
 * Supabase goes in (M1). Every card below is hardcoded.
 */

type Tag = "live" | "airball" | "rebound" | null;

const HANGOUTS: {
  id: string;
  place: string;
  when: string;
  alias: string;
  note?: string;
  here: number;
  otw: number;
  replies: number;
  tag: Tag;
}[] = [
  {
    id: "1",
    place: "Club Library, 3rd floor",
    when: "now · until 5:00",
    alias: "Cuber #4",
    note: "back tables by the windows, got a spare 3x3",
    here: 3,
    otw: 2,
    replies: 6,
    tag: "live",
  },
  {
    id: "2",
    place: "Student Union, food court",
    when: "6:30 · until 8:00",
    alias: "Cuber #11",
    note: "dinner then solves?",
    here: 0,
    otw: 1,
    replies: 2,
    tag: null,
  },
  {
    id: "3",
    place: "Engineering lounge",
    when: "2:00 · ended",
    alias: "Cuber #7",
    here: 0,
    otw: 0,
    replies: 0,
    tag: "airball",
  },
  {
    id: "4",
    place: "Quad, north lawn",
    when: "yesterday",
    alias: "Cuber #2",
    note: "nice out, bring cubes",
    here: 0,
    otw: 0,
    replies: 3,
    tag: "rebound",
  },
];

const GROUPS = [
  { id: "a", initials: "RC", active: true },
  { id: "b", initials: "SW", active: false },
  { id: "c", initials: "CS", active: false },
];

function TagBadge({ tag }: { tag: Tag }) {
  if (tag === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold">
        <span className="size-1.5 rounded-full bg-gold" />
        LIVE
      </span>
    );
  }
  if (tag === "airball") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-shrug/10 px-2.5 py-1 text-xs font-semibold text-shrug">
        🏀 AIRBALL
      </span>
    );
  }
  if (tag === "rebound") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green/12 px-2.5 py-1 text-xs font-semibold text-green">
        REBOUND
      </span>
    );
  }
  return null;
}

function HangoutCard({ h }: { h: (typeof HANGOUTS)[number] }) {
  const dimmed = h.tag === "airball";

  return (
    <article
      className={`rounded-2xl border border-line bg-surface p-4 transition-colors ${
        dimmed ? "opacity-60" : ""
      } ${h.tag === "live" ? "border-gold/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-text">
            {h.place}
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            {h.when} · {h.alias}
          </p>
        </div>
        <TagBadge tag={h.tag} />
      </div>

      {h.note && <p className="mt-3 text-sm text-muted">{h.note}</p>}

      {/* The counter. When people are actually there, this is the whole product. */}
      {h.here > 0 && (
        <div className="mt-4 flex items-baseline gap-2">
          <span className="animate-pop font-mono text-3xl font-bold text-gold">
            {h.here}
          </span>
          <span className="text-sm text-muted">
            here now{h.otw > 0 && ` · ${h.otw} on the way`}
          </span>
        </div>
      )}

      {h.here === 0 && h.otw > 0 && (
        <p className="mt-4 text-sm text-muted">
          <span className="font-semibold text-green">{h.otw}</span> on the way
        </p>
      )}

      {h.tag === "airball" && (
        <p className="mt-4 text-sm text-shrug">Nobody showed. Shake it off.</p>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
        {h.tag === "live" ? (
          <>
            <button className="flex-1 rounded-xl bg-green px-3 py-2.5 text-sm font-semibold text-ink active:bg-green-deep">
              I&apos;m here
            </button>
            <button className="rounded-xl border border-line px-3 py-2.5 text-sm font-medium text-muted active:bg-raised">
              On my way
            </button>
          </>
        ) : h.tag === null ? (
          <>
            <button className="flex-1 rounded-xl bg-green px-3 py-2.5 text-sm font-semibold text-ink active:bg-green-deep">
              On my way
            </button>
            <button className="rounded-xl border border-line px-3 py-2.5 text-sm font-medium text-muted active:bg-raised">
              Maybe next time
            </button>
          </>
        ) : (
          <span className="text-sm text-muted">Closed</span>
        )}
        <span className="ml-auto shrink-0 text-sm text-muted">
          {h.replies > 0 ? `${h.replies} 💬` : ""}
        </span>
      </div>
    </article>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-dvh">
      {/* Group rail — Discord's structure, GroupMe's friendliness. */}
      <nav className="flex w-16 shrink-0 flex-col items-center gap-3 border-r border-line bg-surface/50 py-4">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            className={`grid size-11 place-items-center rounded-2xl text-sm font-bold transition-colors ${
              g.active
                ? "bg-green text-ink"
                : "bg-raised text-muted active:bg-line"
            }`}
          >
            {g.initials}
          </button>
        ))}
        <button className="grid size-11 place-items-center rounded-2xl border border-dashed border-line text-xl text-muted active:bg-raised">
          +
        </button>
      </nav>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b border-line bg-ink/90 px-4 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold">Rubik&apos;s Cube Club</h1>
              <p className="text-xs text-muted">18 members · code 7F2K9Q</p>
            </div>
            <button className="shrink-0 rounded-xl bg-green px-4 py-2.5 text-sm font-semibold text-ink active:bg-green-deep">
              Post
            </button>
          </div>
        </header>

        <div className="space-y-3 p-4 pb-24">
          {HANGOUTS.map((h) => (
            <HangoutCard key={h.id} h={h} />
          ))}

          <p className="pt-4 text-center text-xs text-muted">
            Static preview · no data wired up yet
          </p>
        </div>
      </main>
    </div>
  );
}
