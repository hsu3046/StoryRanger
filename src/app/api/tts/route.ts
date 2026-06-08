import { NextResponse, after } from "next/server";
import { z } from "zod";

import { hasElevenLabsKey, isVoiceError, synthesizeSpeech } from "@/lib/elevenlabs";
import { DEFAULT_TTS_VOICE, ttsObjectKey, SPEED_MIN, SPEED_MAX } from "@/lib/tts-config";
import { hasR2, r2Put } from "@/lib/r2";
import { requireSessionOr401 } from "@/lib/supabase/guard";

export const runtime = "nodejs";

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
  const gate = await requireSessionOr401();
  if (gate) return gate;

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!hasElevenLabsKey()) {
    console.warn("[tts] ELEVENLABS_API_KEY not set — returning 503");
    return NextResponse.json({ error: "no_api_key" }, { status: 503 });
  }

  // synthesizeSpeech already retries transient failures (429/5xx/network).
  // Here we add the LAST link of the chain: if the requested voice itself is
  // bad (invalid/unavailable id → 4xx), fall back to a known-good default voice
  // so the line still speaks instead of going silent.
  let buffer: Buffer;
  let usedFallbackVoice = false;
  try {
    buffer = await synthesizeSpeech(body.text, body.voiceId, body.voiceSpeed);
  } catch (err) {
    if (isVoiceError(err) && body.voiceId !== DEFAULT_TTS_VOICE) {
      console.warn(
        `[tts] voice "${body.voiceId}" failed (${err instanceof Error ? err.message : err}); falling back to default voice`,
      );
      try {
        buffer = await synthesizeSpeech(
          body.text,
          DEFAULT_TTS_VOICE,
          body.voiceSpeed,
        );
        usedFallbackVoice = true;
      } catch (err2) {
        console.error("[tts] fallback voice also failed", err2);
        return NextResponse.json(
          {
            error: "tts_failed",
            detail: err2 instanceof Error ? err2.message : String(err2),
          },
          { status: 502 },
        );
      }
    } else {
      console.error("[tts] ElevenLabs error", err);
      return NextResponse.json(
        {
          error: "tts_failed",
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 502 },
      );
    }
  }

  // Cacheable ONLY when the requested voice was used — a fallback-voice clip
  // must not be stored under the requested voice's key (it'd serve the wrong
  // voice forever). Best-effort, scheduled with after() so it can't be killed.
  const cacheable = body.cache && !usedFallbackVoice;
  if (cacheable && hasR2()) {
    after(async () => {
      try {
        const key = await ttsObjectKey(body.text, body.voiceId, body.voiceSpeed);
        await r2Put(key, buffer, "audio/mpeg");
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
      "Cache-Control": cacheable
        ? "public, max-age=31536000, immutable"
        : "no-store",
    },
  });
}
