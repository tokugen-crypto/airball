import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchBoard } from "@/lib/board";
import TopBar from "@/components/topbar";
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
      <>
        <TopBar left={<BackLink />} title={<Title>{group.name}</Title>} />
        <main className="mx-auto w-full max-w-[614px] px-4 py-5">
          <p className="border border-line bg-card px-6 py-12 text-center text-sm text-muted">
            Waiting for an owner to let you into {group.name}.
          </p>
        </main>
      </>
    );
  }

  const { count: memberCount } = await supabase
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("status", "approved");

  const initial = await fetchBoard(supabase, groupId, user.id);

  return (
    <>
      <TopBar left={<BackLink />} title={<Title>{group.name}</Title>} />

      <main className="mx-auto w-full max-w-[614px] px-4 py-5">
        {/* Profile header, Instagram-style: avatar left, numbers right. */}
        <section className="mb-4 border border-line bg-card p-4">
          <div className="flex items-center gap-5">
            <span className="ring-letter grid size-[72px] shrink-0 place-items-center rounded-full">
              <span className="grid size-[64px] place-items-center rounded-full bg-card text-lg font-semibold">
                {group.name.slice(0, 2).toUpperCase()}
              </span>
            </span>

            <div className="flex min-w-0 flex-1 justify-around text-center">
              <Stat n={memberCount ?? 0} label={memberCount === 1 ? "member" : "members"} />
              <div>
                <p className="font-mono text-base font-semibold tracking-wider text-gold">
                  {group.join_code}
                </p>
                <p className="text-xs text-muted">join code</p>
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm">
            <span className="font-semibold">{group.name}</span>
            <span className="mt-0.5 block text-muted">
              You post as {me?.display_alias}. {" "}
              {group.requires_approval
                ? "New members need approval."
                : "Anyone with the code joins instantly."}
            </span>
          </p>
        </section>

        <Board groupId={groupId} userId={user.id} initial={initial} />
      </main>
    </>
  );
}

function BackLink() {
  return (
    <Link href="/groups" className="text-2xl leading-none text-text">
      ‹
    </Link>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <span className="block truncate text-base font-semibold">{children}</span>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <p className="text-base font-semibold">{n}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
