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
    <main className="mx-auto flex min-h-dvh w-full max-w-[350px] flex-col justify-center px-4 py-10">
      <div className="border border-line bg-card px-8 py-10">
        <h1 className="mb-8 text-center font-script text-5xl leading-none text-text">
          Airball
        </h1>

        <form key={mode} action={formAction} className="space-y-1.5">
          {mode === "up" && (
            <Field
              name="real_name"
              placeholder="Full name"
              autoComplete="name"
            />
          )}
          <Field
            name="email"
            type="email"
            placeholder="Email"
            autoComplete="email"
          />
          <Field
            name="password"
            type="password"
            placeholder="Password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
          />

          {mode === "up" && (
            <p className="px-1 pt-1 pb-1 text-center text-[11px] leading-snug text-muted">
              Your name is only ever shown to the owner of a group you join, so
              they can let you in. Everyone else sees an anonymous alias.
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="!mt-3 w-full bg-green py-2 text-sm font-semibold text-white transition-opacity active:bg-green-deep disabled:opacity-40"
          >
            {pending ? "…" : mode === "in" ? "Log in" : "Sign up"}
          </button>
        </form>

        {state?.error && (
          <p className="mt-4 text-center text-sm text-danger">{state.error}</p>
        )}
      </div>

      <div className="mt-2.5 border border-line bg-card px-8 py-5 text-center text-sm">
        {mode === "in" ? (
          <>
            Don&apos;t have an account?{" "}
            <button
              onClick={() => setMode("up")}
              className="font-semibold text-green"
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Have an account?{" "}
            <button
              onClick={() => setMode("in")}
              className="font-semibold text-green"
            >
              Log in
            </button>
          </>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        Post where you are. See who shows up.
      </p>
    </main>
  );
}

function Field({
  name,
  placeholder,
  type = "text",
  autoComplete,
}: {
  name: string;
  placeholder: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <input
      name={name}
      type={type}
      placeholder={placeholder}
      autoComplete={autoComplete}
      required
      className="w-full border border-line bg-page px-2.5 py-2.5 text-xs outline-none placeholder:text-muted focus:border-muted"
    />
  );
}
