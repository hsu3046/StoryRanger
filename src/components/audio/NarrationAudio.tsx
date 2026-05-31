"use client";

import { useEffect, useRef, useState } from "react";

import { buildCacheKey, getCachedAudio, setCachedAudio } from "@/lib/tts-cache";
import type { Character } from "@/types/story";

interface Props {
  text: string;
  character: Character;
  /** Narration/voice volume, 0–1. 0 means muted (we skip the fetch + play). */
  volume: number;
  /** Increments when narration changes — triggers re-play on same text rare-case. */
  playKey: string;
}

/**
 * Loads (cache → fetch → cache) and plays the narration audio.
 *
 * - Re-runs whenever text/voice/speed change OR voice is muted/unmuted
 *   (the 0-volume boundary). In-range volume changes are applied live in a
 *   separate effect so dragging the slider never restarts the line.
 * - iOS Safari blocks autoplay before any user gesture; we attempt anyway
 *   and silently swallow the resulting AbortError. After the first tap,
 *   subsequent narrations autoplay normally.
 */
export function NarrationAudio({ text, character, volume, playKey }: Props) {
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const enabled = volume > 0;

  // Apply in-range volume changes to the playing line without reloading it.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
    }
  }, [volume]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      console.log("[narration] mount", {
        textPreview: text.slice(0, 40),
        voice: character.voice,
        voiceSpeed: character.voiceSpeed,
        enabled,
        playKey,
      });

      // Stop & dispose any previous audio.
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }

      if (!enabled) {
        console.log("[narration] skip — voice muted");
        return;
      }

      try {
        const key = await buildCacheKey(text, character.voice, character.voiceSpeed);
        let blob = await getCachedAudio(key);
        console.log("[narration] cache lookup", { hit: !!blob, key: key.slice(0, 12) });

        if (!blob) {
          console.log("[narration] fetching /api/tts");
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              voice: character.voice,
              voiceSpeed: character.voiceSpeed,
            }),
          });
          console.log("[narration] fetch response", { status: res.status, ok: res.ok });
          if (res.status === 503) {
            console.warn("[narration] 503 — OPENAI_API_KEY not set on server");
            return;
          }
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            console.warn(`[narration] tts ${res.status}`, errText.slice(0, 200));
            return;
          }
          blob = await res.blob();
          console.log("[narration] blob received", { size: blob.size, type: blob.type });
          await setCachedAudio(key, blob);
        }

        if (cancelled) {
          console.log("[narration] cancelled before play");
          return;
        }

        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const el = new Audio(url);
        // Voice volume from the Settings slider; BGM is attenuated separately
        // in audio-engine.ts to keep the voice clearly forward.
        el.volume = Math.max(0, Math.min(1, volume));
        audioRef.current = el;

        console.log("[narration] play() attempt");
        el.play()
          .then(() => console.log("[narration] play() ✓"))
          .catch((err) => {
            console.warn("[narration] play() rejected:", err?.name, err?.message);
          });
      } catch (err) {
        if (!cancelled) {
          console.warn("[narration] threw:", err);
          setError("audio_failed");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
    // `volume` intentionally excluded — only the 0-boundary (`enabled`) gates
    // load/play; in-range changes are handled by the live-volume effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, character.voice, character.voiceSpeed, enabled, playKey]);

  // Render nothing — audio plays via Web Audio element only.
  // (We could surface an error indicator if needed, but it's noise for kids.)
  return error ? null : null;
}
