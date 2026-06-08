import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client (cookie-backed session via @supabase/ssr).
 *
 * Singleton: one instance per browser tab avoids LockManager "auth-token"
 * contention. Uses the RLS-scoped PUBLISHABLE key (safe to ship to the client);
 * falls back to the legacy `anon` JWT if a project still issues those.
 */
let _client: SupabaseClient | null = null;

/** True when the public Supabase env is present. Lets sync code skip the DB
 *  (falling back to localStorage) instead of throwing when not yet configured. */
export function isSupabaseConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function createClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "[supabase] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required",
    );
  }

  _client = createBrowserClient(url, publishableKey, {
    auth: { flowType: "pkce" },
  });
  return _client;
}
