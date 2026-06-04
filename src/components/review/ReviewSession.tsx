"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  loadReview,
  markMastered,
  reviewCount,
  type ReviewItem,
} from "@/lib/review-store";
import { EducationalChallenge } from "@/components/challenge/EducationalChallenge";
import { getAudio, SFX } from "@/lib/audio-engine";

interface Props {
  storyId: string;
  storyTitle: string;
  /** Fired when the session closes; `remaining` is the live store count so the
   *  caller can refresh its button. */
  onClose: (summary: { mastered: number; remaining: number }) => void;
}

type Phase = "intro" | "solving" | "results";

/**
 * Flashcard review of the questions the player got wrong this story. Each
 * stored Challenge is replayed verbatim via EducationalChallenge (gate mode, no
 * timer); a correct answer "masters" it (removed from the store), a wrong one
 * keeps it (the player still saw the right answer via the card's feedback).
 *
 * It renders EducationalChallenge DIRECTLY (never StoryPlayer/BattleScreen), so
 * the review session never feeds itself back into the wrong-answer store.
 */
export function ReviewSession({ storyId, storyTitle, onClose }: Props) {
  // Snapshot the queue once — a single linear pass; removals persist to the
  // store immediately but don't reshuffle the in-flight list. Lazy init runs
  // client-side only (mounted post-hydration behind AnimatePresence).
  const [queue] = useState<ReviewItem[]>(() => loadReview(storyId));
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>(queue.length ? "intro" : "results");
  const [masteredKeys, setMasteredKeys] = useState<Set<string>>(new Set());
  /** Brief between-card cue: "mastered" (⭐) or "kept" (let's revisit). */
  const [flash, setFlash] = useState<"mastered" | "kept" | null>(null);
  /** True from the instant the current card is answered until it advances —
   *  blocks the close button so finish() can't read a stale count while the
   *  answer is mid-commit (EducationalChallenge delays onSolved by FEEDBACK_MS). */
  const [committing, setCommitting] = useState(false);
  /** Pending advance timer — cleared on unmount so it never fires into a gone
   *  component (e.g. the player closes mid-cue). */
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  // Challenge BGM for the whole review session — the same track the in-story
  // challenge gate uses. The home screen has no BGM of its own, so stopping on
  // unmount simply returns to silence (nothing to restore). Story-scoped track.
  useEffect(() => {
    const audio = getAudio();
    audio.playBgm("challenge", storyId);
    return () => audio.stopBgm();
  }, [storyId]);

  const current = queue[idx];

  function handleSolved(correct: boolean) {
    if (!current) return;
    // Answer feedback cue — correct vs wrong.
    getAudio().playSfx(correct ? SFX.CORRECT : SFX.WRONG);
    if (correct) {
      markMastered(storyId, current.key);
      setMasteredKeys((s) => new Set(s).add(current.key));
    }
    setFlash(correct ? "mastered" : "kept");
    const advance = () => {
      setFlash(null);
      setCommitting(false);
      const next = idx + 1;
      if (next >= queue.length) setPhase("results");
      else setIdx(next);
    };
    // Let the ⭐ / keep cue breathe before the next card blooms in.
    advanceTimer.current = setTimeout(advance, correct ? 850 : 450);
  }

  function finish() {
    // The store is the source of truth (each correct answer already removed an
    // item); report the live count so the caller's button updates exactly.
    onClose({ mastered: masteredKeys.size, remaining: reviewCount(storyId) });
  }

  return (
    <motion.div
      key="review-veil"
      role="dialog"
      aria-modal="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="fixed inset-0 z-[55] flex items-center justify-center overflow-y-auto bg-ink/85 px-4 py-8 backdrop-blur-sm"
    >
      {/* Close (X) — bail out anytime; counts as the current progress. Disabled
          while an answer is committing so finish() can't read a stale count. */}
      <button
        type="button"
        onClick={finish}
        disabled={committing}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-paper/15 text-xl text-paper/80 backdrop-blur transition hover:bg-paper/25 active:scale-95 disabled:pointer-events-none disabled:opacity-30"
      >
        ✕
      </button>

      <AnimatePresence mode="wait">
        {phase === "intro" && (
          <motion.div
            key="intro"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
            className="flex w-[calc(100%-2rem)] max-w-md flex-col items-center gap-4 rounded-card-lg bg-paper/95 p-7 text-center shadow-overlay ring-1 ring-ink-soft/10"
          >
            <span className="text-5xl" aria-hidden>
              ✎
            </span>
            <h2 className="font-handwritten text-3xl text-accent-deep">
              Check Your Answers
            </h2>
            <p className="text-base text-ink-soft">
              {storyTitle}
            </p>
            <p className="text-lg text-ink">
              Let&apos;s practice the{" "}
              <span className="font-semibold text-accent-deep">
                {queue.length}
              </span>{" "}
              question{queue.length === 1 ? "" : "s"} you found tricky!
            </p>
            <button
              type="button"
              onClick={() => setPhase("solving")}
              className="mt-2 min-h-14 w-full rounded-button bg-accent-deep text-lg font-medium text-paper shadow-card transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
            >
              Start
            </button>
          </motion.div>
        )}

        {phase === "solving" && current && (
          <div key="solving" className="flex w-full justify-center">
            <EducationalChallenge
              // Remount per problem → re-bloom + reset the card's internal state.
              key={`${idx}-${current.key}`}
              challenge={current.challenge}
              mode="gate"
              withTimer={false}
              placement="inline"
              progress={{ current: idx + 1, total: queue.length }}
              onAnswered={() => setCommitting(true)}
              onSolved={(correct) => handleSolved(correct)}
            />
          </div>
        )}

        {phase === "results" && (
          <motion.div
            key="results"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
            className="flex w-[calc(100%-2rem)] max-w-md flex-col items-center gap-4 rounded-card-lg bg-paper/95 p-7 text-center shadow-overlay ring-1 ring-ink-soft/10"
          >
            <span className="text-5xl" aria-hidden>
              {queue.length === 0 ? "🎉" : masteredKeys.size > 0 ? "⭐" : "💪"}
            </span>
            <h2 className="font-handwritten text-3xl text-accent-deep">
              {queue.length === 0 ? "All caught up!" : "Great work!"}
            </h2>
            {queue.length > 0 && (
              <p className="text-lg text-ink">
                Mastered{" "}
                <span className="font-semibold text-emerald">
                  {masteredKeys.size}
                </span>{" "}
                · {queue.length - masteredKeys.size} still to practice
              </p>
            )}
            {queue.length === 0 && (
              <p className="text-base text-ink-soft">
                No tricky questions to review right now.
              </p>
            )}
            <button
              type="button"
              onClick={finish}
              className="mt-2 min-h-14 w-full rounded-button bg-accent-deep text-lg font-medium text-paper shadow-card transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
            >
              Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Between-card cue. */}
      <AnimatePresence>
        {flash && (
          <motion.div
            key={`flash-${idx}-${flash}`}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-none absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-pill bg-ink/70 px-5 py-2 text-base font-semibold text-paper backdrop-blur"
          >
            {flash === "mastered" ? "⭐ Mastered!" : "Let's revisit this one"}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
