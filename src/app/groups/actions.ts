"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type GroupState = { error: string } | null;

export async function createGroup(
  _prev: GroupState,
  formData: FormData,
): Promise<GroupState> {
  const name = String(formData.get("name") ?? "").trim();
  const aliasPrefix = String(formData.get("alias_prefix") ?? "").trim();
  const requiresApproval = formData.get("requires_approval") === "on";

  if (!name) return { error: "Give the group a name." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_group", {
    p_name: name,
    p_alias_prefix: aliasPrefix || "Member",
    p_requires_approval: requiresApproval,
  });

  if (error) return { error: error.message };

  revalidatePath("/");
  redirect(`/g/${data}`);
}

export async function joinWithCode(
  _prev: GroupState,
  formData: FormData,
): Promise<GroupState> {
  const code = String(formData.get("code") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!code) return { error: "Enter a join code." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_with_code", {
    p_code: code,
    p_reason: reason,
  });

  if (error) {
    return error.message.includes("No group with that code")
      ? { error: "No group has that code. Check for typos." }
      : { error: error.message };
  }

  revalidatePath("/");
  redirect(`/g/${data}`);
}
