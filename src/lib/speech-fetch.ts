"use client";

import { assetUrl, ASSET_BASE_URL } from "@/lib/asset-paths";
import {
  isTtsCoolingDown,
  retryAfterSecondsFrom,
  startTtsCooldown,
} from "@/lib/tts-cooldown";
import { ttsObjectKeys, type SpeechAlignment } from "@/lib/tts-config";

/** One resolved spoken line: playable bytes + (when available) the
 *  character timing that drives the read-along word highlight. */
export interface SpeechLine {
  blob: Blob;
  alignment: SpeechAlignment | null;
}

/**
 * Resolve one spoken line: R2 cache first (egress-free CDN hit, exempt from
 * the TTS cooldown — audio at `…mp3`, timing at `…align.json`), then
 * on-demand synthesis via /api/tts, whose JSON envelope carries both.
 *
 * Shared by narration (SpeechAudio) and the choice read-aloud so every path
 * uses the same cache keys, cooldown handling, and error semantics. Returns
 * `null` on any failure — callers stay silent and gameplay continues (the
 * "no audio is never fatal" contract). A missing/garbled alignment is NOT a
 * failure: the audio still plays, the highlight just falls back to fade-in.
 */
export async function fetchSpeechLine(
  text: string,
  voiceId: string,
  voiceSpeed: number,
  cache = true,
): Promise<SpeechLine | null> {
  // 1) Cache hit — pull audio + timing straight from R2/CDN. Cacheable lines
  //    only; LLM-generated one-shots skip this and always generate.
  if (cache && ASSET_BASE_URL) {
    try {
      const keys = await ttsObjectKeys(text, voiceId, voiceSpeed);
      const [audioRes, alignRes] = await Promise.all([
        fetch(assetUrl(`/${keys.audio}`)),
        fetch(assetUrl(`/${keys.align}`)),
      ]);
      if (audioRes.ok) {
        let alignment: SpeechAlignment | null = null;
        if (alignRes.ok) {
          try {
            alignment = (await alignRes.json()) as SpeechAlignment;
          } catch {
            /* malformed align file → highlight falls back, audio plays */
          }
        }
        return { blob: await audioRes.blob(), alignment };
      }
    } catch {
      /* network/CORS hiccup → fall through to generate */
    }
  }

  // 2) Miss / non-cacheable — generate via ElevenLabs. During a rate-limit
  //    cooldown we skip generation entirely — the line stays silent (text
  //    gameplay continues), while R2 cache hits above keep playing normally.
  if (isTtsCoolingDown()) return null;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId, voiceSpeed, cache }),
    });
    if (res.status === 503) {
      console.warn("[speech] 503 — ELEVENLABS_API_KEY not set on server");
      return null;
    }
    if (res.status === 429) {
      startTtsCooldown(retryAfterSecondsFrom(res));
      console.warn("[speech] 429 — TTS budget hit, cooling down");
      return null;
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[speech] tts ${res.status}`, errText.slice(0, 200));
      return null;
    }
    const json = (await res.json()) as {
      audioBase64?: string;
      alignment?: SpeechAlignment | null;
    };
    if (!json.audioBase64) {
      console.warn("[speech] tts response missing audioBase64");
      return null;
    }
    // base64 → bytes. atob is fine here: the payload is BINARY audio, not
    // UTF-8 text (the classic atob/latin-1 mojibake gotcha doesn't apply).
    const bin = atob(json.audioBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return {
      blob: new Blob([bytes], { type: "audio/mpeg" }),
      alignment: json.alignment ?? null,
    };
  } catch (err) {
    console.warn("[speech] fetch threw:", err);
    return null;
  }
}
