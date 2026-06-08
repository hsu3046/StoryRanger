import type { User } from "@supabase/supabase-js";

import { createClient } from "./server";
import { TABLES } from "./tables";
import type { Profile } from "./types";

/** The cookie-session user (server-side), or null when logged out. */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The current user's profile under RLS, or null. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from(TABLES.profiles)
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

/**
 * Idempotently ensure a profile row exists for `user`. This is the PRIMARY
 * profile-creation path (there is deliberately no trigger on the shared
 * `auth.users` table). Runs as the user under RLS, so the insert policy
 * (`auth.uid() = id`) allows it; `on conflict do nothing` makes repeats safe.
 * Returns the profile.
 */
export async function ensureProfile(
  user: User,
  displayName?: string | null,
): Promise<Profile | null> {
  const supabase = await createClient();
  await supabase
    .from(TABLES.profiles)
    .insert({
      id: user.id,
      display_name:
        displayName ??
        (user.user_metadata?.display_name as string | undefined) ??
        null,
    })
    .select()
    // 23505 unique_violation on a concurrent insert is fine — the row exists.
    .maybeSingle();

  const { data } = await supabase
    .from(TABLES.profiles)
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}
