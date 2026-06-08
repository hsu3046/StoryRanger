import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/queries";

export const runtime = "nodejs";

/** Internal-only redirect target (no `//`, no backslash-normalized `/\`, no
 *  absolute URLs). */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/";
  }
  return raw;
}

/**
 * Auth callback for BOTH styles Supabase can use:
 *  - PKCE / OAuth / magic link → `?code=`  → exchangeCodeForSession
 *  - email confirmation / recovery → `?token_hash=&type=` → verifyOtp
 * Handling both means signups confirm regardless of the email-template format.
 * On success it guarantees a profile row exists, then redirects to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  let authError = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = !!error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    authError = !!error;
  } else {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  if (authError) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // Primary profile-creation path (no auth.users trigger on the shared DB).
    await ensureProfile(user).catch((e) =>
      console.warn("[auth/callback] ensureProfile failed:", e),
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
