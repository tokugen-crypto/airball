"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string } | null;

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return error.message.toLowerCase().includes("invalid")
      ? { error: "That email and password don't match." }
      : { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/groups");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const realName = String(formData.get("real_name") ?? "").trim();

  if (!realName) return { error: "Your name is required." };
  if (password.length < 8)
    return { error: "Password needs to be at least 8 characters." };

  const supabase = await createClient();
  // real_name rides along in metadata; the handle_new_user trigger copies it
  // into public.profiles. Group owners are the only ones who ever see it.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { real_name: realName } },
  });

  if (error) {
    return error.message.toLowerCase().includes("already")
      ? { error: "That email already has an account. Try signing in." }
      : { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/groups");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
