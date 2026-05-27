"use client";

import { motion } from "framer-motion";

import type { StagePosition } from "../scene/ComposedScene";

const POS_X: Record<StagePosition, number> = {
  "far-left": 12,
  left: 22,
  "left-center": 35,
  center: 50,
  "right-center": 65,
  right: 78,
  "far-right": 88,
};

export type EffectKind = "hit" | "crit" | "miss" | "heal" | "defend";

export interface FloatingEffect {
  id: number;
  /** Where the effect emerges from on the canvas. */
  anchor: StagePosition;
  /** Verticalish anchor — true if the target is airborne (lifts the popup up). */
  airborne?: boolean;
  amount?: number;
  kind: EffectKind;
}

interface Props {
  effect: FloatingEffect;
}

/**
 * Floating combat number/text that springs up over the target and fades.
 */
export function DamageNumber({ effect }: Props) {
  const x = POS_X[effect.anchor];
  const bottomBase = effect.airborne ? 50 : 25;
  const palette = palettes[effect.kind];

  const label =
    effect.kind === "miss"
      ? "MISS"
      : effect.kind === "defend"
        ? "DODGE!"
        : effect.kind === "heal"
          ? `+${effect.amount ?? 1}`
          : `−${effect.amount ?? 1}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.5 }}
      animate={{ opacity: [0, 1, 1, 0], y: -80, scale: 1.25 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.4, times: [0, 0.15, 0.7, 1], ease: "easeOut" }}
      className="pointer-events-none absolute z-30 flex -translate-x-1/2 flex-col items-center select-none font-extrabold tabular-nums"
      style={{
        left: `${x}%`,
        bottom: `${bottomBase}%`,
        color: palette.color,
        textShadow: palette.shadow,
        WebkitTextStroke: palette.stroke,
        paintOrder: "stroke fill",
      }}
    >
      {effect.kind === "crit" && (
        <motion.span
          initial={{ scale: 0.6, rotate: -6 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 14 }}
          className="font-handwritten leading-none"
          style={{ fontSize: "2rem", color: "#fff15a" }}
        >
          Critical!
        </motion.span>
      )}
      <span
        style={{
          fontSize: effect.kind === "crit" ? "3.5rem" : "2.5rem",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </motion.div>
  );
}

const palettes: Record<EffectKind, { color: string; shadow: string; stroke: string }> = {
  hit: {
    color: "#ffd24a",
    shadow:
      "0 4px 12px rgba(20,12,4,0.85), 0 2px 4px rgba(20,12,4,0.95)",
    stroke: "3px rgba(176, 51, 51, 0.95)",
  },
  crit: {
    color: "#fff15a",
    shadow:
      "0 4px 14px rgba(20,12,4,0.95), 0 2px 6px rgba(20,12,4,1)",
    stroke: "4px rgba(176, 51, 51, 1)",
  },
  miss: {
    color: "#fdf6e3",
    shadow: "0 4px 10px rgba(20,12,4,0.85), 0 2px 3px rgba(20,12,4,0.95)",
    stroke: "2.5px rgba(91, 65, 40, 0.85)",
  },
  defend: {
    color: "#bfe3ff",
    shadow:
      "0 4px 12px rgba(20,12,4,0.85), 0 2px 4px rgba(20,12,4,0.95)",
    stroke: "3px rgba(46, 92, 138, 0.95)",
  },
  heal: {
    color: "#a3eaa3",
    shadow: "0 4px 10px rgba(20,12,4,0.85)",
    stroke: "2.5px rgba(47,143,90,0.95)",
  },
};
