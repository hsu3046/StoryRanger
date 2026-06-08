import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Service-role Supabase client — BYPASSES RLS. SERVER-ONLY.
 *
 * Use ONLY for operations that must escape per-user RLS: listing all users and
 * mutating `profiles.role` (the cookie client would be blocked by the
 * prevent_role_change trigger + 0-row under RLS). Never import this into client
 * code; `SUPABASE_SECRET_KEY` must never be `NEXT_PUBLIC_*`.
 *
 * Singleton — supabase-js is stateless HTTP, so reuse is safe and avoids
 * piling up Postgres connections.
 */
let _admin: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "[supabase] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required for admin operations",
    );
  }

  _admin = createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}
