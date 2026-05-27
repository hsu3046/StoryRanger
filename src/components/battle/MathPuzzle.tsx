"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Clock } from "@phosphor-icons/react";

import { generatePuzzle, type Puzzle, type PuzzleKind } from "@/lib/puzzle";

interface Props {
  /** Monster name (for header). */
  targetName: string;
  /** Puzzle category for this attack. */
  kind: PuzzleKind;
  /** Who is solving — shown in the header so the kid knows the persona. */
  attackerLabel?: string;
  /** Called after the player picks an answer (or runs out of time). */
  onSolved: (correct: boolean, durationMs: number) => void;
  /** Current consecutive correct streak (for UI cue). */
  streak: number;
  /** "attack" (default) → "X attacks Y" header.
   *  "defend" → "Defend! Y strikes" header. */
  mode?: "attack" | "defend";
}

const HARD_TIMEOUT_MS = 10_000;
const CRIT_WINDOW_MS = 3_000;

export function MathPuzzle({
  targetName,
  kind,
  attackerLabel,
  onSolved,
  streak,
  mode = "attack",
}: Props) {
  const puzzle = useMemo<Puzzle>(() => generatePuzzle(kind), [kind]);
  const startRef = useRef<number>(0);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Initialise start time + tick the live timer
  useEffect(() => {
    startRef.current = Date.now();
    const id = setInterval(() => {
      const ms = Date.now() - startRef.current;
      setElapsedMs(ms);
      if (ms >= HARD_TIMEOUT_MS && pickedIdx === null) {
        setPickedIdx(-1); // sentinel for "time up"
        onSolved(false, ms);
      }
    }, 100);
    return () => clearInterval(id);
  }, [onSolved, pickedIdx]);

  function pick(i: number) {
    if (pickedIdx !== null) return;
    // eslint-disable-next-line react-hooks/purity -- event handler: Date.now() is fine
    const ms = Date.now() - startRef.current;
    setPickedIdx(i);
    const correct = i === puzzle.correctIndex;
    onSolved(correct, ms);
  }

  // Countdown — show TIME LEFT, not elapsed.
  const remainingMs = Math.max(0, HARD_TIMEOUT_MS - elapsedMs);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const remainingTenths = Math.max(0, Math.ceil(remainingMs / 100) / 10);
  const inCrit = remainingMs > HARD_TIMEOUT_MS - CRIT_WINDOW_MS; // first 5s
  const inWarn = remainingMs <= 5_000; // last 5s

  // Smooth progress bar (1.0 → 0.0)
  const progress = remainingMs / HARD_TIMEOUT_MS;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="pointer-events-auto fixed left-1/2 top-1/2 z-[60] flex w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-card-lg bg-paper/85 p-6 shadow-overlay ring-1 ring-ink-soft/10 backdrop-blur sm:p-8"
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <p className="font-handwritten text-base text-accent-deep">
            {mode === "defend"
              ? "Defend!"
              : attackerLabel
                ? `${attackerLabel} attacks`
                : "Solve to attack"}
          </p>
          <p className="text-lg font-semibold text-ink">
            {mode === "defend" ? `${targetName} strikes` : targetName}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {streak >= 3 && (
            <span className="rounded-pill bg-ruby/15 px-3 py-1 text-sm font-semibold text-ruby">
              🔥 Streak {streak}
            </span>
          )}
          <CountdownBadge
            seconds={remainingSec}
            tenths={remainingTenths}
            inCrit={inCrit}
            inWarn={inWarn}
          />
        </div>
      </header>

      {/* Timer progress bar — visual pulse of the time pressure */}
      <div className="relative h-2 overflow-hidden rounded-pill bg-ink-soft/10">
        <motion.div
          aria-hidden
          animate={{ width: `${progress * 100}%` }}
          transition={{ ease: "linear", duration: 0.1 }}
          className={`absolute left-0 top-0 h-full rounded-pill ${
            inCrit ? "bg-emerald" : inWarn ? "bg-ruby" : "bg-accent"
          }`}
        />
      </div>

      {/* Question */}
      <div className="flex flex-col items-center gap-2 py-4">
        <p className="text-center text-2xl sm:text-3xl font-semibold tabular-nums text-ink text-balance">
          {puzzle.question}
        </p>
      </div>

      {/* Choices */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {puzzle.choices.map((c, i) => (
          <button
            key={`${c}-${i}`}
            type="button"
            disabled={pickedIdx !== null}
            onClick={() => pick(i)}
            className="flex h-20 items-center justify-center rounded-card-lg bg-paper-deep/60 text-ink text-2xl font-bold tabular-nums ring-1 ring-ink-soft/15 transition-all hover:bg-paper-deep hover:ring-accent/40 active:scale-95 disabled:opacity-60"
          >
            {c}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function CountdownBadge({
  seconds,
  tenths,
  inCrit,
  inWarn,
}: {
  seconds: number;
  tenths: number;
  inCrit: boolean;
  inWarn: boolean;
}) {
  // Tier styling — big + bold, hard to miss.
  const tone = inCrit
    ? "bg-emerald/20 text-emerald ring-emerald/30"
    : inWarn
      ? "bg-ruby/15 text-ruby ring-ruby/30"
      : "bg-accent/15 text-accent-deep ring-accent/25";

  // In warn zone, show tenths so the kid sees urgency.
  const display = inWarn ? tenths.toFixed(1) : seconds.toString();

  return (
    <motion.span
      animate={{
        scale: inWarn ? [1, 1.06, 1] : 1,
      }}
      transition={
        inWarn
          ? { repeat: Infinity, duration: 0.55, ease: "easeInOut" }
          : { duration: 0.15 }
      }
      className={`flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 ring-1 tabular-nums ${tone}`}
    >
      <Clock size={18} weight="duotone" />
      <span className="text-xl font-bold leading-none">{display}</span>
      <span className="text-xs font-semibold opacity-70">s</span>
    </motion.span>
  );
}
