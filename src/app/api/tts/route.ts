import { NextResponse, after } from "next/server";
import { z } from "zod";

import { hasElevenLabsKey, synthesizeSpeech } from "@/lib/elevenlabs";
import { ttsObjectKey, SPEED_MIN, SPEED_MAX } from "@/lib/tts-config";
import { hasR2, r2Put } from "@/lib/r2";

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

  try {
    const buffer = await synthesizeSpeech(
      body.text,
      body.voiceId,
      body.voiceSpeed,
    );

    // Populate the R2 cache (best-effort — never fail the request over it).
    // Skipped for non-cacheable (dialogue) lines so the bucket isn't littered
    // with one-shot objects. Scheduled with `after()` so the upload runs once
    // the response is sent BUT the invocation is kept alive until it settles —
    // a bare fire-and-forget Promise can be frozen/killed in serverless, which
    // would leave the cache permanently empty (every miss re-hits ElevenLabs).
    if (body.cache && hasR2()) {
      after(async () => {
        try {
          const key = await ttsObjectKey(
            body.text,
            body.voiceId,
            body.voiceSpeed,
          );
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
        // must not be stored (they'd never be requested again).
        "Cache-Control": body.cache
          ? "public, max-age=31536000, immutable"
          : "no-store",
      },
    });
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
}
