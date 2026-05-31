"use client";

import { motion } from "framer-motion";

/**
 * A single storybook narration line shown centered over the dimmed/blurred
 * encounter veil — the intro beat ("Suddenly, the Wolf Pack appears!") and the
 * outro beat ("The way is clear again."). Gentle rise + fade so it reads as a
 * calm caption before/after the action, not a UI popup.
 */
export function EncounterCaption({ line }: { line: string }) {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-8"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <p className="max-w-xl text-balance text-center font-handwritten text-2xl leading-snug text-paper drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] sm:text-3xl">
        {line}
      </p>
    </motion.div>
  );
}
