"use client";

import { CircleNotch, Microphone } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { isSttCoolingDown } from "@/lib/stt-cooldown";
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
 * Fail-soft by design: no mic / permission denied / STT cooldown / repeated
 * errors all collapse to "render nothing" — the tap buttons are always there,
 * so the voice path silently disappearing never blocks the game.
 */

interface Props {
  /** Visible choice labels, in button render order. */
  labels: string[];
  /** A spoken pick resolved to a label index. */
  onMatch: (index: number) => void;
  /** Recording is about to start — stop any read-aloud so it doesn't bleed
   *  into the mic (the BGM duck is handled inside the capture hook). */
  onRecordingStart?: () => void;
  disabled?: boolean;
  /** `row` sits in the main choice row (large); `compact` in dialogue. */
  size?: "row" | "compact";
}

/** After this many consecutive STT failures the voice path hides for the
 *  rest of the session (module-level: shared by scene + dialogue buttons). */
const MAX_CONSECUTIVE_FAILURES = 3;
let consecutiveFailures = 0;

const FEEDBACK_MS = 1_800;

export function MicButton({
  labels,
  onMatch,
  onRecordingStart,
  disabled,
  size = "row",
}: Props) {
  // "Try again or tap!" bubble after a failed/unmatched attempt.
  const [feedback, setFeedback] = useState(false);
  // Bumped to re-render when session-level hiding / cooldown state changes.
  const [, setTick] = useState(0);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synced in an effect — only read from the async result callback.
  const labelsRef = useRef(labels);
  const onMatchRef = useRef(onMatch);
  useEffect(() => {
    labelsRef.current = labels;
    onMatchRef.current = onMatch;
  });

  const showFeedback = useCallback(() => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback(true);
    feedbackTimer.current = setTimeout(() => setFeedback(false), FEEDBACK_MS);
  }, []);

  const onResult = useCallback(
    (result: VoiceCaptureResult) => {
      if (result.ok) {
        const match = matchUtterance(result.transcript, labelsRef.current);
        if (match.kind === "match") {
          consecutiveFailures = 0;
          onMatchRef.current(match.index);
          return;
        }
        // Heard something, just not one of the choices — a normal kid moment,
        // not a system failure. Nudge a retry; don't count toward hiding.
        showFeedback();
        return;
      }
      if (result.reason === "too-short") {
        showFeedback();
        return;
      }
      if (result.reason === "cooldown" || result.reason === "denied") {
        setTick((t) => t + 1); // re-render → render-gate below hides us
        return;
      }
      // stt-error — infra trouble. A couple of these in a row means the
      // voice path isn't working today; stop offering it.
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        setTick((t) => t + 1);
      } else {
        showFeedback();
      }
    },
    [showFeedback],
  );

  const capture = useVoiceCapture({ labels, onResult });

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  if (
    !capture.supported ||
    capture.denied ||
    isSttCoolingDown() ||
    consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
  ) {
    return null;
  }

  const recording = capture.status === "recording";
  const transcribing = capture.status === "transcribing";

  function handleTap() {
    if (disabled || transcribing) return;
    if (recording) {
      capture.stop();
      return;
    }
    onRecordingStart?.();
    void capture.start();
  }

  const dims =
    size === "row"
      ? "h-20 w-20 short:h-12 short:w-12"
      : "h-12 w-12";
  const iconSize = size === "row" ? "size-9 short:size-6" : "size-6";

  return (
    <div className="relative flex shrink-0 items-center justify-center">
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
        aria-label={recording ? "Stop and answer" : "Speak your answer"}
        className={`relative flex ${dims} items-center justify-center rounded-full shadow-button ring-1 backdrop-blur-sm transition-all active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40 ${
          recording
            ? "bg-accent-deep text-paper ring-accent-deep"
            : "bg-paper/60 text-accent-deep ring-ink-soft/15 hover:bg-paper/85 hover:ring-accent/50"
        }`}
      >
        {transcribing ? (
          <CircleNotch className={`${iconSize} animate-spin`} aria-hidden />
        ) : (
          <Microphone
            weight={recording ? "fill" : "duotone"}
            className={iconSize}
            aria-hidden
          />
        )}
      </button>
      {/* Blame-free retry nudge — the tap buttons are right there. */}
      {feedback && (
        <motion.span
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-pill bg-paper/95 px-3 py-1 text-xs font-semibold text-ink shadow-soft ring-1 ring-ink-soft/15"
        >
          Try again — or just tap!
        </motion.span>
      )}
    </div>
  );
}
