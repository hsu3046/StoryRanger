"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Clock } from "@phosphor-icons/react";

import type { Challenge } from "@/lib/education";
import { ChallengeVisualView } from "./ChallengeVisualView";

interface Props {
  /** The pre-generated challenge to present. */
  challenge: Challenge;
  /** Fired after the player picks (or times out) AND the feedback flash plays. */
  onSolved: (correct: boolean, durationMs: number) => void;
  /** Fired the INSTANT an answer is locked in (before the feedback flash +
   *  before `onSolved`). Lets a parent block "close" during the commit window
   *  so it can't read stale state mid-answer. Optional — battle/gate omit it. */
  onAnswered?: () => void;
  /** "gate" = branch gate (no timer/monster). "attack"/"defend" = battle. */
  mode?: "attack" | "defend" | "gate";
  /** Battle uses a 10s countdown; the gate does not. */
  withTimer?: boolean;
  /** Monster name (battle header). */
  targetName?: string;
  /** Who is solving (battle attack header). */
  attackerLabel?: string;
  /** Consecutive-correct streak (battle UI cue). */
  streak?: number;
  /** Multi-problem gate progress (e.g. {current:2,total:3}). */
  progress?: { current: number; total: number };
  /** "fixed" (default) self-centers as a full-screen overlay card. "inline"
   *  drops the fixed positioning so a parent can stack the card in normal flow
   *  (e.g. the admin previewer placing a button right beneath it). */
  placement?: "fixed" | "inline";
}

const HARD_TIMEOUT_MS = 10_000;
const CRIT_WINDOW_MS = 3_000;
/** How long the correct/wrong feedback shows before the result is committed. */
const FEEDBACK_MS = 850;

