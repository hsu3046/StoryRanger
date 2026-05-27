"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "@phosphor-icons/react";

interface HeartsProps {
  lives: number;
  maxLives: number;
}

/** Player health as a row of hearts (simple, kid-friendly). */
export function HeartsBar({ lives, maxLives }: HeartsProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-pill bg-paper/85 px-3 py-1.5 ring-1 ring-ink-soft/10 backdrop-blur">
      {Array.from({ length: maxLives }).map((_, i) => {
        const lit = i < lives;
        return (
          <Heart
            key={i}
            size={20}
            weight={lit ? "fill" : "regular"}
            className={lit ? "text-ruby" : "text-ink-soft/30"}
          />
        );
      })}
    </div>
  );
}

interface HitsProps {
  label: string;
  hitsRemaining: number;
  maxHits: number;
  /** When defeated, fade the whole pill to match the sprite. */
  defeated?: boolean;
}

/** Monster health as small pips: ●●○ (filled = remaining). */
export function HitsBar({ label, hitsRemaining, maxHits, defeated }: HitsProps) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-pill bg-paper/85 px-2.5 py-1 ring-1 ring-ink-soft/10 backdrop-blur transition-opacity duration-300 ${
        defeated ? "opacity-30 grayscale" : "opacity-100"
      }`}
    >
      <span className="text-xs font-semibold text-ink">{label}</span>
      <div className="flex items-center gap-0.5">
        <AnimatePresence>
          {Array.from({ length: maxHits }).map((_, i) => {
            const alive = i < hitsRemaining;
            return (
              <motion.span
                key={i}
                initial={false}
                animate={{
                  scale: alive ? 1 : 0.7,
                  opacity: alive ? 1 : 0.25,
                }}
                transition={{ type: "spring", stiffness: 240, damping: 18 }}
                className={`block h-2 w-2 rounded-full ${
                  alive ? "bg-ruby" : "bg-ink-soft/20"
                }`}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
