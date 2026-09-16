"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AccountState = { error: string } | { ok: string } | null;

export async function updateName(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const name = String(formData.get("real_name") ?? "").trim();
  if (!name) return { error: "Name can't be empty." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out." };

  const { error } = await supabase
    .from("profiles")
    .update({ real_name: name })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/");
  return { ok: "Name updated." };
}

export async function updatePassword(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8)
    return { error: "Password needs to be at least 8 characters." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };
  return { ok: "Password changed." };
}

export async function deleteAccount(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  // Typing the word is the whole confirmation step — this is irreversible.
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE")
    return { error: 'Type DELETE to confirm.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_own_account");

  if (error) return { error: error.message };

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
