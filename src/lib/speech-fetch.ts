"use client";

import { assetUrl, ASSET_BASE_URL } from "@/lib/asset-paths";
import {
  isTtsCoolingDown,
  retryAfterSecondsFrom,
  startTtsCooldown,
} from "@/lib/tts-cooldown";
import { ttsObjectKey } from "@/lib/tts-config";

/**
 * Resolve one spoken line to audio bytes: R2 cache first (egress-free CDN
 * hit, exempt from the TTS cooldown), then on-demand synthesis via /api/tts.
 *
 * Extracted from SpeechAudio so the choice read-aloud path shares the exact
 * same cache keys, cooldown handling, and error semantics as narration.
 * Returns `null` on any failure — callers stay silent and gameplay continues
 * (the same "no audio is never fatal" contract SpeechAudio always had).
 */
export async function fetchSpeechBlob(
  text: string,
  voiceId: string,
  voiceSpeed: number,
  cache = true,
): Promise<Blob | null> {
  // 1) Cache hit — pull the bytes straight from R2/CDN. Cacheable lines
  //    only; LLM-generated one-shots skip this and always generate.
  if (cache && ASSET_BASE_URL) {
    try {
      const key = await ttsObjectKey(text, voiceId, voiceSpeed);
      const hit = await fetch(assetUrl(`/${key}`));
      if (hit.ok) return await hit.blob();
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
    return await res.blob();
  } catch (err) {
    console.warn("[speech] fetch threw:", err);
    return null;
  }
}
