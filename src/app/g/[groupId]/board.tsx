"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchBoard,
  whenLabel,
  type BoardData,
  type HangoutRow,
} from "@/lib/board";
import {
  arrive,
  clearRsvp,
  deleteHangout,
  leave,
  postHangout,
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

  // Realtime: any arrival, RSVP, message or new post refetches the board.
  // RLS applies to these events too, so we only hear about groups we're in.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refetch = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        setData(await fetchBoard(supabase, groupId, userId));
      }, 120);
    };

    const channel = supabase.channel(`board:${groupId}`);
    for (const table of ["attendance", "rsvps", "messages", "hangouts"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        refetch,
      );
    }
    channel.subscribe();

    // Airball tags appear with the passage of time, not a database write, so
    // poll slowly as a backstop.
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

      <div className="mt-6 space-y-3">
        {live.length === 0 && past.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-muted">
            Nothing going on. Post where you are.
          </p>
        )}

        {live.map((h) => (
          <Card
            key={h.id}
            h={h}
            groupId={groupId}
            userId={userId}
            myRsvp={data.myRsvps[h.id]}
            iAmHere={data.myPresence.includes(h.id)}
          />
        ))}

        {past.length > 0 && (
          <h2 className="pt-4 text-sm font-semibold tracking-wide text-muted uppercase">
            Earlier
          </h2>
        )}
        {past.map((h) => (
          <Card
            key={h.id}
            h={h}
            groupId={groupId}
            userId={userId}
            myRsvp={data.myRsvps[h.id]}
            iAmHere={false}
          />
        ))}
      </div>
    </>
  );
}

/* ── Posting ─────────────────────────────────────────────────────────────
   No date picker. Two rows of chips and a text field. */

const STARTS = [
  { v: 0, label: "Now" },
  { v: 15, label: "15 min" },
  { v: 30, label: "30 min" },
  { v: 60, label: "1 hr" },
];
const DURATIONS = [
  { v: 60, label: "1 hr" },
  { v: 120, label: "2 hr" },
  { v: 180, label: "3 hr" },
];

