"use client";

import { useActionState, useState } from "react";
import { signOut } from "./login/actions";
import {
  deleteAccount,
  updateName,
  updatePassword,
  type AccountState,
} from "./account-actions";

export default function ManageAccount({
  email,
  realName,
}: {
  email: string;
  realName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-4 border border-line bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left"
      >
        <span className="text-sm font-semibold">Manage account</span>
        <span className="text-xs text-muted">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="border-t border-line-soft">
          <Row label="Signed in as">
            <p className="text-sm text-muted">{email}</p>
          </Row>

          <NameForm realName={realName} />
          <PasswordForm />

          <Row label="Session">
            <form action={signOut}>
              <button className="border border-line px-4 py-2 text-xs font-semibold text-text">
                Log out
              </button>
            </form>
          </Row>

          <DangerZone />
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-line-soft px-4 py-3.5 last:border-0">
      <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function Feedback({ state }: { state: AccountState }) {
  if (!state) return null;
  if ("error" in state)
    return <p className="mt-1.5 text-xs text-danger">{state.error}</p>;
  return <p className="mt-1.5 text-xs text-green">{state.ok}</p>;
}

function NameForm({ realName }: { realName: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    updateName,
    null,
  );

  return (
    <Row label="Your name">
      <form action={action} className="flex gap-2">
        <input
          name="real_name"
          defaultValue={realName}
          maxLength={80}
          required
          className="min-w-0 flex-1 border border-line bg-page px-2.5 py-2 text-xs outline-none focus:border-muted"
        />
        <button
          disabled={pending}
          className="shrink-0 border border-line px-3 py-2 text-xs font-semibold text-green disabled:opacity-40"
        >
          Save
        </button>
      </form>
      <p className="mt-1.5 text-[11px] text-muted">
        Only group owners ever see this, and only to decide who to let in.
        Inside a group you&apos;re anonymous.
      </p>
      <Feedback state={state} />
    </Row>
  );
}

function PasswordForm() {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    updatePassword,
    null,
  );

  return (
    <Row label="Password">
      <form action={action} className="flex gap-2">
        <input
          name="password"
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          required
          className="min-w-0 flex-1 border border-line bg-page px-2.5 py-2 text-xs outline-none placeholder:text-muted focus:border-muted"
        />
        <button
          disabled={pending}
          className="shrink-0 border border-line px-3 py-2 text-xs font-semibold text-green disabled:opacity-40"
        >
          Change
        </button>
      </form>
      <Feedback state={state} />
    </Row>
  );
}

function DangerZone() {
  const [armed, setArmed] = useState(false);
  const [state, action, pending] = useActionState<AccountState, FormData>(
    deleteAccount,
    null,
  );

  return (
    <Row label="Delete account">
      {!armed ? (
        <button
          onClick={() => setArmed(true)}
          className="border border-line px-4 py-2 text-xs font-semibold text-danger"
        >
          Delete my account
        </button>
      ) : (
        <form action={action}>
          <p className="mb-2 text-xs text-muted">
            This erases your account, your posts and your replies. It can&apos;t
            be undone. Type <span className="font-semibold text-text">DELETE</span>{" "}
            to confirm.
          </p>
          <div className="flex gap-2">
            <input
              name="confirm"
              placeholder="DELETE"
              autoComplete="off"
              className="min-w-0 flex-1 border border-line bg-page px-2.5 py-2 text-xs outline-none placeholder:text-muted focus:border-danger"
            />
            <button
              disabled={pending}
              className="shrink-0 bg-danger px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              {pending ? "…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="shrink-0 border border-line px-3 py-2 text-xs font-semibold text-muted"
            >
              Cancel
            </button>
          </div>
          <Feedback state={state} />
        </form>
      )}
    </Row>
  );
}
