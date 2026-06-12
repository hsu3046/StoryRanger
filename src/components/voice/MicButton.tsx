"use client";

import { CircleNotch, Microphone, MicrophoneSlash } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { useVoiceCapture, type VoiceCaptureResult } from "@/lib/useVoiceCapture";
import { matchUtterance } from "@/lib/voice-match";

/**
 * Push-to-talk choice picker. Tap → record (≤6 s, auto-cut) → tap again to
 * stop → transcribe → fuzzy-match against `labels` → `onMatch(index)`.
 *
 * The button itself is agnostic about what the labels MEAN — the parent maps
 * the index back to its ask/branch/suggestion handler, which is what lets one
 * component serve both the scene choice row and the dialogue cards.
 *
 * Fail-VISIBLE by design (reversed from the original fail-soft after user
 * feedback — a button that vanishes when tapped is the worst possible UX):
 * the mic stays on screen through permission denials, STT cooldowns, and
 * infra errors, showing its state (slash icon / message bubble) instead of
 * disappearing. The only thing that hides it is a browser with no
 * MediaRecorder/getUserMedia at all. While recording, a sonar pulse animates
 * continuously (independent of the level halo) so the child always SEES that
 * the game is listening.
 */

interface Props {
  /** Visible choice labels, in button render order. */
  labels: string[];
  /** A spoken pick resolved to a label index. */
  onMatch: (index: number) => void;
  /** Recording is about to start — stop any read-aloud so it doesn't bleed
   *  into the mic (the BGM duck is handled inside the capture hook). */
  onRecordingStart?: () => void;
  /** Live recording state — lets the parent gate actions that would speak
   *  into the open mic (e.g. the narration tap-to-replay). */
  onRecordingChange?: (recording: boolean) => void;
  disabled?: boolean;
  /** `row` sits in the main choice row (large); `compact` in dialogue. */
  size?: "row" | "compact";
}

const FEEDBACK_MS = 2_200;

/** Per-failure bubble copy — blame-free, always points at the tap fallback. */
function feedbackMessage(result: VoiceCaptureResult): string {
  if (result.ok) return "Try again — or just tap!"; // heard, but no match
  switch (result.reason) {
    case "denied":
      return "Mic is blocked — just tap instead!";
    case "cooldown":
      return "Voice is resting — just tap instead!";
    case "too-short":
      return "A little longer — or just tap!";
    default: // stt-error / mic-error
      return "Try again — or just tap!";
  }
}

export function MicButton({
  labels,
  onMatch,
  onRecordingStart,
  onRecordingChange,
  disabled,
  size = "row",
}: Props) {
  // Transient message bubble after a failed/unmatched attempt.
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synced in an effect — only read from the async result callback.
  const labelsRef = useRef(labels);
  const onMatchRef = useRef(onMatch);
  useEffect(() => {
    labelsRef.current = labels;
    onMatchRef.current = onMatch;
  });

  const showFeedback = useCallback((message: string) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback(message);
    feedbackTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
  }, []);

  const onResult = useCallback(
    (result: VoiceCaptureResult) => {
      if (result.ok) {
        const match = matchUtterance(result.transcript, labelsRef.current);
        if (match.kind === "match") {
          onMatchRef.current(match.index);
          return;
        }
      }
      showFeedback(feedbackMessage(result));
    },
    [showFeedback],
  );

  const capture = useVoiceCapture({ labels, onResult });

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  // Live recording flag for the parent (gates e.g. the narration replay
  // while the mic is open). Ref-routed so a parent passing an inline arrow
  // doesn't re-run the effect every render; the cleanup covers every way a
  // recording ends (tap-stop, 6 s hard cut, error, unmount-cancel). MUST
  // stay above the early return below (rules of hooks).
  const isRecording = capture.status === "recording";
  const onRecordingChangeRef = useRef(onRecordingChange);
  useEffect(() => {
    onRecordingChangeRef.current = onRecordingChange;
  });
  useEffect(() => {
    onRecordingChangeRef.current?.(isRecording);
    return () => {
      if (isRecording) onRecordingChangeRef.current?.(false);
    };
  }, [isRecording]);

  // The ONLY hide: the browser genuinely can't record (no MediaRecorder /
  // getUserMedia). Every runtime failure keeps the button + explains itself.
  if (!capture.supported) return null;

  const recording = capture.status === "recording";
  const transcribing = capture.status === "transcribing";

  function handleTap() {
    if (disabled || transcribing) return;
    if (recording) {
      capture.stop();
      return;
    }
    onRecordingStart?.();
    void capture.start(); // a tap while `denied` retries the permission
  }

  const dims =
    size === "row"
      ? "h-20 w-20 short:h-12 short:w-12"
      : "h-12 w-12";
  const iconSize = size === "row" ? "size-9 short:size-6" : "size-6";

  return (
    <div className="relative flex shrink-0 items-center justify-center">
      {/* Sonar pulse — constant while recording, so "the game is listening"
          is visible even in silence (the level halo below needs voice). */}
      {recording && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full ring-4 ring-accent-deep/60"
          animate={{ scale: [1, 1.45], opacity: [0.8, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      {/* Mic level halo — scales with the child's voice so they can SEE the
          game hearing them. */}
      {recording && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-accent/30"
          animate={{ scale: 1.1 + capture.level * 0.6, opacity: 0.5 + capture.level * 0.5 }}
          transition={{ duration: 0.1 }}
        />
      )}
      <button
        type="button"
        onClick={handleTap}
        disabled={disabled}
        aria-label={
          recording
            ? "Stop and answer"
            : capture.denied
              ? "Microphone blocked — tap to retry"
              : "Speak your answer"
        }
        className={`relative flex ${dims} items-center justify-center rounded-full shadow-button ring-1 backdrop-blur-sm transition-all active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40 ${
          recording
            ? "bg-accent-deep text-paper ring-accent-deep"
            : capture.denied
              ? "bg-paper/40 text-ink-soft/70 ring-ink-soft/15"
              : "bg-paper/60 text-accent-deep ring-ink-soft/15 hover:bg-paper/85 hover:ring-accent/50"
        }`}
      >
        {transcribing ? (
          <CircleNotch className={`${iconSize} animate-spin`} aria-hidden />
        ) : capture.denied && !recording ? (
          <MicrophoneSlash weight="duotone" className={iconSize} aria-hidden />
        ) : (
          <Microphone
            weight={recording ? "fill" : "duotone"}
            className={iconSize}
            aria-hidden
          />
        )}
      </button>
      {/* Blame-free status nudge — the tap buttons are right there. */}
      {feedback && (
        <motion.span
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-pill bg-paper/95 px-3 py-1 text-xs font-semibold text-ink shadow-soft ring-1 ring-ink-soft/15"
        >
          {feedback}
        </motion.span>
      )}
    </div>
  );
}
