"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const action = mode === "in" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    null,
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">
          Air<span className="text-gold">ball</span>
        </h1>
        <p className="mt-2 text-muted">Post where you are. See who shows up.</p>
      </div>

      {/* Keyed so React rebuilds the form (and clears errors) on mode switch. */}
      <form key={mode} action={formAction} className="space-y-3">
        {mode === "up" && (
          <Field
            name="real_name"
            label="Your name"
            hint="Only group owners see this. Everyone else sees your alias."
            autoComplete="name"
          />
        )}
        <Field name="email" label="Email" type="email" autoComplete="email" />
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
        />

        {state?.error && (
          <p className="rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-green px-4 py-3 font-semibold text-ink transition-colors active:bg-green-deep disabled:opacity-50"
        >
          {pending ? "…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === "in" ? "up" : "in")}
        className="mt-6 text-sm text-muted underline underline-offset-4"
      >
        {mode === "in"
          ? "No account yet? Create one"
          : "Already have an account? Sign in"}
      </button>
    </main>
  );
}

function Field({
  name,
  label,
  hint,
  type = "text",
  autoComplete,
}: {
  name: string;
  label: string;
  hint?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">
        {label}
      </span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-text outline-none placeholder:text-muted/60 focus:border-green"
      />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