export function EducationalChallenge({
  challenge,
  onSolved,
  onAnswered,
  mode = "gate",
  withTimer = false,
  targetName,
  attackerLabel,
  streak = 0,
  progress,
  placement = "fixed",
}: Props) {
  const startRef = useRef<number>(0);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  /** null = unanswered, true = correct, false = wrong/timeout. */
  const [result, setResult] = useState<boolean | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Latch the latest onSolved so the timer effect needn't depend on it
  // (parents pass an inline fn; a dep would restart the interval + rewind the
  // countdown). `resolvedRef` guarantees onSolved fires exactly once.
  const onSolvedRef = useRef(onSolved);
  const resolvedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    onSolvedRef.current = onSolved;
  }, [onSolved]);

  /** Show the correct/wrong feedback, then commit the result once. */
  function resolve(correct: boolean, picked: number, ms: number) {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onAnswered?.(); // synchronous — before the feedback flash commits the result
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPickedIdx(picked);
    setResult(correct);
    setTimeout(() => onSolvedRef.current(correct, ms), FEEDBACK_MS);
  }

  // Start clock on mount. With a timer, tick + auto-fail on timeout.
  useEffect(() => {
    startRef.current = Date.now();
    if (!withTimer) return;
    intervalRef.current = setInterval(() => {
      if (resolvedRef.current) return;
      const ms = Date.now() - startRef.current;
      setElapsedMs(ms);
      if (ms >= HARD_TIMEOUT_MS) resolve(false, -1, ms);
    }, 100);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [withTimer]);

  function pick(i: number) {
    if (resolvedRef.current) return;
    // eslint-disable-next-line react-hooks/purity -- event handler: Date.now() is fine
    const ms = Date.now() - startRef.current;
    resolve(i === challenge.correctIndex, i, ms);
  }

  const remainingMs = Math.max(0, HARD_TIMEOUT_MS - elapsedMs);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const remainingTenths = Math.max(0, Math.ceil(remainingMs / 100) / 10);
  // `>=` keeps the green crit window inclusive at the boundary, matching the
  // engine's `durationMs <= CRIT_WINDOW_MS` (else the bar dims one 100ms tick
  // before the crit actually expires).
  const inCrit = remainingMs >= HARD_TIMEOUT_MS - CRIT_WINDOW_MS;
  const inWarn = remainingMs <= 5_000;
  const timerPct = remainingMs / HARD_TIMEOUT_MS;

  const visual = challenge.visual;
  const answered = result !== null;

  /** Per-choice visual state once answered: reveal the correct one, mark the
   *  wrong pick, dim the rest. */
  function choiceTone(i: number): string {
    if (!answered)
      return "bg-paper-deep/60 text-ink ring-ink-soft/15 hover:bg-paper-deep hover:ring-accent/40 active:scale-95";
    if (i === challenge.correctIndex)
      return "bg-emerald/25 text-emerald ring-emerald/50";
    if (i === pickedIdx) return "bg-ruby/20 text-ruby ring-ruby/50";
    return "bg-paper-deep/40 text-ink-soft/50 ring-ink-soft/10";
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{
        opacity: 1,
        scale: 1,
        // Shake on a wrong answer; a gentle pop on a correct one.
        x: result === false ? [0, -10, 10, -7, 7, 0] : 0,
      }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{
        x: { duration: 0.45 },
        default: { type: "spring", stiffness: 260, damping: 22 },
      }}
      className={`pointer-events-auto flex w-[calc(100%-2rem)] max-w-2xl flex-col gap-5 rounded-card-lg bg-paper/90 p-6 shadow-overlay ring-2 backdrop-blur transition-colors sm:p-8 ${
        placement === "inline"
          ? "relative"
          : "fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2"
      } ${
        result === true
          ? "ring-emerald/60"
          : result === false
            ? "ring-ruby/60"
            : "ring-ink-soft/10"
      }`}
    >
      <header className="flex items-center justify-between gap-3">
        <p className="font-handwritten text-2xl text-accent-deep sm:text-3xl">
          {mode === "defend" ? (
            <>
              Defend!{" "}
              <span className="font-semibold text-ink">{targetName}</span>
            </>
          ) : mode === "attack" ? (
            attackerLabel ? (
              <>
                {attackerLabel} attacks{" "}
                <span className="font-semibold text-ink">{targetName}</span>
              </>
            ) : (
              <>
                Solve to attack{" "}
                <span className="font-semibold text-ink">{targetName}</span>
              </>
            )
          ) : (
            "Solve to continue!"
          )}
        </p>
        <div className="flex items-center gap-2.5">
          {mode === "gate" && progress && (
            <span className="rounded-pill bg-accent/15 px-3 py-1 text-sm font-semibold tabular-nums text-accent-deep">
              {progress.current} / {progress.total}
            </span>
          )}
          {withTimer && (
            <>
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
            </>
          )}
        </div>
      </header>

      {withTimer && (
        <div className="relative h-2 overflow-hidden rounded-pill bg-ink-soft/10">
          <motion.div
            aria-hidden
            animate={{ width: `${timerPct * 100}%` }}
            transition={{ ease: "linear", duration: 0.1 }}
            className={`absolute left-0 top-0 h-full rounded-pill ${
              inCrit ? "bg-emerald" : inWarn ? "bg-ruby" : "bg-accent"
            }`}
          />
        </div>
      )}

      {/* Optional visual — counting glyphs, an SVG shape, or a fraction bar. */}
      {visual && (
        <div className="flex items-center justify-center py-2">
          <ChallengeVisualView visual={visual} size="lg" />
        </div>
      )}

      {/* Prompt */}
      <div className="flex flex-col items-center gap-2 py-2">
        <p className="text-balance text-center text-xl font-semibold tabular-nums text-ink sm:text-2xl">
          {challenge.prompt}
        </p>
      </div>

      {/* Choices */}
      <div
        className={`grid gap-3 sm:gap-4 ${
          challenge.choices.length <= 3
            ? "grid-cols-3"
            : "grid-cols-2 sm:grid-cols-4"
        }`}
      >
        {challenge.choices.map((c, i) => (
          <motion.button
            key={`${c}-${i}`}
            type="button"
            disabled={answered}
            onClick={() => pick(i)}
            animate={
              answered && i === challenge.correctIndex
                ? { scale: [1, 1.08, 1] }
                : {}
            }
            transition={{ duration: 0.35 }}
            className={`flex h-20 items-center justify-center rounded-card-lg text-2xl font-bold tabular-nums ring-1 transition-all disabled:cursor-default ${choiceTone(
              i,
            )}`}
          >
            {c}
          </motion.button>
        ))}
      </div>

      {/* Result banner */}
      {answered && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center justify-center gap-1.5 text-lg font-bold ${
            result ? "text-emerald" : "text-ruby"
          }`}
        >
          {result ? "✓ Correct!" : "✗ Not quite"}
        </motion.div>
      )}
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
  const tone = inCrit
    ? "bg-emerald/20 text-emerald ring-emerald/30"
    : inWarn
      ? "bg-ruby/15 text-ruby ring-ruby/30"
      : "bg-accent/15 text-accent-deep ring-accent/25";
  const display = inWarn ? tenths.toFixed(1) : seconds.toString();

  return (
    <motion.span
      animate={{ scale: inWarn ? [1, 1.06, 1] : 1 }}
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
