"use client";

import { Howler } from "howler";
import { useCallback, useEffect, useRef, useState } from "react";

import { getAudio } from "@/lib/audio-engine";
import {
  MAX_AUDIO_BYTES,
  MAX_RECORDING_MS,
  MIN_RECORDING_MS,
} from "@/lib/stt-config";
import { isSttCoolingDown, startSttCooldown } from "@/lib/stt-cooldown";
import { retryAfterSecondsFrom } from "@/lib/tts-cooldown";

/**
 * Push-to-talk recording → /api/stt transcription, as a hook.
 *
 * iOS Safari choreography (the reason this file exists):
 *  - getUserMedia is acquired INSIDE the tap (gesture context) and released
 *    the moment the recording stops — holding the stream would keep the
 *    audio session in record mode (red indicator, ducked BGM) forever.
 *  - Entering record mode re-routes the audio session, so we duck the BGM to
 *    silence ourselves (doubles as a clean transcription: no music bleeding
 *    into the mic) and restore it — plus `Howler.ctx.resume()` — after the
 *    tracks are stopped.
 *  - The level meter taps `Howler.ctx` (the app's ONE AudioContext); creating
 *    a second context just for analysis aggravates iOS session juggling.
 */

export type VoiceCaptureStatus = "idle" | "recording" | "transcribing";

export type VoiceCaptureResult =
  | { ok: true; transcript: string }
  | { ok: false; reason: "too-short" | "denied" | "cooldown" | "stt-error" };

/** webm/opus first (Chrome/Android, ~70 KB per 6 s clip); iOS Safari only
 *  does mp4/AAC. No `isTypeSupported` at all → construct with no options and
 *  let the browser pick (recorder.mimeType tells us what we got). */
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

const DENIED_LS_KEY = "storyranger:micDenied";

function pickMimeType(): string | undefined {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return undefined;
  }
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

/** Extension must match the container or the server-side parse fails. */
function uploadFilename(mime: string): string {
  return mime.includes("mp4") || mime.includes("aac")
    ? "speech.mp4"
    : "speech.webm";
}

export interface VoiceCapture {
  status: VoiceCaptureStatus;
  /** Live mic level 0–1 while recording — drives the button's pulse. */
  level: number;
  /** MediaRecorder + getUserMedia available (false → render no mic UI). */
  supported: boolean;
  /** Permission denied (now or persisted) — render no mic UI. */
  denied: boolean;
  /** Begin recording. Must be called from a user gesture (tap handler). */
  start: () => Promise<void>;
  /** Stop and submit for transcription. */
  stop: () => void;
  /** Stop and discard (page hidden, scene change, unmount). */
  cancel: () => void;
}

