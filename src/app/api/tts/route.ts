import { NextResponse, after } from "next/server";
import { z } from "zod";

import { hasElevenLabsKey, isVoiceError, synthesizeSpeech } from "@/lib/elevenlabs";
import { DEFAULT_TTS_VOICE, ttsObjectKey, SPEED_MIN, SPEED_MAX } from "@/lib/tts-config";
import { hasR2, r2Get, r2Put } from "@/lib/r2";
import {
  consumeRateLimit,
  rateLimited429,
  requirePaidSession,
} from "@/lib/supabase/guard";

export const runtime = "nodejs";

/**
 * Per-user TTS budget, in CHARACTERS (≈ ElevenLabs credits, multilingual v2 is
 * 1 credit/char). Day cap 30k ≈ $6.6–9 worst-case per rogue account — 30% of
 * the Creator plan's monthly credits. The 125-char floor per request bounds
 * tiny-text hammering to 40 req/min without a second counter.
 */
const TTS_CHARS_PER_MINUTE = 5_000;
const TTS_CHARS_PER_DAY = 30_000;
const TTS_MIN_WEIGHT = 125;

/** The R2 key is a content hash — a URL's bytes can never change, so repeat
 *  plays are safe to cache forever (same pattern as fingerprinted assets). */
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

/**
 * Coalesce concurrent identical syntheses (per instance): a prefetch racing
 * the user's playback of the same line — or a re-fired prefetch effect —
 * otherwise pays ElevenLabs twice for one clip. Keyed by the same content
 * hash as the R2 object; entries remove themselves when settled.
 */
const inFlight = new Map<
  string,
  Promise<{ buffer: Buffer; usedFallbackVoice: boolean }>
>();

/** Synthesize, falling back to the default voice when the requested voice
 *  itself is bad (invalid/unavailable id) — the last link of the retry chain
 *  (synthesizeSpeech already retries transient 429/5xx/network failures). */
async function synthesizeWithVoiceFallback(
  text: string,
  voiceId: string,
  voiceSpeed: number,
): Promise<{ buffer: Buffer; usedFallbackVoice: boolean }> {
  try {
    return {
      buffer: await synthesizeSpeech(text, voiceId, voiceSpeed),
      usedFallbackVoice: false,
    };
  } catch (err) {
    if (isVoiceError(err) && voiceId !== DEFAULT_TTS_VOICE) {
      console.warn(
        `[tts] voice "${voiceId}" failed (${err instanceof Error ? err.message : err}); falling back to default voice`,
      );
      return {
        buffer: await synthesizeSpeech(text, DEFAULT_TTS_VOICE, voiceSpeed),
        usedFallbackVoice: true,
      };
    }
    throw err;
  }
}

const RequestSchema = z.object({
  text: z.string().min(1).max(2000),
  voiceId: z.string().min(1),
  // ElevenLabs speed range; out-of-range or missing falls back to normal (1.0)
  // rather than 400-ing the whole request (synthesizeSpeech also clamps).
  voiceSpeed: z.number().min(SPEED_MIN).max(SPEED_MAX).catch(1.0),
  /** Cache the result in R2? Narration is deterministic → cache (default).
   *  Character dialogue is LLM-generated fresh each turn → `false`, so we
   *  don't pollute the bucket with one-shot objects that never hit again. */
  cache: z.boolean().default(true),
});

/**
 * On-demand TTS. The client tries R2 first (cache hit = served straight from
 * the CDN); only a MISS reaches here. We synthesize via ElevenLabs, persist to
 * R2 at the deterministic key (so the next request — for ANY user — is a cache
 * hit), and return the audio so this caller plays immediately.
 *
 * The R2 key is derived server-side from the same inputs the client hashes, so
 * it can't be spoofed into writing arbitrary objects.
 */
