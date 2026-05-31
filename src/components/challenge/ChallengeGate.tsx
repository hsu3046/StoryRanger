"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { Challenge } from "@/lib/education";
import { encounterIntroLine, encounterOutroLine } from "@/lib/encounter-lines";
import { EncounterCaption } from "../encounter/EncounterCaption";
import { EducationalChallenge } from "./EducationalChallenge";

/** How long the intro / outro narration line lingers (ms). */
const INTRO_MS = 1400;
const OUTRO_MS = 1200;

/**
 * Branch educational-challenge gate with a narrated bookend:
 *   intro line ("A riddle blocks the path.") → the problem(s) → outro line
 *   ("The way is clear again.") → resolve.
 *
 * The parent (StoryPlayer) owns the multi-problem state (`solvedCount`,
 * `attemptKey`) and re-generates `challenge` per problem; this component
 * remounts the card on each (so it re-rolls) and only fires `onResolved` once
 * the beat for that result has played. Wrap the whole gate in `AnimatePresence`
 * upstream so the dim/blur veil fades in on open and out on resolve.
 */
export function ChallengeGate({
  challenge,
  solvedCount,
  total,
  attemptKey,
  seed,
  onResolved,
}: {
  challenge: Challenge;
  /** Problems already solved in this gate (0-based). */
  solvedCount: number;
  /** Total problems required to pass. */
  total: number;
  /** Retry counter for the current problem (re-rolls on a wrong answer). */
  attemptKey: number;
  /** Stable per-gate seed so the intro/outro lines don't re-roll each render. */
  seed: number;
  /** Correct on the LAST problem resolves the gate (after the outro beat);
   *  otherwise advances / retries immediately. */
  onResolved: (correct: boolean) => void;
}) {
  const [phase, setPhase] = useState<"intro" | "solving" | "outro">("intro");

  // intro → solving after the line has been read.
  useEffect(() => {
    if (phase !== "intro") return;
    const t = setTimeout(() => setPhase("solving"), INTRO_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const introLine = encounterIntroLine({ kind: "challenge", seed });
  const outroLine = encounterOutroLine(seed + 7);

  function handleSolved(correct: boolean) {
    const isLast = correct && solvedCount + 1 >= total;
    if (isLast) {
      // Show the "way is clear" beat, then hand back so the gate resolves.
      setPhase("outro");
      setTimeout(() => onResolved(true), OUTRO_MS);
      return;
    }
    // Wrong answer (retry) or a non-final correct (advance) — let the parent
    // re-roll / advance; the card remounts via its key below.
    onResolved(correct);
  }

  return (
    <motion.div
      key="challenge-gate"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="fixed inset-0 z-[55] bg-ink/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <AnimatePresence mode="wait">
        {phase === "intro" ? (
          <EncounterCaption key="intro" line={introLine} />
        ) : phase === "outro" ? (
          <EncounterCaption key="outro" line={outroLine} />
        ) : (
          <EducationalChallenge
            // Remount per problem so a retry / next problem re-rolls + replays
            // the card's bloom.
            key={`${solvedCount}-${attemptKey}`}
            mode="gate"
            challenge={challenge}
            progress={
              total > 1 ? { current: solvedCount + 1, total } : undefined
            }
            onSolved={(correct) => handleSolved(correct)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
