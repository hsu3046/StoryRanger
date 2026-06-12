"use client";

import { Howl } from "howler";
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSpeechBlob } from "@/lib/speech-fetch";

/**
 * Choice read-aloud orchestrator — the pre-reader accessibility layer.
 *
 * TWO-STEP TAP only (an auto-read sequence existed briefly and was removed
 * by user decision — choices speak exclusively when tapped): `tap(i)` reads
 * label i aloud and ARMS it; tapping the same button again confirms (the
 * caller's real select handler). A child who can't read can poke buttons
 * safely: nothing commits until the second tap on the same tile. When the
 * voice channel is muted there is nothing to listen to, so taps degrade to
 * the classic single-tap select.
 *
 * Playback mirrors SpeechAudio: blob via fetchSpeechBlob (R2 cache → TTS),
 * Howler Web Audio (html5:false) so it mixes with the BGM on iOS.
 */

const ARM_TIMEOUT_MS = 6_000;

const clamp = (v: number) => Math.max(0, Math.min(1, v));

export interface ChoiceReaderOptions {
  /** Visible choice labels, in the exact order the buttons render. */
  labels: string[];
  /** Voice for the read-aloud (the scene narrator keeps it consistent). */
  voiceId: string;
  voiceSpeed: number;
  /** Voice channel volume; 0 disables read-aloud AND the two-step tap. */
  volume: number;
  /** R2-cacheable? Static scene labels yes; LLM suggestions no. */
  cache?: boolean;
  /** The real select action — fired on the second tap of an armed button. */
  onConfirm: (index: number) => void;
}

export interface ChoiceReader {
  /** Index whose audio is playing right now (tap read-aloud). */
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

  /** Fetch + play one label; resolves when playback ends (or fails/stops). */
  const playLabel = useCallback(
    async (index: number, gen: number): Promise<void> => {
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
  }, [labelsKey, disposeHowl, clearArmTimer]);

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
      // First tap (or a different tile) — read it aloud and arm.
      const gen = ++genRef.current; // cancels any prior tap's playback
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
