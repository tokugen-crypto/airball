import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function GroupBoard({
  params,
}: PageProps<"/g/[groupId]">) {
  const { groupId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS means a non-member simply gets nothing back here.
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, join_code, alias_prefix, requires_approval, owner_id")
    .eq("id", groupId)
    .single();
  if (!group) notFound();

  const { data: me } = await supabase
    .from("group_members")
    .select("display_alias, role, status")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  const isStaff = me?.role === "owner" || me?.role === "mod";

  const { count: memberCount } = await supabase
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("status", "approved");

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-6 pb-24">
      <Link
        href="/groups"
        className="text-sm text-muted underline underline-offset-4"
      >
        ← All groups
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {memberCount ?? 0} member{memberCount === 1 ? "" : "s"} · you are{" "}
          <span className="text-text">{me?.display_alias}</span>
        </p>
      </header>

      {/* The code exists to be read off a screen at a club meeting. */}
      <section className="mb-6 rounded-2xl border border-line bg-surface p-5 text-center">
        <p className="text-sm text-muted">Join code</p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-[0.25em] text-gold">
          {group.join_code}
        </p>
        <p className="mt-2 text-xs text-muted">
          {group.requires_approval
            ? "New members need your approval."
            : "Anyone with this code can join instantly."}
        </p>
      </section>

      <section className="rounded-2xl border border-dashed border-line px-4 py-10 text-center">
        <p className="text-muted">No hangouts yet.</p>
        <p className="mt-1 text-sm text-muted">
          Posting lands in the next step (M3).
        </p>
      </section>

      {isStaff && (
        <p className="mt-6 text-center text-xs text-muted">
          You run this group. Approvals and member management land in M7.
        </p>
      )}
    </main>
  );
}
