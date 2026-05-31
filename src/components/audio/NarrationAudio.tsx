"use client";

import { Howl } from "howler";
import { useEffect, useRef, useState } from "react";

import { assetUrl, ASSET_BASE_URL } from "@/lib/asset-paths";
import { ttsObjectKey } from "@/lib/tts-config";
import type { Character } from "@/types/story";

interface Props {
  text: string;
  character: Character;
  /** Narration/voice volume, 0–1. 0 means muted (we skip the fetch + play). */
  volume: number;
  /** Increments when narration changes — triggers re-play on same text rare-case. */
  playKey: string;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Resolves a narration line (R2 cache → ElevenLabs) and plays it.
 *
 * Playback goes through **Howler (Web Audio)**, NOT an HTML5 `<audio>` element:
 * a plain `<audio>` hijacks the audio session and silences the Web-Audio BGM
 * (notably on iOS). Routing the voice through the same Howler context lets it
 * MIX with the music instead of interrupting it. We feed Howler a same-origin
 * blob URL, so decoding never needs R2 CORS.
 *
 * - The load effect re-runs on text/voice/speed change or the mute boundary
 *   (0 volume). In-range volume changes apply live without reloading the line.
 */
export function NarrationAudio({ text, character, volume, playKey }: Props) {
  const [error, setError] = useState<string | null>(null);
  const soundRef = useRef<Howl | null>(null);
  const urlRef = useRef<string | null>(null);
  const enabled = volume > 0;

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

      try {
        const key = await ttsObjectKey(
          text,
          character.voice,
          character.voiceSpeed,
        );
        let blob: Blob | null = null;

        // 1) Cache hit — pull the bytes straight from R2/CDN (egress-free).
        if (ASSET_BASE_URL) {
          try {
            const hit = await fetch(assetUrl(`/${key}`));
            if (hit.ok) blob = await hit.blob();
          } catch {
            /* network/CORS hiccup → fall through to generate */
          }
        }

        // 2) Miss — generate via ElevenLabs; the server also writes it to R2,
        // so the next request (any user) is a cache hit.
        if (!blob) {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              voiceId: character.voice,
              voiceSpeed: character.voiceSpeed,
            }),
          });
          if (res.status === 503) {
            console.warn("[narration] 503 — ELEVENLABS_API_KEY not set on server");
            return;
          }
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            console.warn(`[narration] tts ${res.status}`, errText.slice(0, 200));
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
          onloaderror: (_id, e) =>
            console.warn("[narration] load error", String(e)),
          onplayerror: (_id, e) =>
            console.warn("[narration] play error", String(e)),
        });
        soundRef.current = sound;
        sound.play();
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
      dispose();
    };
    // `volume` intentionally excluded — only the 0-boundary (`enabled`) gates
    // load/play; in-range changes are handled by the live-volume effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, character.voice, character.voiceSpeed, enabled, playKey]);

  return error ? null : null;
}
