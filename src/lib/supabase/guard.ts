import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "./client";
import { getSessionUser } from "./queries";

/**
 * Gate a paid backend endpoint (LLM / TTS) behind login. The proxy can't cover
 * these — its matcher excludes `/api` — so a logged-out client could otherwise
 * call them directly and burn quota even though every UI page is login-gated.
 *
 * Returns a 401 NextResponse when Supabase auth is configured but the request
 * has no session; returns null to proceed (authenticated, OR Supabase not yet
 * configured so the app is intentionally still open).
 */
export async function requireSessionOr401(): Promise<NextResponse | null> {
  if (!isSupabaseConfigured()) return null;
  const user = await getSessionUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
