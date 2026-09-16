"use client";

import { useActionState, useState } from "react";
import { createGroup, joinWithCode, type GroupState } from "./actions";

export default function GroupForms() {
  const [tab, setTab] = useState<"join" | "create">("join");

  return (
    <section className="border border-line bg-card">
      <div className="flex border-b border-line">
        <Tab active={tab === "join"} onClick={() => setTab("join")}>
          Join a group
        </Tab>
        <Tab active={tab === "create"} onClick={() => setTab("create")}>
          Start a group
        </Tab>
      </div>
      <div className="p-4">
        {tab === "join" ? <JoinForm /> : <CreateForm />}
      </div>
    </section>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 text-xs font-semibold tracking-wide uppercase transition-colors ${
        active
          ? "border-b border-text text-text"
          : "border-b border-transparent text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function JoinForm() {
  const [state, formAction, pending] = useActionState<GroupState, FormData>(
    joinWithCode,
    null,
  );

  return (
    <form action={formAction} className="space-y-2.5">
      <input
        name="code"
        required
        maxLength={6}
        autoCapitalize="characters"
        autoComplete="off"
        placeholder="CODE"
        className="w-full border border-line bg-page px-2.5 py-3 text-center font-mono text-2xl tracking-[0.35em] uppercase outline-none placeholder:tracking-[0.2em] placeholder:text-muted focus:border-muted"
      />
      <p className="text-center text-[11px] text-muted">
        Six characters, handed out at a meeting.
      </p>

      <textarea
        name="reason"
        rows={2}
        placeholder="Why do you want to join? (optional)"
        className="w-full resize-none border border-line bg-page px-2.5 py-2.5 text-xs outline-none placeholder:text-muted focus:border-muted"
      />
      <p className="text-[11px] text-muted">
        Only used if the group needs an owner to approve you.
      </p>

      <Error state={state} />
      <Submit pending={pending}>Join</Submit>
    </form>
  );
}

function CreateForm() {
  const [state, formAction, pending] = useActionState<GroupState, FormData>(
    createGroup,
    null,
  );

  return (
    <form action={formAction} className="space-y-2.5">
      <input
        name="name"
        required
        maxLength={60}
        placeholder="Group name"
        className="w-full border border-line bg-page px-2.5 py-2.5 text-xs outline-none placeholder:text-muted focus:border-muted"
      />

      <input
        name="alias_prefix"
        maxLength={20}
        placeholder="Call members… (e.g. Cuber)"
        className="w-full border border-line bg-page px-2.5 py-2.5 text-xs outline-none placeholder:text-muted focus:border-muted"
      />
      <p className="text-[11px] leading-snug text-muted">
        Everyone posts as “Cuber”, with a letter that changes on every post —
        conversations stay readable, nobody can be followed around. Real names
        are visible to you alone, for approvals.
      </p>

      <label className="flex items-start gap-2.5 border border-line px-2.5 py-2.5">
        <input
          name="requires_approval"
          type="checkbox"
          className="mt-0.5 size-4 accent-[#21a179]"
        />
        <span className="text-xs">
          <span className="font-semibold">I approve each member</span>
          <span className="mt-0.5 block text-[11px] text-muted">
            Off: the code lets people in instantly — best for handing out at a
            meeting.
          </span>
        </span>
      </label>

      <Error state={state} />
      <Submit pending={pending}>Create group</Submit>
    </form>
  );
}

function Error({ state }: { state: GroupState }) {
  if (!state?.error) return null;
  return <p className="text-center text-sm text-danger">{state.error}</p>;
}

function Submit({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-green py-2.5 text-sm font-semibold text-white active:bg-green-deep disabled:opacity-40"
    >
      {pending ? "…" : children}
    </button>
  );
}
