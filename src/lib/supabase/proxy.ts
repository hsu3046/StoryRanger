import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

/** Hard cap on the auth round-trip in the proxy. If Supabase is down, we must
 *  NOT hang the request into Vercel's ~25s proxy timeout (that 504s every
 *  page). On timeout we simply continue unauthenticated. */
const AUTH_TIMEOUT_MS = 2500;

/**
 * Refresh the Supabase session for this request and return the current user.
 *
 * Two non-negotiable hardening steps:
 *  1. `getUser()` is raced against a timeout so a Supabase outage can't stall
 *     every request.
 *  2. When a refreshed JWT sets cookies, the response is marked no-store so a
 *     CDN can never cache one user's `Set-Cookie` and replay it to another
 *     (required since @supabase/ssr ≥ 0.10 applies refresh in the proxy).
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ user: User | null; response: NextResponse }> {
  let response = NextResponse.next({ request });
  let didSetCookies = false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Misconfigured env → don't crash every request; treat as logged-out.
  if (!url || !publishableKey) {
    return { user: null, response };
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        didSetCookies = true;
      },
    },
  });

  let user: User | null = null;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("auth getUser timeout")), AUTH_TIMEOUT_MS),
      ),
    ]);
    user = result.data.user;
  } catch (err) {
    console.warn(
      "[proxy] supabase getUser skipped:",
      err instanceof Error ? err.message : err,
    );
  }

  // A refreshed-session Set-Cookie must never be cached + replayed by a CDN.
  if (didSetCookies) {
    response.headers.set(
      "Cache-Control",
      "private, no-store, no-cache, must-revalidate",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }

  return { user, response };
}
