import type { SupabaseClient } from "@supabase/supabase-js";

/** One row of `hangout_feed` — the view that computes airball/rebound. */
export type HangoutRow = {
  id: string;
  group_id: string;
  location_text: string;
  note: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  /** No user id is ever sent to the client. This is how "mine" is known. */
  is_mine: boolean;
  /** "Cuber A" — the letter is scoped to this hangout only. */
  author_alias: string | null;
  here_count: number;
  otw_count: number;
  reply_count: number;
  first_response_at: string | null;
  is_open: boolean;
  /** Set once an hour passes with no reply. Permanent — a late reply
   *  doesn't clear it. */
  tag: "airball" | null;
};

/** One row of `group_roster`: who is in the group, by real name. */
export type RosterRow = {
  group_id: string;
  real_name: string;
  display_alias: string;
  role: "owner" | "mod" | "member";
  status: "pending" | "approved" | "banned";
  joined_at: string;
  is_me: boolean;
  /** Staff only — null for ordinary members. */
  member_id: string | null;
  join_reason: string | null;
};

/**
 * One row of `report_queue`. Deliberately carries no identity: an owner who
 * could see who wrote reported content could report anything themselves to
 * unmask its author.
 */
export type ReportRow = {
  id: string;
  group_id: string;
  target_type: "hangout" | "message" | "user";
  reason: string;
  created_at: string;
  resolved_at: string | null;
  content: string | null;
  still_exists: boolean;
};

export async function fetchReports(
  supabase: SupabaseClient,
  groupId: string,
): Promise<ReportRow[]> {
  const { data } = await supabase
    .from("report_queue")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as ReportRow[];
}

export async function fetchRoster(
  supabase: SupabaseClient,
  groupId: string,
): Promise<RosterRow[]> {
  const { data } = await supabase
    .from("group_roster")
    .select("*")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });
  return (data ?? []) as RosterRow[];
}

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

/** One row of `message_feed`. Carries a letter, never a user id. */
export type MessageRow = {
  id: string;
  hangout_id: string;
  body: string;
  created_at: string;
  is_mine: boolean;
  alias: string | null;
};

export async function fetchMessages(
  supabase: SupabaseClient,
  hangoutId: string,
): Promise<MessageRow[]> {
  const { data } = await supabase
    .from("message_feed")
    .select("*")
    .eq("hangout_id", hangoutId)
    .order("created_at", { ascending: true });
  return (data ?? []) as MessageRow[];
}

/**
 * "now" / "in 20 min" / "3:40" — short enough to scan standing up.
 *
 * No end time is ever shown. Nobody states how long they'll stay; the
 * attendance counter answers who is actually there.
 */
export function whenLabel(row: HangoutRow): string {
  const start = new Date(row.starts_at);
  const now = Date.now();

  if (now > new Date(row.ends_at).getTime()) return "ended";
  if (now >= start.getTime()) return "now";

  const mins = Math.round((start.getTime() - now) / 60_000);
  if (mins < 60) return `in ${mins} min`;
  return start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
