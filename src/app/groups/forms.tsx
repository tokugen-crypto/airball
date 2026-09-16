"use client";

import { useActionState, useState } from "react";
import { createGroup, joinWithCode, type GroupState } from "./actions";

export default function GroupForms() {
  const [tab, setTab] = useState<"join" | "create">("join");

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-4 flex gap-1 rounded-xl bg-ink p-1">
        <Tab active={tab === "join"} onClick={() => setTab("join")}>
          Join a group
        </Tab>
        <Tab active={tab === "create"} onClick={() => setTab("create")}>
          Start a group
        </Tab>
      </div>
      {tab === "join" ? <JoinForm /> : <CreateForm />}
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
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-surface text-text" : "text-muted"
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
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-muted">
          Join code
        </span>
        <input
          name="code"
          required
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="7F2K9Q"
          className="w-full rounded-xl border border-line bg-ink px-3.5 py-3 text-center font-mono text-2xl tracking-[0.3em] uppercase outline-none placeholder:text-muted/40 focus:border-green"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-muted">
          Why do you want to join?{" "}
          <span className="font-normal">(optional)</span>
        </span>
        <textarea
          name="reason"
          rows={2}
          className="w-full resize-none rounded-xl border border-line bg-ink px-3.5 py-3 text-sm outline-none focus:border-green"
        />
        <span className="mt-1.5 block text-xs text-muted">
          Only used if the group needs an owner to approve you.
        </span>
      </label>

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
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-muted">
          Group name
        </span>
        <input
          name="name"
          required
          maxLength={60}
          placeholder="Rubik's Cube Club"
          className="w-full rounded-xl border border-line bg-ink px-3.5 py-3 outline-none placeholder:text-muted/40 focus:border-green"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-muted">
          Call members…
        </span>
        <input
          name="alias_prefix"
          maxLength={20}
          placeholder="Cuber"
          className="w-full rounded-xl border border-line bg-ink px-3.5 py-3 outline-none placeholder:text-muted/40 focus:border-green"
        />
        <span className="mt-1.5 block text-xs text-muted">
          Members get anonymous aliases like “Cuber #4”. Real names stay visible
          to you only.
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-xl border border-line px-3.5 py-3">
        <input
          name="requires_approval"
          type="checkbox"
          className="mt-0.5 size-4 accent-[#3DD68C]"
        />
        <span className="text-sm">
          <span className="font-medium">I approve each member</span>
          <span className="mt-0.5 block text-xs text-muted">
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
  return (
    <p className="rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">
      {state.error}
    </p>
  );
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
      className="w-full rounded-xl bg-green px-4 py-3 font-semibold text-ink transition-colors active:bg-green-deep disabled:opacity-50"
    >
      {pending ? "…" : children}
    </button>
  );
}
