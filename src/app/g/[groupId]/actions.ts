"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PostState = { error: string } | null;

/**
 * Posting has to take under ten seconds, so there is no date picker: you
 * choose a start offset in minutes and a duration in minutes, both as chips.
 */
export async function postHangout(
  _prev: PostState,
  formData: FormData,
): Promise<PostState> {
  const groupId = String(formData.get("group_id") ?? "");
  const location = String(formData.get("location_text") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const startOffset = Number(formData.get("start_offset") ?? 0);
  const duration = Number(formData.get("duration") ?? 120);

  if (!location) return { error: "Say where you are." };

  const startsAt = new Date(Date.now() + startOffset * 60_000);
  const endsAt = new Date(startsAt.getTime() + duration * 60_000);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out." };

  const { error } = await supabase.from("hangouts").insert({
    group_id: groupId,
    author_id: user.id,
    location_text: location,
    note,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  });

  if (error) return { error: error.message };

  revalidatePath(`/g/${groupId}`);
  return null;
}

export async function setRsvp(
  hangoutId: string,
  groupId: string,
  kind: "otw" | "maybe_next_time",
  etaMinutes: number | null,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("rsvps").upsert({
    hangout_id: hangoutId,
    user_id: user.id,
    kind,
    eta_minutes: etaMinutes,
  });

  revalidatePath(`/g/${groupId}`);
}

export async function clearRsvp(hangoutId: string, groupId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("rsvps")
    .delete()
    .eq("hangout_id", hangoutId)
    .eq("user_id", user.id);

  revalidatePath(`/g/${groupId}`);
}

/** "I'm here" — the counter goes up. */
export async function arrive(hangoutId: string, groupId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Re-arriving after leaving clears left_at rather than making a second row.
  await supabase.from("attendance").upsert({
    hangout_id: hangoutId,
    user_id: user.id,
    arrived_at: new Date().toISOString(),
    left_at: null,
  });

  revalidatePath(`/g/${groupId}`);
}

/** "Leaving" — the counter goes down. */
export async function leave(hangoutId: string, groupId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("attendance")
    .update({ left_at: new Date().toISOString() })
    .eq("hangout_id", hangoutId)
    .eq("user_id", user.id);

  revalidatePath(`/g/${groupId}`);
}

/** Authors can always delete their own post — airballed or not. */
export async function deleteHangout(hangoutId: string, groupId: string) {
  const supabase = await createClient();
  await supabase.from("hangouts").delete().eq("id", hangoutId);
  revalidatePath(`/g/${groupId}`);
}
