import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/topbar";
import { signOut } from "../login/actions";
import GroupForms from "./forms";

export default async function GroupsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("status, display_alias, role, groups(id, name, join_code)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });

  const rows = memberships ?? [];
  const approved = rows.filter((m) => m.status === "approved");
  const pending = rows.filter((m) => m.status === "pending");

  return (
    <>
      <TopBar
        right={
          <form action={signOut}>
            <button className="text-sm font-semibold text-green">
              Log out
            </button>
          </form>
        }
      />

      <main className="mx-auto w-full max-w-[614px] px-4 py-5">
        {approved.length > 0 && (
          <section className="mb-4 border border-line bg-card">
            <h2 className="border-b border-line-soft px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase">
              Your groups
            </h2>
            <ul>
              {approved.map((m) => {
                const g = m.groups as unknown as {
                  id: string;
                  name: string;
                  join_code: string;
                };
                return (
                  <li key={g.id} className="border-b border-line-soft last:border-0">
                    <Link
                      href={`/g/${g.id}`}
                      className="flex items-center gap-3 px-4 py-3 active:bg-page"
                    >
                      <span className="ring-letter grid size-11 shrink-0 place-items-center rounded-full">
                        <span className="grid size-[38px] place-items-center rounded-full bg-card text-sm font-semibold text-text">
                          {g.name.slice(0, 2).toUpperCase()}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {g.name}
                        </span>
                        <span className="block truncate text-sm text-muted">
                          you post as {m.display_alias}
                          {m.role !== "member" && ` · ${m.role}`}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs tracking-wider text-muted">
                        {g.join_code}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {pending.length > 0 && (
          <section className="mb-4 border border-line bg-card">
            <h2 className="border-b border-line-soft px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase">
              Waiting for approval
            </h2>
            <ul>
              {pending.map((m) => {
                const g = m.groups as unknown as { id: string; name: string };
                return (
                  <li
                    key={g.id}
                    className="border-b border-line-soft px-4 py-3 text-sm text-muted last:border-0"
                  >
                    {g.name} · pending
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {approved.length === 0 && pending.length === 0 && (
          <div className="mb-4 border border-line bg-card px-6 py-10 text-center">
            <p className="font-script text-4xl leading-none">Airball</p>
            <p className="mt-3 text-sm text-muted">
              You&apos;re not in any groups yet. Join one with a code, or start
              your own.
            </p>
          </div>
        )}

        <GroupForms />
      </main>
    </>
  );
}
