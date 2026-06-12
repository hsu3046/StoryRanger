"use client";

import { Howl } from "howler";
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSpeechBlob } from "@/lib/speech-fetch";

/**
 * Choice read-aloud orchestrator — the pre-reader accessibility layer.
 *
 * Two jobs:
 *  1. AUTO SEQUENCE — once the scene's narration finishes, read every visible
 *     choice label aloud in order, exposing `readingIndex` so the matching
 *     button can highlight while its line plays. Runs once per `autoKey`
 *     (scene), so re-renders/mute-toggles never re-trigger it.
 *  2. TWO-STEP TAP — `tap(i)` re-reads label i and ARMS it; tapping the same
 *     button again confirms (the caller's real select handler). A child who
 *     can't read can poke buttons safely: nothing commits until the second
 *     tap on the same tile. When the voice channel is muted there is nothing
 *     to listen to, so taps degrade to the classic single-tap select.
 *
 * Playback mirrors SpeechAudio: blob via fetchSpeechBlob (R2 cache → TTS),
 * Howler Web Audio (html5:false) so it mixes with the BGM on iOS.
 */

const ARM_TIMEOUT_MS = 6_000;
const SEQUENCE_GAP_MS = 250;
/** Lets the choice buttons' entrance stagger land before the first line. */
const SEQUENCE_START_DELAY_MS = 450;

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface ChoiceReaderOptions {
  /** Visible choice labels, in the exact order the buttons render. */
  labels: string[];
  /** Voice for the read-aloud (the scene narrator keeps it consistent). */
  voiceId: string;
  voiceSpeed: number;
  /** Voice channel volume; 0 disables read-aloud AND the two-step tap. */
  volume: number;
  /** Gate for the auto sequence (e.g. narration finished, no overlay). */
  enabled: boolean;
  /** Unique key per choice set (scene id) — the auto sequence plays once per
   *  key. `null` disables auto-read entirely (dialogue suggestions). */
  autoKey: string | null;
  /** R2-cacheable? Static scene labels yes; LLM suggestions no. */
  cache?: boolean;
  /** The real select action — fired on the second tap of an armed button. */
  onConfirm: (index: number) => void;
}

export interface ChoiceReader {
  /** Index whose audio is playing right now (auto sequence or tap replay). */
  readingIndex: number | null;
  /** Index armed by a first tap, waiting for its confirming second tap. */
  armedIndex: number | null;
  /** Two-step tap handler — wire this to every choice button's onClick. */
  tap: (index: number) => void;
  /** Hard-stop everything (mic opened, scene changed, dialog opened…). */
  stopAll: () => void;
}

