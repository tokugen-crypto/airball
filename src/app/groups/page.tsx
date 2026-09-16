import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    <main className="mx-auto w-full max-w-lg px-5 py-8 pb-24">
      <header className="mb-8 flex items-baseline justify-between">
        <h1 className="text-3xl font-bold tracking-tight">
          Air<span className="text-gold">ball</span>
        </h1>
        <form action={signOut}>
          <button className="text-sm text-muted underline underline-offset-4">
            Sign out
          </button>
        </form>
      </header>

      {approved.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
            Your groups
          </h2>
          <ul className="space-y-2">
            {approved.map((m) => {
              const g = m.groups as unknown as {
                id: string;
                name: string;
                join_code: string;
              };
              return (
                <li key={g.id}>
                  <Link
                    href={`/g/${g.id}`}
                    className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-4 active:bg-raised"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{g.name}</p>
                      <p className="text-sm text-muted">
                        {m.display_alias}
                        {m.role !== "member" && ` · ${m.role}`}
                      </p>
                    </div>
                    <span className="ml-3 shrink-0 font-mono text-sm text-muted">
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
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
            Waiting for approval
          </h2>
          <ul className="space-y-2">
            {pending.map((m) => {
              const g = m.groups as unknown as { id: string; name: string };
              return (
                <li
                  key={g.id}
                  className="rounded-2xl border border-dashed border-line px-4 py-4 text-muted"
                >
                  {g.name} · pending
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {approved.length === 0 && pending.length === 0 && (
        <p className="mb-8 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-muted">
          You&apos;re not in any groups yet. Join one with a code, or start your
          own.
        </p>
      )}

      <GroupForms />
    </main>
  );
}
