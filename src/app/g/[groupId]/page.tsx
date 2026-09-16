import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchBoard } from "@/lib/board";
import Shell from "./board";

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
    .select("id, name, join_code, requires_approval, airball_enabled")
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
      <main className="mx-auto w-full max-w-[420px] px-4 py-16 text-center">
        <p className="font-script text-4xl leading-none">Airball</p>
        <p className="mt-4 border border-line bg-card px-6 py-10 text-sm text-muted">
          Waiting for an owner to let you into {group.name}.
        </p>
      </main>
    );
  }

  // Everything the left rail needs.
  const { data: memberships } = await supabase
    .from("group_members")
    .select("groups(id, name)")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .order("joined_at", { ascending: true });

  const groups = (memberships ?? [])
    .map((m) => m.groups as unknown as { id: string; name: string })
    .filter(Boolean);

  const { count: memberCount } = await supabase
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("status", "approved");

  const initial = await fetchBoard(supabase, groupId, user.id);

  return (
    <Shell
      groupId={groupId}
      userId={user.id}
      initial={initial}
      groups={groups}
      group={{
        name: group.name,
        joinCode: group.join_code,
        requiresApproval: group.requires_approval,
        airballEnabled: group.airball_enabled,
      }}
      myAlias={me?.display_alias ?? ""}
      myRole={(me?.role ?? "member") as "owner" | "mod" | "member"}
      memberCount={memberCount ?? 0}
    />
  );
}
