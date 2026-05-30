"use client";

import { useEffect, useRef, useState } from "react";

import { buildCacheKey, getCachedAudio, setCachedAudio } from "@/lib/tts-cache";
import type { Character } from "@/types/story";

interface Props {
  text: string;
  character: Character;
  muted: boolean;
  /** Increments when narration changes — triggers re-play on same text rare-case. */
  playKey: string;
}

/**
 * Loads (cache → fetch → cache) and plays the narration audio.
 *
 * - Re-runs whenever text/voice/speed change OR `muted` flips.
 * - iOS Safari blocks autoplay before any user gesture; we attempt anyway
 *   and silently swallow the resulting AbortError. After the first tap,
 *   subsequent narrations autoplay normally.
 */
export function NarrationAudio({ text, character, muted, playKey }: Props) {
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      console.log("[narration] mount", {
        textPreview: text.slice(0, 40),
        voice: character.voice,
        voiceSpeed: character.voiceSpeed,
        muted,
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

      if (muted) {
        console.log("[narration] skip — muted");
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
        // Narration sits at full volume; BGM is attenuated in audio-engine.ts
        // (BGM_VOLUME = 0.18) to keep the voice clearly forward.
        el.volume = 1.0;
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
  }, [text, character.voice, character.voiceSpeed, muted, playKey]);

  // Render nothing — audio plays via Web Audio element only.
  // (We could surface an error indicator if needed, but it's noise for kids.)
  return error ? null : null;
}