export function useVoiceCapture(opts: {
  /** Visible choice labels — sent along for vocabulary biasing. */
  labels: string[];
  onResult: (result: VoiceCaptureResult) => void;
}): VoiceCapture {
  const [status, setStatus] = useState<VoiceCaptureStatus>("idle");
  const [level, setLevel] = useState(0);
  const [supported, setSupported] = useState(false);
  const [denied, setDenied] = useState(false);

  // Synced in an effect — only read from event handlers/async paths.
  const labelsRef = useRef(opts.labels);
  const onResultRef = useRef(opts.onResult);
  useEffect(() => {
    labelsRef.current = opts.labels;
    onResultRef.current = opts.onResult;
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  // Synchronous re-entrancy guard: kids double-tap, and `recorderRef` is
  // still null while the first start() awaits getUserMedia — without this a
  // second tap acquires a SECOND stream that nothing ever releases.
  const startingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const discardRef = useRef(false);
  const hardCutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Capability + persisted-denial check (client only — a useState initializer
  // would run truthy in the browser but falsy during SSR → hydration mismatch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot capability probe of a browser-only API
    setSupported(
      typeof MediaRecorder !== "undefined" &&
        typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia,
    );
    if (localStorage.getItem(DENIED_LS_KEY) !== "1") return;
    setDenied(true);
    // If the user re-allowed the mic in browser settings since, lift the
    // flag without making them find a toggle (Permissions API where present).
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((p) => {
        if (p.state !== "denied") {
          localStorage.removeItem(DENIED_LS_KEY);
          setDenied(false);
        }
      })
      .catch(() => {
        /* Permissions API absent/unsupported key — keep the flag */
      });
  }, []);

  /** Stop tracks + meters and give the audio session back to playback. */
  const releaseAudioSession = useCallback(() => {
    if (hardCutRef.current) {
      clearTimeout(hardCutRef.current);
      hardCutRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* already disconnected */
    }
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLevel(0);
    // iOS parks the context as "suspended"/"interrupted" when leaving record
    // mode — nudge it back before unducking. (Cast: iOS reports a
    // non-standard "interrupted" state TS doesn't know.)
    const ctx = Howler.ctx;
    if (ctx && (ctx.state as string) !== "running") {
      void ctx.resume().catch(() => {});
    }
    getAudio().unduckBgm();
  }, []);

  const startLevelMeter = useCallback((stream: MediaStream) => {
    const ctx = Howler.ctx;
    if (!ctx) return; // meter is cosmetic — recording works without it
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser); // analyser only — never to destination (echo)
      sourceRef.current = source;
      const data = new Uint8Array(analyser.frequencyBinCount);
      let last = -1;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        // RMS ×3 ≈ comfortable 0–1 range for speech; quantized so the 60fps
        // loop only re-renders on visible changes.
        const lvl = Math.round(Math.min(1, Math.sqrt(sum / data.length) * 3) * 20) / 20;
        if (lvl !== last) {
          last = lvl;
          setLevel(lvl);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      /* meter is optional */
    }
  }, []);

  const transcribe = useCallback(async (blob: Blob, mime: string) => {
    setStatus("transcribing");
    try {
      const form = new FormData();
      form.append("audio", new File([blob], uploadFilename(mime), { type: mime }));
      form.append("labels", JSON.stringify(labelsRef.current));
      const res = await fetch("/api/stt", { method: "POST", body: form });
      if (res.status === 429) {
        startSttCooldown(retryAfterSecondsFrom(res));
        onResultRef.current({ ok: false, reason: "cooldown" });
        return;
      }
      if (!res.ok) {
        console.warn(`[stt] ${res.status}`);
        onResultRef.current({ ok: false, reason: "stt-error" });
        return;
      }
      const json = (await res.json()) as { transcript?: string };
      onResultRef.current({ ok: true, transcript: json.transcript ?? "" });
    } catch (err) {
      console.warn("[stt] request threw:", err);
      onResultRef.current({ ok: false, reason: "stt-error" });
    } finally {
      setStatus("idle");
    }
  }, []);

  const start = useCallback(async () => {
    if (startingRef.current || recorderRef.current || !supported || denied) {
      return;
    }
    if (isSttCoolingDown()) {
      onResultRef.current({ ok: false, reason: "cooldown" });
      return;
    }
    startingRef.current = true;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      startingRef.current = false;
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        localStorage.setItem(DENIED_LS_KEY, "1");
        setDenied(true);
        onResultRef.current({ ok: false, reason: "denied" });
      } else {
        // No mic / hardware busy — treat as unsupported for this session.
        setSupported(false);
      }
      return;
    }

    getAudio().duckBgm();
    streamRef.current = stream;
    chunksRef.current = [];
    discardRef.current = false;
    startedAtRef.current = Date.now();

    const mime = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch {
      // Options rejected (Safari quirks) — final fallback: browser default.
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        // Even the bare constructor failed — release the stream + duck NOW
        // (nothing else will) and stop offering the mic this session.
        startingRef.current = false;
        releaseAudioSession();
        setSupported(false);
        return;
      }
    }
    recorderRef.current = recorder;
    startingRef.current = false;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onerror = (e) => {
      // Recording died mid-flight (device yanked, OS revoked the mic).
      console.warn("[stt] recorder error:", e);
      discardRef.current = true;
      try {
        if (recorder.state === "recording") {
          recorder.stop(); // normal teardown via onstop
          return;
        }
      } catch {
        /* fall through to direct teardown */
      }
      // onstop won't fire — tear down directly (all idempotent).
      chunksRef.current = [];
      recorderRef.current = null;
      releaseAudioSession();
      setStatus("idle");
    };
    recorder.onstop = () => {
      const actualMime = recorder.mimeType || mime || "audio/webm";
      const durationMs = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: actualMime });
      chunksRef.current = [];
      recorderRef.current = null;
      releaseAudioSession();
      if (discardRef.current) {
        setStatus("idle");
        return;
      }
      if (durationMs < MIN_RECORDING_MS || blob.size === 0) {
        setStatus("idle");
        onResultRef.current({ ok: false, reason: "too-short" });
        return;
      }
      if (blob.size > MAX_AUDIO_BYTES) {
        // Shouldn't happen under the 6 s hard cut; don't upload a 413.
        setStatus("idle");
        onResultRef.current({ ok: false, reason: "stt-error" });
        return;
      }
      void transcribe(blob, actualMime);
    };

    // No timeslice — iOS Safari is most reliable delivering ONE blob on stop.
    recorder.start();
    setStatus("recording");
    startLevelMeter(stream);
    hardCutRef.current = setTimeout(() => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    }, MAX_RECORDING_MS);
  }, [supported, denied, releaseAudioSession, startLevelMeter, transcribe]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      discardRef.current = false;
      rec.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      discardRef.current = true;
      rec.stop();
    } else {
      // Recorder never came up but a stream might have — release anyway.
      releaseAudioSession();
    }
  }, [releaseAudioSession]);

  // Backgrounding mid-recording (home button, app switch, rotation overlay)
  // must not leave a live mic behind.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [cancel]);

  // Unmount → discard.
  useEffect(() => cancel, [cancel]);

  return { status, level, supported, denied, start, stop, cancel };
}
