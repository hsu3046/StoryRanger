import { NextResponse } from "next/server";

import { createAdminClient } from "./admin";
import { isSupabaseConfigured } from "./client";
import { getSessionUser } from "./queries";

/**
 * Gate a paid backend endpoint (LLM / TTS) behind login. The proxy can't cover
 * these — its matcher excludes `/api` — so a logged-out client could otherwise
 * call them directly and burn quota even though every UI page is login-gated.
 *
 * FAIL-CLOSED in production: these are the only paid routes that run in prod,
 * so a missing/typo'd Supabase env must shut them (503) rather than silently
 * open them to anonymous traffic. Dev convenience keeps them open locally
 * while Supabase isn't configured yet.
 *
 * Returns `{ gate }` to short-circuit with (401/503), or `{ userId }` to
 * proceed. `userId` is null only on the dev-unconfigured path — rate limiting
 * is skipped there (no identity to key on).
 */
export async function requirePaidSession(): Promise<
  | { gate: NextResponse; userId: null }
  | { gate: null; userId: string | null }
> {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return {
        gate: NextResponse.json(
          { error: "service_unavailable" },
          { status: 503 },
        ),
        userId: null,
      };
    }
    return { gate: null, userId: null };
  }
  const user = await getSessionUser().catch(() => null);
  if (!user) {
    return {
      gate: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
      userId: null,
    };
  }
  return { gate: null, userId: user.id };
}

export type RateLimitResult =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number };

/**
 * Consume `weight` units from the per-user fixed-window budget for `route`
 * (minute + day, one atomic RPC — see docs/migrations/0004). Cost protection,
 * not a security boundary on its own: if the RPC itself fails (transient DB
 * issue, missing secret key) we log and FAIL-OPEN — the session gate above has
 * already authenticated the caller, so availability wins for kids mid-game.
 */
export async function consumeRateLimit(opts: {
  userId: string | null;
  route: string;
  weight: number;
  minuteMax: number;
  dayMax: number;
}): Promise<RateLimitResult> {
  // Dev-unconfigured path — no identity, no limiter.
  if (!opts.userId) return { limited: false };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rate_limit_consume", {
      p_user_id: opts.userId,
      p_route: opts.route,
      p_weight: Math.max(1, Math.round(opts.weight)),
      p_minute_max: opts.minuteMax,
      p_day_max: opts.dayMax,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || 60),
      };
    }
    return { limited: false };
  } catch (err) {
    console.warn(
      `[rate-limit] ${opts.route} check failed — allowing request:`,
      err instanceof Error ? err.message : String(err),
    );
    return { limited: false };
  }
}

/** Standard 429 for a paid route, with Retry-After + optional extra payload. */
export function rateLimited429(
  retryAfterSeconds: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { error: "rate_limited", retryAfter: retryAfterSeconds, ...extra },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
