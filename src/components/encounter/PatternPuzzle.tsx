"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import type { PatternPuzzleDefT as PatternPuzzleDef } from "@/data/schemas";

interface Props {
  puzzle: PatternPuzzleDef;
  onSolved: (correct: boolean) => void;
}

type Phase = "watch" | "input" | "done";

/**
 * Light, non-math pattern puzzle. Symbols flash in order; the child taps
 * them back. One wrong tap ends the puzzle with `correct: false`.
 */
export function PatternPuzzle({ puzzle, onSolved }: Props) {
  const [phase, setPhase] = useState<Phase>("watch");
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [progress, setProgress] = useState(0); // how many correct taps so far
  const stepRef = useRef(0);

  // Playback the sequence at the start
  useEffect(() => {
    if (phase !== "watch") return;
    let cancelled = false;
    stepRef.current = 0;

    function nextStep() {
      if (cancelled) return;
      if (stepRef.current >= puzzle.sequence.length) {
        setActiveIdx(null);
        setPhase("input");
        return;
      }
      const symIdx = puzzle.sequence[stepRef.current];
      setActiveIdx(symIdx);
      setTimeout(() => {
        if (cancelled) return;
        setActiveIdx(null);
        stepRef.current += 1;
        setTimeout(nextStep, 220);
      }, 520);
    }

    const start = setTimeout(nextStep, 480);
    return () => {
      cancelled = true;
      clearTimeout(start);
    };
  }, [phase, puzzle.sequence]);

  function tap(i: number) {
    if (phase !== "input") return;
    const expected = puzzle.sequence[progress];
    if (i !== expected) {
      setPhase("done");
      setTimeout(() => onSolved(false), 350);
      return;
    }
    // Flash to confirm
    setActiveIdx(i);
    setTimeout(() => setActiveIdx(null), 220);
    const nextProgress = progress + 1;
    setProgress(nextProgress);
    if (nextProgress >= puzzle.sequence.length) {
      setPhase("done");
      setTimeout(() => onSolved(true), 350);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="pointer-events-auto fixed left-1/2 top-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-card-lg bg-paper p-6 shadow-overlay ring-1 ring-ink-soft/10 sm:p-8"
    >
      <header className="flex flex-col items-center gap-1">
        <p className="font-handwritten text-2xl text-accent-deep">
          {puzzle.title}
        </p>
        <p className="text-sm text-ink-soft">
          {phase === "watch"
            ? "Watch the order…"
            : phase === "input"
              ? `Now you — tap them back (${progress}/${puzzle.sequence.length})`
              : "Done!"}
        </p>
      </header>

      <div
        className={`grid gap-3 sm:gap-4 ${
          puzzle.symbols.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"
        }`}
      >
        {puzzle.symbols.map((s, i) => {
          const isActive = activeIdx === i;
          return (
            <button
              key={i}
              type="button"
              disabled={phase !== "input"}
              onClick={() => tap(i)}
              aria-label={`Tap ${s}`}
              className={`flex h-24 items-center justify-center rounded-card-lg text-5xl shadow-soft transition-all duration-150 ${
                isActive
                  ? "scale-110 bg-accent-deep shadow-button-hover"
                  : "bg-paper-deep/60 hover:bg-paper-deep active:scale-95"
              } ${
                phase !== "input" && !isActive
                  ? "cursor-default opacity-80"
                  : ""
              }`}
            >
              <span
                className="select-none"
                style={{
                  filter: isActive
                    ? "drop-shadow(0 0 14px rgba(255,235,180,0.9))"
                    : undefined,
                }}
              >
                {s}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {phase === "input" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-1.5"
          >
            {puzzle.sequence.map((_, i) => (
              <span
                key={i}
                className={`h-2 w-6 rounded-full transition-colors ${
                  i < progress ? "bg-accent-deep" : "bg-ink-soft/20"
                }`}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
