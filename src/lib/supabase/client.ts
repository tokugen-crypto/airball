import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for browser / client components.
 *
 * The anon key is meant to be public — it identifies the project, it does not
 * grant access. Row-level security in supabase/schema.sql is what actually
 * protects the data. The service_role key is the dangerous one, and it must
 * never appear in this folder or in any NEXT_PUBLIC_ variable.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