export async function POST(req: Request) {
  // Paid TTS — gate behind login (the proxy can't, it excludes /api).
  const { gate, userId } = await requirePaidSession();
  if (gate) return gate;

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Read-through BEFORE the rate limit: the client checks R2 first, but our
  // cache write lands via after() AFTER the response — so a prefetch that is
  // still synthesizing (or just finished) leaves a window where the client
  // misses and asks us to synthesize the same line again. Serving the cached
  // bytes costs no ElevenLabs credits, so it doesn't consume the budget.
  const cacheKey =
    body.cache && hasR2()
      ? await ttsObjectKey(body.text, body.voiceId, body.voiceSpeed)
      : null;
  if (cacheKey) {
    const cached = await r2Get(cacheKey);
    if (cached) {
      return new NextResponse(new Uint8Array(cached), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": IMMUTABLE_CACHE,
        },
      });
    }
  }

  // One paid synthesis per identical line — concurrent requests share the
  // same promise (dialogue lines too: cache=false only skips R2, identical
  // text+voice in flight twice would still double-bill).
  //
  // Quota choreography (the flight Map is GLOBAL across users):
  //   · joining an EXISTING flight consumes no budget — it costs no
  //     ElevenLabs credits, and charging it could 429 identical narration
  //     during the prefetch/playback race;
  //   · gate failures (429/503) stay in the requester's own scope — the
  //     flight wraps ONLY actual synthesis, so user B can never inherit
  //     user A's rate-limit rejection;
  //   · the would-be creator consumes ITS quota first, then re-checks the
  //     Map: if another request created the flight during the quota RPC,
  //     join it — the rare race over-consumes one weight (conservative) but
  //     never synthesizes twice.
  const flightKey =
    cacheKey ?? (await ttsObjectKey(body.text, body.voiceId, body.voiceSpeed));
  let flight = inFlight.get(flightKey);
  if (!flight) {
    // Character-weighted budget — maps 1:1 to ElevenLabs credits. The
    // client treats 429 as "stay silent + cool down"; gameplay continues.
    const limit = await consumeRateLimit({
      userId,
      route: "tts",
      weight: Math.max(body.text.length, TTS_MIN_WEIGHT),
      minuteMax: TTS_CHARS_PER_MINUTE,
      dayMax: TTS_CHARS_PER_DAY,
    });
    if (limit.limited) return rateLimited429(limit.retryAfterSeconds);

    if (!hasElevenLabsKey()) {
      console.warn("[tts] ELEVENLABS_API_KEY not set — returning 503");
      return NextResponse.json({ error: "no_api_key" }, { status: 503 });
    }

    flight = inFlight.get(flightKey);
    if (!flight) {
      flight = synthesizeWithVoiceFallback(
        body.text,
        body.voiceId,
        body.voiceSpeed,
      ).finally(() => inFlight.delete(flightKey));
      inFlight.set(flightKey, flight);
    }
  }

  let buffer: Buffer;
  let usedFallbackVoice = false;
  try {
    ({ buffer, usedFallbackVoice } = await flight);
  } catch (err) {
    console.error("[tts] ElevenLabs error", err);
    return NextResponse.json(
      {
        error: "tts_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  // Cacheable ONLY when the requested voice was used — a fallback-voice clip
  // must not be stored under the requested voice's key (it'd serve the wrong
  // voice forever). Best-effort, scheduled with after() so it can't be killed.
  // The stored Cache-Control makes repeat R2 plays instant (no revalidation).
  const cacheable = body.cache && !usedFallbackVoice;
  if (cacheable && cacheKey) {
    after(async () => {
      try {
        await r2Put(cacheKey, buffer, "audio/mpeg", IMMUTABLE_CACHE);
      } catch (e) {
        console.warn("[tts] R2 cache write failed:", String(e));
      }
    });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      // Deterministic narration is immutable-cacheable; unique dialogue lines
      // (and fallback-voice clips) must not be stored.
      "Cache-Control": cacheable ? IMMUTABLE_CACHE : "no-store",
    },
  });
}
