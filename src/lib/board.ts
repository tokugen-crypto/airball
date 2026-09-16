import type { SupabaseClient } from "@supabase/supabase-js";

/** One row of `hangout_feed` — the view that computes airball/rebound. */
export type HangoutRow = {
  id: string;
  group_id: string;
  author_id: string;
  location_text: string;
  note: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  author_alias: string | null;
  here_count: number;
  otw_count: number;
  reply_count: number;
  first_response_at: string | null;
  is_open: boolean;
  tag: "airball" | "rebound" | null;
};

export type BoardData = {
  hangouts: HangoutRow[];
  /** hangout_id -> my RSVP */
  myRsvps: Record<string, "otw" | "maybe_next_time">;
  /** hangout_ids where I am currently marked present */
  myPresence: string[];
};

/**
 * Everything the board needs, in three queries. Shared by the server component
 * (first paint) and the client component (realtime refetch) so the two can
 * never drift apart.
 */
export async function fetchBoard(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
): Promise<BoardData> {
  const [feed, rsvps, presence] = await Promise.all([
    supabase
      .from("hangout_feed")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("rsvps").select("hangout_id, kind").eq("user_id", userId),
    supabase
      .from("attendance")
      .select("hangout_id")
      .eq("user_id", userId)
      .is("left_at", null),
  ]);

  const myRsvps: BoardData["myRsvps"] = {};
  for (const r of rsvps.data ?? []) myRsvps[r.hangout_id] = r.kind;

  return {
    hangouts: (feed.data ?? []) as HangoutRow[],
    myRsvps,
    myPresence: (presence.data ?? []).map((p) => p.hangout_id),
  };
}

/** "3:40" / "now" / "in 20 min" — short enough to scan standing up. */
export function whenLabel(row: HangoutRow): string {
  const start = new Date(row.starts_at);
  const end = new Date(row.ends_at);
  const now = Date.now();

  if (now > end.getTime()) return "ended";

  const time = end.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (now >= start.getTime()) return `now · until ${time}`;

  const mins = Math.round((start.getTime() - now) / 60_000);
  if (mins < 60) return `in ${mins} min · until ${time}`;
  return `${start.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })} · until ${time}`;
}
