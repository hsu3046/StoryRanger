"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import type { RollResult } from "@/lib/dice";

interface Props {
  show: boolean;
  result?: RollResult | null;
  /** Show the bonus + total breakdown. */
  showBreakdown?: boolean;
}

/**
 * Compact d20 roll display. While `show` is true with no result, shows
 * a spinning numeric flicker. When `result` lands, snaps to the final
 * value with a critical / fumble color cue.
 */
export function DiceRoll({ show, result, showBreakdown = true }: Props) {
  const [flicker, setFlicker] = useState(1);

  useEffect(() => {
    if (!show || result) return;
    const id = setInterval(() => {
      setFlicker(Math.floor(Math.random() * 20) + 1);
    }, 70);
    return () => clearInterval(id);
  }, [show, result]);

  const value = result?.roll ?? flicker;
  const tone = result?.critical
    ? "bg-emerald text-paper ring-emerald"
    : result?.fumble
      ? "bg-ruby text-paper ring-ruby"
      : "bg-paper text-ink ring-ink-soft/20";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ type: "spring", stiffness: 320, damping: 22 }}
          className="flex items-center gap-3"
        >
          <motion.div
            key={result ? `final-${result.roll}` : "rolling"}
            initial={result ? { scale: 1.3 } : { scale: 1 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 360, damping: 16 }}
            className={`flex h-16 w-16 items-center justify-center rounded-card-lg ring-2 shadow-card font-bold text-2xl tabular-nums ${tone}`}
            style={{
              clipPath:
                "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)",
            }}
          >
            {value}
          </motion.div>
          {showBreakdown && result && (
            <div className="flex flex-col text-paper">
              <span className="text-sm text-paper/70">d20</span>
              <span className="text-xl font-semibold tabular-nums">
                {result.roll}
                {result.bonus !== 0 && (
                  <span className="text-paper/80">
                    {result.bonus > 0 ? " + " : " − "}
                    {Math.abs(result.bonus)}
                  </span>
                )}
                <span className="text-paper/80"> = {result.total}</span>
              </span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