export function useChoiceReader({
  labels,
  voiceId,
  voiceSpeed,
  volume,
  enabled,
  autoKey,
  cache = true,
  onConfirm,
}: ChoiceReaderOptions): ChoiceReader {
  const [readingIndex, setReadingIndex] = useState<number | null>(null);
  const [armedIndex, setArmedIndex] = useState<number | null>(null);

  // Generation counter — bumping it invalidates every in-flight fetch/play
  // loop (they re-check after each await). Cheaper and safer than juggling
  // AbortControllers across Howler callbacks.
  const genRef = useRef(0);
  const howlRef = useRef<Howl | null>(null);
  const urlRef = useRef<string | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playedAutoKeyRef = useRef<string | null>(null);

  // Latest values for the async loops without re-triggering effects.
  // (Synced in an effect — the loops/handlers only read them after commit.)
  const labelsRef = useRef(labels);
  const onConfirmRef = useRef(onConfirm);
  const volumeRef = useRef(volume);
  useEffect(() => {
    labelsRef.current = labels;
    onConfirmRef.current = onConfirm;
    volumeRef.current = volume;
  });

  const disposeHowl = useCallback(() => {
    if (howlRef.current) {
      howlRef.current.stop(); // fires onstop → resolves a pending play await
      howlRef.current.unload();
      howlRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const clearArmTimer = useCallback(() => {
    if (armTimerRef.current) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  }, []);

  const stopAll = useCallback(() => {
    genRef.current++;
    disposeHowl();
    clearArmTimer();
    setReadingIndex(null);
    setArmedIndex(null);
  }, [disposeHowl, clearArmTimer]);

  /** Fetch + play one label; resolves when playback ends (or fails/stops).
   *  `onStarted` fires when Howler confirms audio actually began. */
  const playLabel = useCallback(
    async (index: number, gen: number, onStarted?: () => void): Promise<void> => {
      const label = labelsRef.current[index];
      if (!label) return;
      const blob = await fetchSpeechBlob(label, voiceId, voiceSpeed, cache);
      if (!blob || gen !== genRef.current) return;
      disposeHowl();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      await new Promise<void>((resolve) => {
        const sound = new Howl({
          src: [url],
          format: ["mp3"], // blob URL has no extension → tell Howler the codec
          html5: false, // Web Audio → mixes with the BGM instead of stopping it
          volume: clamp(volumeRef.current),
          onplay: () => onStarted?.(),
          onend: () => resolve(),
          onstop: () => resolve(),
          onloaderror: () => resolve(),
          onplayerror: () => resolve(),
        });
        howlRef.current = sound;
        sound.play();
      });
    },
    [voiceId, voiceSpeed, cache, disposeHowl],
  );

  // Live volume changes apply to the playing clip without reloading it.
  useEffect(() => {
    howlRef.current?.volume(clamp(volume));
  }, [volume]);

  // ── Auto sequence — once per autoKey ─────────────────────────────────
  useEffect(() => {
    if (!enabled || !autoKey || volume <= 0) return;
    if (playedAutoKeyRef.current === autoKey) return;
    const gen = ++genRef.current;
    let alive = true;

    void (async () => {
      await sleep(SEQUENCE_START_DELAY_MS);
      if (!alive || gen !== genRef.current) return;
      for (let i = 0; i < labelsRef.current.length; i++) {
        if (!alive || gen !== genRef.current) break;
        setReadingIndex(i);
        // The key is recorded only when audio CONFIRMS it started (same
        // rationale as SpeechAudio's playedKeyRef): a StrictMode cancel or
        // a failed fetch must not burn the scene's one auto-read.
        await playLabel(i, gen, () => {
          playedAutoKeyRef.current = autoKey;
        });
        if (!alive || gen !== genRef.current) break;
        await sleep(SEQUENCE_GAP_MS);
      }
      if (alive && gen === genRef.current) setReadingIndex(null);
    })();

    return () => {
      alive = false;
      // genRef is a generation COUNTER (not a DOM node) — reading the latest
      // value here is the point: only the still-owning run cancels itself.
      if (genRef.current === gen) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        genRef.current++;
        disposeHowl();
        setReadingIndex(null);
      }
    };
  }, [enabled, autoKey, volume, playLabel, disposeHowl]);

  // ── New choice set → drop stale armed/reading state ──────────────────
  const labelsKey = labels.join("|");
  useEffect(() => {
    return () => {
      // Generation counter, not a DOM ref — bumping the LATEST value is the
      // intent (invalidates whatever loop is currently in flight).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      genRef.current++;
      disposeHowl();
      clearArmTimer();
      setReadingIndex(null);
      setArmedIndex(null);
    };
  }, [labelsKey, autoKey, disposeHowl, clearArmTimer]);

  const tap = useCallback(
    (index: number) => {
      // Muted voice channel → nothing to listen to; behave like the classic
      // immediate select so readers aren't taxed with a pointless double tap.
      if (volumeRef.current <= 0) {
        onConfirmRef.current(index);
        return;
      }
      if (armedIndex === index) {
        stopAll();
        onConfirmRef.current(index);
        return;
      }
      // First tap (or a different tile) — re-read it and arm.
      const gen = ++genRef.current; // cancels the auto sequence / prior replay
      disposeHowl();
      clearArmTimer();
      setReadingIndex(index);
      setArmedIndex(index);
      armTimerRef.current = setTimeout(() => setArmedIndex(null), ARM_TIMEOUT_MS);
      void playLabel(index, gen).then(() => {
        if (gen === genRef.current) setReadingIndex(null);
      });
    },
    [armedIndex, stopAll, playLabel, disposeHowl, clearArmTimer],
  );

  // Unmount — kill any playback (StoryPlayer unmount mid-sequence).
  useEffect(() => stopAll, [stopAll]);

  return { readingIndex, armedIndex, tap, stopAll };
}
