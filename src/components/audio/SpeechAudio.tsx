"use client";

import { Howl } from "howler";
import { useEffect, useRef, useState } from "react";

import { fetchSpeechLine } from "@/lib/speech-fetch";
import type { SpeechAlignment } from "@/lib/tts-config";

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
  /**
   * The line is DONE — finished playing, or will never play (fetch failed,
   * decode error). Fired at most once per playKey. Lets the choice read-aloud
   * wait for the narration VOICE to finish, not just the typewriter (the two
   * aren't synced — long narration audio outlives the typed text).
   */
  onSettled?: () => void;
  /**
   * Bump to replay the CURRENT line from the start (tap-the-narration
   * "hear it again"). Replays the already-loaded Howl — no refetch, no new
   * TTS cost — and is ignored while the line is still playing, so a child
   * hammering the text can't stack or restart mid-word. Distinct from
   * `playKey`, which identifies the line itself and would re-run the whole
   * load pipeline.
   */
  replayNonce?: number;
  /**
   * The line's playable sound + its character timing are ready (fired right
   * before play()), or got disposed (`null, null` — text changed, unmount).
   * The read-along highlight polls the Howl's clock against the alignment.
   */
  onPlayback?: (sound: Howl | null, alignment: SpeechAlignment | null) => void;
  /**
   * Bump to STOP the current line ("one voice at a time" — a choice tap /
   * dialogue opening / mic start silences this narrator). Crucially this
   * also suppresses a line that is still FETCHING: stopping via the exposed
   * Howl alone leaves a zombie — the clip lands seconds later (dialogue TTS
   * generates 1–3 s) and starts speaking over whatever interrupted it.
   * A suppressed line settles (audioDone fires, read-along brightens); a
   * suppressed-before-play line cannot be tap-replayed (no sound exists) —
   * accepted, the window is sub-seconds and the next line reloads fresh.
   */
  stopNonce?: number;
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
  onSettled,
  replayNonce = 0,
  onPlayback,
  stopNonce = 0,
}: Props) {
  const [, setError] = useState<string | null>(null);
  const soundRef = useRef<Howl | null>(null);
  const urlRef = useRef<string | null>(null);
  const onPlaybackRef = useRef(onPlayback);
  useEffect(() => {
    onPlaybackRef.current = onPlayback;
  });
  // The playKey we've already loaded+played. A line plays AT MOST ONCE per key;
  // re-runs of the load effect (mute↔unmute crossing the volume-0 boundary, a
  // settings open/close, any parent re-render that flips `enabled`) must never
  // restart a line the player already heard.
  const playedKeyRef = useRef<string | null>(null);
  // The playKey we've already reported as settled — onSettled fires once per
  // key no matter how the line ends (finished, failed fetch, decode error).
  const settledKeyRef = useRef<string | null>(null);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  });
  const enabled = volume > 0 && !!voiceId;

  function dispose() {
    if (soundRef.current) {
      soundRef.current.stop();
      soundRef.current.unload();
      soundRef.current = null;
      onPlaybackRef.current?.(null, null);
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

  // Stop-on-demand. The ref-compare pattern (see replay below) makes a
  // remount with a stale nonce inert. `stoppedKeyRef` is the in-flight
  // suppressor: the load pipeline checks it around its awaits, so a stop
  // that lands while the clip is still fetching kills the playback BEFORE
  // it starts (a plain sound.stop() can only reach a sound that exists).
  const stoppedKeyRef = useRef<string | null>(null);
  const lastStopRef = useRef(stopNonce);
  useEffect(() => {
    if (stopNonce === lastStopRef.current) return;
    lastStopRef.current = stopNonce;
    stoppedKeyRef.current = playKey;
    soundRef.current?.stop(); // settles via onstop when already playing
  }, [stopNonce, playKey]);

  // Replay-on-demand. Tracks the last nonce in a ref (not a dep-less mount
  // check) so a remount with a stale nonce (scene re-show after dialogue)
  // doesn't replay uninvited. Only an already-loaded, currently-idle sound
  // replays — never a refetch, never an interruption of an ongoing line.
  const lastReplayRef = useRef(replayNonce);
  useEffect(() => {
    if (replayNonce === lastReplayRef.current) return;
    lastReplayRef.current = replayNonce;
    const sound = soundRef.current;
    if (!sound || !enabled || sound.playing()) return;
    sound.seek(0);
    sound.play();
  }, [replayNonce, enabled]);

  useEffect(() => {
    let cancelled = false;

    function settle() {
      if (cancelled || settledKeyRef.current === playKey) return;
      settledKeyRef.current = playKey;
      onSettledRef.current?.();
    }

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
      // Suppressed before we even started (stop landed pre-load) — settle
      // and skip the fetch (an uncacheable line would bill for nothing).
      if (stoppedKeyRef.current === playKey) {
        settle();
        return;
      }

      try {
        // R2 cache → /api/tts, with all cooldown/429/503 handling shared
        // with the choice read-aloud path (speech-fetch.ts).
        const line = await fetchSpeechLine(text, voiceId, voiceSpeed, cache);
        if (cancelled) return;
        // Stop landed WHILE fetching (the common interrupt window — TTS
        // generation takes 1–3 s) → never start this playback.
        if (stoppedKeyRef.current === playKey) {
          settle();
          return;
        }
        if (!line) {
          // This line will never play (budget/cooldown/server error) —
          // unblock anything waiting on the narration voice.
          settle();
          return;
        }

        const url = URL.createObjectURL(line.blob);
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
          onend: () => settle(),
          // External interruption — the "one voice at a time" policy: a
          // choice tap / dialogue opening / mic start stops this line via
          // the exposed Howl (onPlayback). Settling it keeps every gate
          // honest (read-along brightens, narrationAudioDone fires). The
          // INTERNAL dispose path (scene change, unmount) stops too, but
          // its cleanup sets `cancelled` first, so settle() no-ops there.
          onstop: () => settle(),
          onloaderror: (_id, e) => {
            console.warn("[speech] load error", String(e));
            settle();
          },
          onplayerror: (_id, e) => {
            console.warn("[speech] play error", String(e));
            settle();
          },
        });
        soundRef.current = sound;
        // Hand the sound + timing to the read-along highlight BEFORE play()
        // so the very first frame of audio already has a sync target.
        onPlaybackRef.current?.(sound, line.alignment);
        sound.play();
      } catch (err) {
        if (!cancelled) {
          console.warn("[speech] threw:", err);
          setError("audio_failed");
          settle();
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
