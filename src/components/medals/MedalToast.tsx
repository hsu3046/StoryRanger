"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import type { Medal } from "@/types/story";

interface Props {
  medal: Medal | null;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3800;

export function MedalToast({ medal, onDismiss }: Props) {
  // Auto-dismiss so the toast never blocks the next encounter
  useEffect(() => {
    if (!medal) return;
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [medal, onDismiss]);

  return (
    <AnimatePresence>
      {medal && (
        <motion.button
          key={medal.id}
          type="button"
          aria-label={`New medal: ${medal.name}. Tap to dismiss.`}
          onClick={onDismiss}
          initial={{ opacity: 0, x: -16, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 280, damping: 22 }}
          className="pointer-events-auto fixed z-50 flex max-w-xs items-center gap-2.5 rounded-pill bg-paper/95 px-3.5 py-2 shadow-button ring-1 ring-accent/30 backdrop-blur"
          style={{
            top: "max(0.625rem, env(safe-area-inset-top))",
            left: "max(0.625rem, env(safe-area-inset-left))",
          }}
        >
          <span className="text-2xl leading-none" aria-hidden>
            {medal.icon}
          </span>
          <span className="flex flex-col items-start text-left leading-tight">
            <span className="font-handwritten text-sm text-accent-deep">
              New medal!
            </span>
            <span className="text-sm font-semibold text-ink">
              {medal.name}
            </span>
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
