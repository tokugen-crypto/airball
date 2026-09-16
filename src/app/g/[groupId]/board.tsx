"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchBoard,
  fetchMessages,
  whenLabel,
  type BoardData,
  type HangoutRow,
  type MessageRow,
} from "@/lib/board";
import { signOut } from "@/app/login/actions";
import {
  arrive,
  clearRsvp,
  deleteHangout,
  endHangout,
  leave,
  postHangout,
  sendMessage,
  setRsvp,
  type PostState,
} from "./actions";

type GroupRef = { id: string; name: string };

export default function Shell({
  groupId,
  userId,
  initial,
  groups,
  group,
  myAlias,
  memberCount,
}: {
  groupId: string;
  userId: string;
  initial: BoardData;
  groups: GroupRef[];
  group: { name: string; joinCode: string; requiresApproval: boolean };
  myAlias: string;
  memberCount: number;
}) {
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState<string | "new" | null>(
    () => initial.hangouts.find((h) => h.is_open)?.id ?? null,
  );
  const [drawer, setDrawer] = useState(false);
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refetch = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        setData(await fetchBoard(supabase, groupId, userId));
      }, 120);
    };

    // Subscribe to activity_pings, not the real tables: those carry user ids,
    // and a websocket payload is as public as the UI. A ping says only "this
    // group changed" — we then refetch through the sanitised views.
    const channel = supabase
      .channel(`board:${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_pings",
          filter: `group_id=eq.${groupId}`,
        },
        refetch,
      )
      .subscribe();

    // Airball tags appear with the passage of time, not a write, so poll slowly.
    const tick = setInterval(refetch, 60_000);

    return () => {
      clearTimeout(timer);
      clearInterval(tick);
      supabase.removeChannel(channel);
    };
  }, [supabase, groupId, userId]);

  const live = data.hangouts.filter((h) => h.is_open);
  const past = data.hangouts.filter((h) => !h.is_open);
  const current =
    selected && selected !== "new"
      ? (data.hangouts.find((h) => h.id === selected) ?? null)
      : null;

  const open = (id: string | "new") => {
    setSelected(id);
    setDrawer(false);
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Backdrop for the mobile drawer. */}
      {drawer && (
        <button
          aria-label="Close menu"
          onClick={() => setDrawer(false)}
          className="fixed inset-0 z-20 bg-text/20 md:hidden"
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-30 flex transition-transform duration-200 md:static md:translate-x-0 ${
          drawer ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <GroupRail groups={groups} activeId={groupId} />
        <Sidebar
          group={group}
          memberCount={memberCount}
          myAlias={myAlias}
          live={live}
          past={past}
          selected={selected}
          onSelect={open}
        />
      </div>

      <main className="flex min-w-0 flex-1 flex-col bg-card">
        {/* Mobile-only bar: the sidebar is a drawer at this width. */}
        <div className="flex h-[54px] shrink-0 items-center gap-3 border-b border-line px-4 md:hidden">
          <button
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="text-xl leading-none"
          >
            ☰
          </button>
          <span className="truncate text-sm font-semibold">
            {selected === "new"
              ? "New hangout"
              : (current?.location_text ?? group.name)}
          </span>
        </div>

        {selected === "new" ? (
          <PostPane groupId={groupId} onDone={(id) => setSelected(id)} />
        ) : current ? (
          <Detail
            key={current.id}
            h={current}
            groupId={groupId}
            myRsvp={data.myRsvps[current.id]}
            iAmHere={data.myPresence.includes(current.id)}
            onGone={() => setSelected(null)}
          />
        ) : (
          <Empty onNew={() => open("new")} hasAny={data.hangouts.length > 0} />
        )}
      </main>
    </div>
  );
}

/* ── The rail: one circle per group ──────────────────────────────────────── */

function GroupRail({
  groups,
  activeId,
}: {
  groups: GroupRef[];
  activeId: string;
}) {
  return (
    <nav className="flex w-[68px] shrink-0 flex-col items-center gap-2 border-r border-line bg-page py-3">
      {groups.map((g) => {
        const active = g.id === activeId;
        return (
          <Link
            key={g.id}
            href={`/g/${g.id}`}
            title={g.name}
            className="group relative grid place-items-center"
          >
            {/* Discord's active pill. */}
            <span
              className={`absolute -left-3 w-1 rounded-r bg-text transition-all ${
                active ? "h-6" : "h-0"
              }`}
            />
            <span
              className={`grid size-11 place-items-center rounded-full text-xs font-bold transition-all ${
                active
                  ? "ring-letter"
                  : "bg-card text-muted ring-1 ring-line ring-inset"
              }`}
            >
              {active ? (
                <span className="grid size-[38px] place-items-center rounded-full bg-card text-text">
                  {g.name.slice(0, 2).toUpperCase()}
                </span>
              ) : (
                g.name.slice(0, 2).toUpperCase()
              )}
            </span>
          </Link>
        );
      })}

      <Link
        href="/groups"
        title="Join or start a group"
        className="grid size-11 place-items-center rounded-full border border-dashed border-line text-lg text-green"
      >
        +
      </Link>
    </nav>
  );
}

/* ── The channel list ────────────────────────────────────────────────────── */

function Sidebar({
  group,
  memberCount,
  myAlias,
  live,
  past,
  selected,
  onSelect,
}: {
  group: { name: string; joinCode: string; requiresApproval: boolean };
  memberCount: number;
  myAlias: string;
  live: HangoutRow[];
  past: HangoutRow[];
  selected: string | "new" | null;
  onSelect: (id: string | "new") => void;
}) {
  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-line bg-page">
      <header className="shrink-0 border-b border-line px-4 py-3">
        <p className="truncate text-sm font-semibold">{group.name}</p>
        <p className="mt-0.5 text-xs text-muted">
          {memberCount} member{memberCount === 1 ? "" : "s"} · code{" "}
          <span className="font-mono tracking-wider text-gold">
            {group.joinCode}
          </span>
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <button
          onClick={() => onSelect("new")}
          className={`mb-3 w-full border px-3 py-2 text-left text-sm font-semibold transition-colors ${
            selected === "new"
              ? "border-green bg-green-soft text-green"
              : "border-line bg-card text-green hover:bg-green-soft"
          }`}
        >
          + Post where you are
        </button>

        <Section title={`Happening now — ${live.length}`} />
        {live.length === 0 && (
          <p className="px-3 pb-3 text-xs text-muted">Nothing going on.</p>
        )}
        {live.map((h) => (
          <ChannelItem
            key={h.id}
            h={h}
            active={h.id === selected}
            onClick={() => onSelect(h.id)}
          />
        ))}

        {past.length > 0 && (
          <>
            <Section title={`Earlier — ${past.length}`} />
            {past.map((h) => (
              <ChannelItem
                key={h.id}
                h={h}
                active={h.id === selected}
                onClick={() => onSelect(h.id)}
              />
            ))}
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2.5">
        <span className="ring-letter grid size-8 shrink-0 place-items-center rounded-full">
          <span className="grid size-[28px] place-items-center rounded-full bg-page text-[10px] font-bold">
            {myAlias.slice(0, 1).toUpperCase() || "?"}
          </span>
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-xs font-semibold">
            {myAlias}
          </span>
          <span className="block text-[11px] text-muted">anonymous here</span>
        </span>
        <form action={signOut}>
          <button className="text-[11px] font-semibold text-muted hover:text-danger">
            Log out
          </button>
        </form>
      </footer>
    </aside>
  );
}

function Section({ title }: { title: string }) {
  return (
    <p className="px-3 pt-2 pb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
      {title}
    </p>
  );
}

function ChannelItem({
  h,
  active,
  onClick,
}: {
  h: HangoutRow;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`mb-0.5 flex w-full items-center gap-2 rounded px-3 py-2 text-left transition-colors ${
        active ? "bg-card shadow-[inset_0_0_0_1px_var(--color-line)]" : "hover:bg-card/70"
      }`}
    >
      <span className="min-w-0 flex-1 leading-tight">
        <span
          className={`block truncate text-sm ${
            active ? "font-semibold text-text" : "text-text/80"
          }`}
        >
          <span className="text-muted">#</span> {h.location_text}
        </span>
        <span className="block truncate text-[11px] text-muted">
          {whenLabel(h)} · {h.author_alias}
        </span>
      </span>

      {h.here_count > 0 ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold-soft px-1.5 py-0.5 text-[11px] font-bold text-gold">
          <span className="size-1.5 rounded-full bg-gold-bright" />
          {h.here_count}
        </span>
      ) : h.tag === "airball" ? (
        <span className="shrink-0 text-[11px]">🏀</span>
      ) : h.otw_count > 0 ? (
        <span className="shrink-0 text-[11px] font-bold text-green">
          {h.otw_count}
        </span>
      ) : null}
    </button>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */

function Empty({ onNew, hasAny }: { onNew: () => void; hasAny: boolean }) {
  return (
    <div className="grid flex-1 place-items-center px-6 text-center">
      <div>
        <p className="font-script text-5xl leading-none text-text">Airball</p>
        <p className="mt-3 text-sm text-muted">
          {hasAny
            ? "Pick a hangout on the left."
            : "Nobody's posted yet. Be the first."}
        </p>
        <button
          onClick={onNew}
          className="mt-5 bg-green px-5 py-2.5 text-sm font-semibold text-white active:bg-green-deep"
        >
          Post where you are
        </button>
      </div>
    </div>
  );
}

/* ── Posting ─────────────────────────────────────────────────────────────
   No date picker and no duration. A place, when it starts, and that's it. */

const STARTS = [
  { v: 0, label: "Now" },
  { v: 15, label: "15 min" },
  { v: 30, label: "30 min" },
  { v: 60, label: "1 hr" },
];

function PostPane({
  groupId,
  onDone,
}: {
  groupId: string;
  onDone: (id: null) => void;
}) {
  const [start, setStart] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState<PostState, FormData>(
    async (prev, fd) => {
      const result = await postHangout(prev, fd);
      if (!result) {
        formRef.current?.reset();
        setStart(0);
        onDone(null);
      }
      return result;
    },
    null,
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[520px] px-5 py-8">
        <h2 className="text-lg font-semibold">Post where you are</h2>
        <p className="mt-1 text-sm text-muted">
          You&apos;ll show as anonymous. People reply with “on my way”, and the
          counter shows who&apos;s actually turned up.
        </p>

        <form ref={formRef} action={formAction} className="mt-5 space-y-2.5">
          <input type="hidden" name="group_id" value={groupId} />
          <input type="hidden" name="start_offset" value={start} />

          <input
            name="location_text"
            required
            autoFocus
            maxLength={120}
            placeholder="Library, 3rd floor, back tables"
            className="w-full border border-line bg-page px-3 py-3 text-sm outline-none placeholder:text-muted focus:border-muted"
          />

          <div className="flex flex-wrap gap-1.5 pt-1">
            {STARTS.map((s) => (
              <button
                key={s.v}
                type="button"
                onClick={() => setStart(s.v)}
                className={`border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  start === s.v
                    ? "border-green bg-green-soft text-green"
                    : "border-line text-muted"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <input
            name="note"
            maxLength={200}
            placeholder="Anything else? (optional)"
            className="w-full border border-line bg-page px-3 py-2.5 text-xs outline-none placeholder:text-muted focus:border-muted"
          />

          {state?.error && (
            <p className="text-sm text-danger">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-green py-3 text-sm font-semibold text-white active:bg-green-deep disabled:opacity-40"
          >
            {pending ? "…" : "Share"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── One hangout, filling the main pane ──────────────────────────────────── */

function Detail({
  h,
  groupId,
  myRsvp,
  iAmHere,
  onGone,
}: {
  h: HangoutRow;
  groupId: string;
  myRsvp?: "otw" | "maybe_next_time";
  iAmHere: boolean;
  onGone: () => void;
}) {
  const [busy, start] = useTransition();
  const letter = (h.author_alias ?? "?").split(" ").pop() ?? "?";

  const prev = useRef(h.here_count);
  const [popped, setPopped] = useState(false);
  useEffect(() => {
    if (prev.current !== h.here_count) {
      prev.current = h.here_count;
      setPopped(true);
      const t = setTimeout(() => setPopped(false), 400);
      return () => clearTimeout(t);
    }
  }, [h.here_count]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Channel header */}
      <header className="hidden h-[54px] shrink-0 items-center gap-2.5 border-b border-line px-5 md:flex">
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-semibold">
            <span className="text-muted">#</span> {h.location_text}
          </span>
          <span className="block truncate text-xs text-muted">
            {whenLabel(h)} · posted by {h.author_alias}
            {h.is_mine && " (you)"}
          </span>
        </span>
        <Tag tag={h.tag} live={h.here_count > 0 && h.is_open} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The counter, where a photo would be. */}
        <div className="border-b border-line-soft bg-gradient-to-br from-green-soft to-gold-soft px-6 py-10 text-center">
          <div className="mx-auto flex max-w-[420px] flex-col items-center">
            <span className="ring-letter grid size-12 place-items-center rounded-full">
              <span className="grid size-[42px] place-items-center rounded-full bg-card text-sm font-bold">
                {letter}
              </span>
            </span>

            {h.here_count > 0 ? (
              <>
                <p
                  className={`mt-4 font-mono text-7xl leading-none font-bold text-gold ${
                    popped ? "animate-pop" : ""
                  }`}
                >
                  {h.here_count}
                </p>
                <p className="mt-2 text-sm font-semibold">here right now</p>
              </>
            ) : (
              <>
                <p className="mt-4 text-4xl leading-none font-semibold">
                  {whenLabel(h)}
                </p>
                <p className="mt-2 text-sm text-muted">
                  {h.is_open
                    ? h.otw_count > 0
                      ? `nobody's arrived yet · ${h.otw_count} on the way`
                      : "be the first one there"
                    : "this one's over"}
                </p>
              </>
            )}

            {h.note && <p className="mt-4 text-sm">{h.note}</p>}

            {h.tag === "airball" && (
              <p className="mt-3 text-sm text-shrug">
                Nobody showed. Shake it off.
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        {h.is_open && (
          <div className="flex flex-wrap items-center gap-4 border-b border-line-soft px-5 py-3">
            <IconButton
              label={iAmHere ? "I'm leaving" : "I'm here"}
              active={iAmHere}
              activeClass="text-danger"
              disabled={busy}
              onClick={() =>
                start(() =>
                  iAmHere
                    ? leave(h.id, groupId).then(() => {})
                    : arrive(h.id, groupId).then(() => {}),
                )
              }
              icon={<PinIcon filled={iAmHere} />}
            />
            <IconButton
              label="On my way"
              active={myRsvp === "otw"}
              activeClass="text-green"
              disabled={busy}
              onClick={() =>
                start(() =>
                  myRsvp === "otw"
                    ? clearRsvp(h.id, groupId).then(() => {})
                    : setRsvp(h.id, groupId, "otw", null).then(() => {}),
                )
              }
              icon={<SendIcon filled={myRsvp === "otw"} />}
            />
            <IconButton
              label="Maybe next time"
              active={myRsvp === "maybe_next_time"}
              activeClass="text-muted"
              disabled={busy}
              onClick={() =>
                start(() =>
                  myRsvp === "maybe_next_time"
                    ? clearRsvp(h.id, groupId).then(() => {})
                    : setRsvp(h.id, groupId, "maybe_next_time", null).then(
                        () => {},
                      ),
                )
              }
              icon={<ClockIcon />}
            />

            {h.is_mine && (
              <span className="ml-auto flex gap-4">
                <button
                  disabled={busy}
                  onClick={() =>
                    start(() => endHangout(h.id, groupId).then(() => {}))
                  }
                  className="text-xs font-semibold text-muted"
                >
                  End it
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    start(() =>
                      deleteHangout(h.id, groupId).then(() => onGone()),
                    )
                  }
                  className="text-xs font-semibold text-danger"
                >
                  Delete
                </button>
              </span>
            )}
          </div>
        )}

        <Thread hangoutId={h.id} groupId={groupId} replyCount={h.reply_count} />
      </div>
    </div>
  );
}

function IconButton({
  label,
  icon,
  active,
  activeClass,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  activeClass: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 text-xs font-semibold disabled:opacity-40 ${
        active ? activeClass : "text-text"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ── The thread ──────────────────────────────────────────────────────────
   Letters are scoped to this hangout: the same person is a different letter
   on every post, so a conversation reads cleanly without anyone being
   traceable across the board. */

function Thread({
  hangoutId,
  groupId,
  replyCount,
}: {
  hangoutId: string;
  groupId: string;
  replyCount: number;
}) {
  const supabase = useRef(createClient()).current;
  const [msgs, setMsgs] = useState<MessageRow[]>([]);
  const [text, setText] = useState("");
  const [sending, startSend] = useTransition();

  useEffect(() => {
    let alive = true;
    fetchMessages(supabase, hangoutId).then((m) => alive && setMsgs(m));
    return () => {
      alive = false;
    };
  }, [supabase, hangoutId, replyCount]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    startSend(() =>
      sendMessage(hangoutId, groupId, body)
        .then(() => fetchMessages(supabase, hangoutId))
        .then(setMsgs),
    );
  };

  return (
    <div className="px-5 py-4">
      {msgs.length === 0 ? (
        <p className="text-sm text-muted">
          No comments yet. Ask where exactly, or whether anyone&apos;s still
          there.
        </p>
      ) : (
        <ul className="space-y-3">
          {msgs.map((m) => (
            <li key={m.id} className="flex gap-2.5">
              <span className="ring-letter mt-0.5 grid size-7 shrink-0 place-items-center rounded-full">
                <span className="grid size-[25px] place-items-center rounded-full bg-card text-[10px] font-bold">
                  {(m.alias ?? "?").split(" ").pop()}
                </span>
              </span>
              <span className="min-w-0 text-sm">
                <span className="font-semibold">{m.alias ?? "Someone"}</span>
                {m.is_mine && (
                  <span className="text-muted"> · you</span>
                )}{" "}
                <span className="text-[11px] text-muted">
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span className="mt-0.5 block break-words">{m.body}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-2 border border-line bg-page px-3 py-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          maxLength={1000}
          placeholder="Message this hangout…"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="shrink-0 text-sm font-semibold text-green disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}

/* ── Bits ────────────────────────────────────────────────────────────────── */

function Tag({ tag, live }: { tag: HangoutRow["tag"]; live: boolean }) {
  if (live)
    return (
      <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold tracking-wide text-gold uppercase">
        <span className="size-1.5 rounded-full bg-gold-bright" />
        Live
      </span>
    );
  if (tag === "airball")
    return (
      <span className="shrink-0 text-[10px] font-bold tracking-wide text-shrug uppercase">
        🏀 Airball
      </span>
    );
  if (tag === "rebound")
    return (
      <span className="shrink-0 text-[10px] font-bold tracking-wide text-green uppercase">
        Rebound
      </span>
    );
  return null;
}

const S = { width: 20, height: 20, viewBox: "0 0 24 24", strokeWidth: 1.7 };

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg {...S} fill={filled ? "currentColor" : "none"} stroke="currentColor">
      <path
        d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {!filled && <circle cx="12" cy="10" r="2.6" />}
    </svg>
  );
}

function SendIcon({ filled }: { filled: boolean }) {
  return (
    <svg {...S} fill={filled ? "currentColor" : "none"} stroke="currentColor">
      <path
        d="M21.5 2.5 2.5 9.8l7.6 2.9 2.9 7.6 8.5-17.8Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg {...S} fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 1.9" strokeLinecap="round" />
    </svg>
  );
}
