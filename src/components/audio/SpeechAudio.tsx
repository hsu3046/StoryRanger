"use client";

import { Howl } from "howler";
import { useEffect, useRef, useState } from "react";

import { assetUrl, ASSET_BASE_URL } from "@/lib/asset-paths";
import {
  isTtsCoolingDown,
  retryAfterSecondsFrom,
  startTtsCooldown,
} from "@/lib/tts-cooldown";
import { ttsObjectKey } from "@/lib/tts-config";

interface Props {
  text: string;
  /** ElevenLabs voice id (e.g. "21m00Tcm4TlvDq8ikWAM"). */
  voiceId: string;
  /** Playback speed (0.25–4.0). */
  voiceSpeed: number;
  /** Voice volume, 0–1. 0 means muted (we skip the fetch + play). */
  volume: number;
  /** Changes when the line changes — triggers re-play even on identical text. */
  playKey: string;
  /**
   * Whether this line is cacheable in R2. Narration is deterministic → cache
   * (try R2 first; the server persists it). Character dialogue is LLM-generated
   * fresh every turn → `false`: skip the R2 read and tell the server not to
   * write it, so the bucket isn't littered with one-shot objects.
   */
  cache?: boolean;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Resolves a spoken line (R2 cache → ElevenLabs) and plays it. Used for both
 * scene narration (cacheable) and character dialogue (`cache={false}`).
 *
 * Playback goes through **Howler (Web Audio)**, NOT an HTML5 `<audio>` element:
 * a plain `<audio>` hijacks the audio session and silences the Web-Audio BGM
 * (notably on iOS). Routing the voice through the same Howler context lets it
 * MIX with the music instead of interrupting it. We feed Howler a same-origin
 * blob URL, so decoding never needs R2 CORS.
 *
 * - The load effect re-runs on text/voice/speed change, the mute boundary
 *   (0 volume), or `playKey`. In-range volume changes apply live without
 *   reloading the line.
 */
export function SpeechAudio({
  text,
  voiceId,
  voiceSpeed,
  volume,
  playKey,
  cache = true,
}: Props) {
  const [, setError] = useState<string | null>(null);
  const soundRef = useRef<Howl | null>(null);
  const urlRef = useRef<string | null>(null);
  // The playKey we've already loaded+played. A line plays AT MOST ONCE per key;
  // re-runs of the load effect (mute↔unmute crossing the volume-0 boundary, a
  // settings open/close, any parent re-render that flips `enabled`) must never
  // restart a line the player already heard.
  const playedKeyRef = useRef<string | null>(null);
  const enabled = volume > 0 && !!voiceId;

  function dispose() {
    if (soundRef.current) {
      soundRef.current.stop();
      soundRef.current.unload();
      soundRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }

  // Apply in-range volume changes to the playing line without reloading it.
  useEffect(() => {
    soundRef.current?.volume(clamp(volume));
  }, [volume]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      dispose();
      if (!enabled) return;
      // Already played this exact line — do NOT reload/replay. This guard is
      // what makes narration play exactly once per scene: muting then unmuting
      // (or any effect re-run with the same playKey) re-enters here and bails.
      // A genuinely new line carries a new playKey and plays once. The key is
      // recorded only AFTER playback actually starts (below), so a cancelled
      // setup (React StrictMode's setup→cleanup→setup) or a transient fetch
      // failure never burns the key without any audio having played.
      if (playedKeyRef.current === playKey) return;

      try {
        let blob: Blob | null = null;

        // 1) Cache hit — pull the bytes straight from R2/CDN (egress-free).
        //    Cacheable lines only; dialogue skips this and always generates.
        if (cache && ASSET_BASE_URL) {
          try {
            const key = await ttsObjectKey(text, voiceId, voiceSpeed);
            const hit = await fetch(assetUrl(`/${key}`));
            if (hit.ok) blob = await hit.blob();
          } catch {
            /* network/CORS hiccup → fall through to generate */
          }
        }

        // 2) Miss / non-cacheable — generate via ElevenLabs. For cacheable
        //    lines the server also writes it to R2 (next request is a hit);
        //    `cache: false` tells it not to. During a rate-limit cooldown we
        //    skip generation entirely — the line stays silent (text gameplay
        //    continues), while R2 cache hits above keep playing normally.
        if (!blob) {
          if (isTtsCoolingDown()) return;
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voiceId, voiceSpeed, cache }),
          });
          if (res.status === 503) {
            console.warn("[speech] 503 — ELEVENLABS_API_KEY not set on server");
            return;
          }
          if (res.status === 429) {
            startTtsCooldown(retryAfterSecondsFrom(res));
            console.warn("[speech] 429 — TTS budget hit, cooling down");
            return;
          }
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            console.warn(`[speech] tts ${res.status}`, errText.slice(0, 200));
            return;
          }
          blob = await res.blob();
        }

        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const sound = new Howl({
          src: [url],
          format: ["mp3"], // blob URL has no extension → tell Howler the codec
          html5: false, // Web Audio → mixes with the BGM instead of stopping it
          volume: clamp(volume),
          // Record the key only when Howler CONFIRMS playback has actually
          // started — not when we merely request it via play(). If the blob
          // fails to load/decode or autoplay is blocked (onplayerror), onplay
          // never fires, so the key stays unset and a later unmute / re-render
          // of the same scene legitimately retries instead of being silenced
          // forever by the guard above. Skip if the effect was already
          // cancelled (StrictMode / rapid scene change).
          onplay: () => {
            if (!cancelled) playedKeyRef.current = playKey;
          },
          onloaderror: (_id, e) =>
            console.warn("[speech] load error", String(e)),
          onplayerror: (_id, e) =>
            console.warn("[speech] play error", String(e)),
        });
        soundRef.current = sound;
        sound.play();
      } catch (err) {
        if (!cancelled) {
          console.warn("[speech] threw:", err);
          setError("audio_failed");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      dispose();
    };
    // `volume` intentionally excluded — only the 0-boundary (`enabled`) gates
    // load/play; in-range changes are handled by the live-volume effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, voiceId, voiceSpeed, enabled, cache, playKey]);

  return null;
}