function PostForm({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(0);
  const [duration, setDuration] = useState(120);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState<PostState, FormData>(
    async (prev, fd) => {
      const result = await postHangout(prev, fd);
      if (!result) {
        formRef.current?.reset();
        setOpen(false);
      }
      return result;
    },
    null,
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl bg-green px-4 py-4 font-semibold text-ink active:bg-green-deep"
      >
        Post where you are
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-2xl border border-line bg-surface p-4"
    >
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="start_offset" value={start} />
      <input type="hidden" name="duration" value={duration} />

      <input
        name="location_text"
        required
        autoFocus
        maxLength={120}
        placeholder="Library, 3rd floor, back tables"
        className="w-full rounded-xl border border-line bg-ink px-3.5 py-3 outline-none placeholder:text-muted/50 focus:border-green"
      />

      <ChipRow label="Starting">
        {STARTS.map((s) => (
          <Chip key={s.v} on={start === s.v} onClick={() => setStart(s.v)}>
            {s.label}
          </Chip>
        ))}
      </ChipRow>

      <ChipRow label="For">
        {DURATIONS.map((d) => (
          <Chip
            key={d.v}
            on={duration === d.v}
            onClick={() => setDuration(d.v)}
          >
            {d.label}
          </Chip>
        ))}
      </ChipRow>

      <input
        name="note"
        maxLength={200}
        placeholder="Anything else? (optional)"
        className="mt-3 w-full rounded-xl border border-line bg-ink px-3.5 py-2.5 text-sm outline-none placeholder:text-muted/50 focus:border-green"
      />

      {state?.error && (
        <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {state.error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-xl bg-green px-4 py-3 font-semibold text-ink active:bg-green-deep disabled:opacity-50"
        >
          {pending ? "…" : "Post"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-line px-4 py-3 text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ChipRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <span className="mb-1.5 block text-xs font-medium text-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
        on
          ? "bg-green text-ink"
          : "border border-line text-muted active:bg-raised"
      }`}
    >
      {children}
    </button>
  );
}

/* ── A hangout card ──────────────────────────────────────────────────────── */

function Card({
  h,
  groupId,
  userId,
  myRsvp,
  iAmHere,
}: {
  h: HangoutRow;
  groupId: string;
  userId: string;
  myRsvp?: "otw" | "maybe_next_time";
  iAmHere: boolean;
}) {
  const [busy, start] = useTransition();
  const mine = h.author_id === userId;
  const started = Date.now() >= new Date(h.starts_at).getTime();

  // Pop the counter only when it actually changes.
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
    <article
      className={`rounded-2xl border bg-surface p-4 ${
        h.tag === "airball" ? "border-line opacity-60" : ""
      } ${h.here_count > 0 ? "border-gold/40" : "border-line"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{h.location_text}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {whenLabel(h)} · {h.author_alias ?? "someone"}
            {mine && " (you)"}
          </p>
        </div>
        <Tag tag={h.tag} live={h.here_count > 0 && h.is_open} />
      </div>

      {h.note && <p className="mt-3 text-sm text-muted">{h.note}</p>}

      {h.here_count > 0 && (
        <div className="mt-4 flex items-baseline gap-2">
          <span
            className={`font-mono text-3xl font-bold text-gold ${
              popped ? "animate-pop" : ""
            }`}
          >
            {h.here_count}
          </span>
          <span className="text-sm text-muted">
            here now
            {h.otw_count > 0 && ` · ${h.otw_count} on the way`}
          </span>
        </div>
      )}

      {h.here_count === 0 && h.otw_count > 0 && (
        <p className="mt-4 text-sm text-muted">
          <span className="font-semibold text-green">{h.otw_count}</span> on the
          way
        </p>
      )}

      {h.tag === "airball" && (
        <p className="mt-4 text-sm text-shrug">Nobody showed. Shake it off.</p>
      )}

      {h.is_open && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {started && (
            <button
              disabled={busy}
              onClick={() =>
                start(() =>
                  iAmHere
                    ? leave(h.id, groupId).then(() => {})
                    : arrive(h.id, groupId).then(() => {}),
                )
              }
              className={`rounded-xl px-3.5 py-2.5 text-sm font-semibold disabled:opacity-50 ${
                iAmHere
                  ? "border border-line text-danger"
                  : "bg-green text-ink active:bg-green-deep"
              }`}
            >
              {iAmHere ? "Leaving" : "I'm here"}
            </button>
          )}

          <button
            disabled={busy}
            onClick={() =>
              start(() =>
                myRsvp === "otw"
                  ? clearRsvp(h.id, groupId).then(() => {})
                  : setRsvp(h.id, groupId, "otw", null).then(() => {}),
              )
            }
            className={`rounded-xl px-3.5 py-2.5 text-sm font-medium disabled:opacity-50 ${
              myRsvp === "otw"
                ? "bg-green/15 text-green"
                : "border border-line text-muted active:bg-raised"
            }`}
          >
            {myRsvp === "otw" ? "On my way ✓" : "On my way"}
          </button>

          <button
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
            className={`rounded-xl px-3.5 py-2.5 text-sm font-medium disabled:opacity-50 ${
              myRsvp === "maybe_next_time"
                ? "bg-raised text-text"
                : "border border-line text-muted active:bg-raised"
            }`}
          >
            Maybe next time
          </button>
        </div>
      )}

      {mine && (
        <button
          disabled={busy}
          onClick={() => start(() => deleteHangout(h.id, groupId).then(() => {}))}
          className="mt-3 text-xs text-muted underline underline-offset-4"
        >
          Delete
        </button>
      )}
    </article>
  );
}

function Tag({
  tag,
  live,
}: {
  tag: HangoutRow["tag"];
  live: boolean;
}) {
  if (live)
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-semibold text-gold">
        <span className="size-1.5 rounded-full bg-gold" />
        LIVE
      </span>
    );
  if (tag === "airball")
    return (
      <span className="shrink-0 rounded-full bg-shrug/10 px-2.5 py-1 text-xs font-semibold text-shrug">
        🏀 AIRBALL
      </span>
    );
  if (tag === "rebound")
    return (
      <span className="shrink-0 rounded-full bg-green/15 px-2.5 py-1 text-xs font-semibold text-green">
        REBOUND
      </span>
    );
  return null;
}
