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

      // Stop & dispose any previous audio.
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }

      if (muted) return;

      try {
        const key = await buildCacheKey(text, character.voice, character.voiceSpeed);
        let blob = await getCachedAudio(key);

        if (!blob) {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              voice: character.voice,
              voiceSpeed: character.voiceSpeed,
            }),
          });
          if (res.status === 503) {
            // No API key configured — silently disable narration audio.
            return;
          }
          if (!res.ok) {
            console.warn(`[narration audio] tts ${res.status}`);
            return;
          }
          blob = await res.blob();
          await setCachedAudio(key, blob);
        }

        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const el = new Audio(url);
        audioRef.current = el;

        // Attempt autoplay. iOS Safari may reject; ignore that.
        el.play().catch(() => {
          /* autoplay blocked — user can tap the narration box to retry */
        });
      } catch (err) {
        if (!cancelled) {
          console.warn("[narration audio]", err);
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
