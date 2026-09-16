import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchBoard } from "@/lib/board";
import Board from "./board";

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
    .select("id, name, join_code, requires_approval")
    .eq("id", groupId)
    .single();
  if (!group) notFound();

  const { data: me } = await supabase
    .from("group_members")
    .select("display_alias, role, status")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (me?.status === "pending") {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-8">
        <Link href="/groups" className="text-sm text-muted underline underline-offset-4">
          ← All groups
        </Link>
        <p className="mt-8 rounded-2xl border border-dashed border-line px-4 py-10 text-center text-muted">
          Waiting for an owner to let you into {group.name}.
        </p>
      </main>
    );
  }

  const { count: memberCount } = await supabase
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("status", "approved");

  const initial = await fetchBoard(supabase, groupId, user.id);

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-6 pb-24">
      <div className="flex items-center justify-between gap-3">
        <Link href="/groups" className="text-sm text-muted underline underline-offset-4">
          ← All groups
        </Link>
        <span className="font-mono text-sm text-muted">{group.join_code}</span>
      </div>

      <header className="mt-3 mb-5">
        <h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {memberCount ?? 0} member{memberCount === 1 ? "" : "s"} · you are{" "}
          <span className="text-text">{me?.display_alias}</span>
        </p>
      </header>

      <Board groupId={groupId} userId={user.id} initial={initial} />
    </main>
  );
}
