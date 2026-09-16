"use client";

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

export default function Board({
  groupId,
  userId,
  initial,
}: {
  groupId: string;
  userId: string;
  initial: BoardData;
}) {
  const [data, setData] = useState(initial);
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

  return (
    <>
      <PostForm groupId={groupId} />

      <div className="mt-4 space-y-4">
        {live.length === 0 && past.length === 0 && (
          <p className="border border-line bg-card px-6 py-12 text-center text-sm text-muted">
            Nothing going on. Post where you are.
          </p>
        )}

        {live.map((h) => (
          <Card
            key={h.id}
            h={h}
            groupId={groupId}
            myRsvp={data.myRsvps[h.id]}
            iAmHere={data.myPresence.includes(h.id)}
          />
        ))}

        {past.length > 0 && (
          <h2 className="pt-2 text-center text-xs font-semibold tracking-wide text-muted uppercase">
            Earlier
          </h2>
        )}
        {past.map((h) => (
          <Card
            key={h.id}
            h={h}
            groupId={groupId}
            myRsvp={data.myRsvps[h.id]}
            iAmHere={false}
          />
        ))}
      </div>
    </>
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

function PostForm({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState<PostState, FormData>(
    async (prev, fd) => {
      const result = await postHangout(prev, fd);
      if (!result) {
        formRef.current?.reset();
        setOpen(false);
        setStart(0);
      }
      return result;
    },
    null,
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border border-line bg-card px-4 py-4 text-sm font-semibold text-green active:bg-page"
      >
        + Post where you are
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="border border-line bg-card">
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="start_offset" value={start} />

      <div className="border-b border-line-soft px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase">
        New hangout
      </div>

      <div className="space-y-2.5 p-4">
        <input
          name="location_text"
          required
          autoFocus
          maxLength={120}
          placeholder="Library, 3rd floor, back tables"
          className="w-full border border-line bg-page px-2.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-muted"
        />

        <div className="flex flex-wrap gap-1.5">
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
          className="w-full border border-line bg-page px-2.5 py-2.5 text-xs outline-none placeholder:text-muted focus:border-muted"
        />

        {state?.error && (
          <p className="text-center text-sm text-danger">{state.error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="flex-1 bg-green py-2.5 text-sm font-semibold text-white active:bg-green-deep disabled:opacity-40"
          >
            {pending ? "…" : "Share"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="border border-line px-4 py-2.5 text-sm font-semibold text-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

/* ── A hangout, shaped like a post ───────────────────────────────────────── */

function Card({
  h,
  groupId,
  myRsvp,
  iAmHere,
}: {
  h: HangoutRow;
  groupId: string;
  myRsvp?: "otw" | "maybe_next_time";
  iAmHere: boolean;
}) {
  const [busy, start] = useTransition();
  const [threadOpen, setThreadOpen] = useState(false);
  const mine = h.is_mine;
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
    <article className="border border-line bg-card">
      {/* Header: avatar, alias, and the place as the location line. */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="ring-letter grid size-8 shrink-0 place-items-center rounded-full">
          <span className="grid size-[28px] place-items-center rounded-full bg-card text-xs font-bold">
            {letter}
          </span>
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">
            {h.author_alias ?? "Someone"}
            {mine && <span className="font-normal text-muted"> · you</span>}
          </p>
          <p className="truncate text-xs text-muted">{h.location_text}</p>
        </div>
        <Tag tag={h.tag} live={h.here_count > 0 && h.is_open} />
      </div>

      {/* Where the photo would go. */}
      <div className="border-y border-line-soft bg-gradient-to-br from-green-soft to-gold-soft px-6 py-10 text-center">
        {h.here_count > 0 ? (
          <>
            <p
              className={`font-mono text-6xl leading-none font-bold text-gold ${
                popped ? "animate-pop" : ""
              }`}
            >
              {h.here_count}
            </p>
            <p className="mt-2 text-sm font-semibold text-text">here right now</p>
          </>
        ) : (
          <>
            <p className="text-3xl leading-none font-semibold text-text">
              {whenLabel(h)}
            </p>
            <p className="mt-2 text-sm text-muted">
              {h.is_open
                ? h.otw_count > 0
                  ? "nobody's arrived yet"
                  : "be the first one there"
                : "this one's over"}
            </p>
          </>
        )}
      </div>

      {/* Action row, Instagram's icon strip. */}
      {h.is_open && (
        <div className="flex items-center gap-4 px-3 pt-2.5">
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
          <button
            onClick={() => setThreadOpen((o) => !o)}
            className="ml-auto text-muted"
            aria-label="Replies"
          >
            <ChatIcon />
          </button>
        </div>
      )}

      {/* The "N likes" line. */}
      <div className="px-3 pt-2 text-sm">
        {h.here_count > 0 && (
          <p className="font-semibold">
            {h.here_count} here now
            {h.otw_count > 0 && (
              <span className="font-normal text-muted">
                {" "}
                · {h.otw_count} on the way
              </span>
            )}
          </p>
        )}
        {h.here_count === 0 && h.otw_count > 0 && (
          <p className="font-semibold">
            {h.otw_count} on the way
          </p>
        )}

        {h.note && (
          <p className="mt-0.5">
            <span className="font-semibold">{h.author_alias}</span>{" "}
            <span>{h.note}</span>
          </p>
        )}

        {h.tag === "airball" && (
          <p className="mt-1 text-shrug">Nobody showed. Shake it off.</p>
        )}

        <button
          onClick={() => setThreadOpen((o) => !o)}
          className="mt-1 block text-sm text-muted"
        >
          {h.reply_count > 0
            ? threadOpen
              ? "Hide comments"
              : `View all ${h.reply_count} ${
                  h.reply_count === 1 ? "comment" : "comments"
                }`
            : "Add a comment"}
        </button>

        <p className="mt-1.5 pb-2 text-[10px] tracking-wide text-muted uppercase">
          {timeAgo(h.created_at)}
        </p>
      </div>

      {threadOpen && (
        <Thread hangoutId={h.id} groupId={groupId} replyCount={h.reply_count} />
      )}

      {mine && (
        <div className="flex gap-4 border-t border-line-soft px-3 py-2">
          {h.is_open && (
            <button
              disabled={busy}
              onClick={() => start(() => endHangout(h.id, groupId).then(() => {}))}
              className="text-xs font-semibold text-muted"
            >
              End it
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => start(() => deleteHangout(h.id, groupId).then(() => {}))}
            className="text-xs font-semibold text-danger"
          >
            Delete
          </button>
        </div>
      )}
    </article>
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
      title={label}
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
    <div className="border-t border-line-soft">
      {msgs.length > 0 && (
        <ul className="space-y-1.5 px-3 py-2.5">
          {msgs.map((m) => (
            <li key={m.id} className="text-sm">
              <span className="font-semibold">{m.alias ?? "Someone"}</span>
              {m.is_mine && <span className="text-muted"> · you</span>}{" "}
              <span>{m.body}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 border-t border-line-soft px-3 py-2">
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
          placeholder="Add a comment…"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="shrink-0 text-sm font-semibold text-green disabled:opacity-40"
        >
          Post
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

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const S = { width: 22, height: 22, viewBox: "0 0 24 24", strokeWidth: 1.7 };

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

function ChatIcon() {
  return (
    <svg {...S} fill="none" stroke="currentColor">
      <path
        d="M20.5 11.6c0 4.1-3.8 7.4-8.5 7.4a9.7 9.7 0 0 1-2.7-.4L4 20.5l1.5-3.9A7 7 0 0 1 3.5 11.6c0-4.1 3.8-7.4 8.5-7.4s8.5 3.3 8.5 7.4Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
