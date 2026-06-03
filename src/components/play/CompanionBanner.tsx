"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

/** A party change to announce — companion(s) joining or leaving. */
export interface CompanionEvent {
  kind: "join" | "leave";
  /** Display names of the companions involved (already resolved). */
  names: string[];
}

interface Props {
  event: CompanionEvent | null;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3800;

/**
 * "Joined / left the party" banner. Mirrors ItemToast (same spring entrance,
 * tap-to-dismiss, auto-dismiss) but sits one slot LOWER so a scene that grants
 * a medal + an item + a companion change stacks all three without overlap:
 * MedalToast (top) → ItemToast (+3.75rem) → CompanionBanner (+7rem).
 */
export function CompanionBanner({ event, onDismiss }: Props) {
  const has = !!event && event.names.length > 0;
  useEffect(() => {
    if (!has) return;
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [has, event, onDismiss]);

  const verb = event?.kind === "leave" ? "left the party" : "joined the party!";

  return (
    <AnimatePresence>
      {has && event && (
        <motion.button
          key={`${event.kind}-${event.names.join("-")}`}
          type="button"
          aria-label="Party changed. Tap to dismiss."
          onClick={onDismiss}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 280, damping: 22 }}
          className="pointer-events-auto fixed left-1/2 z-50 flex max-w-xs -translate-x-1/2 items-center gap-1.5 rounded-card bg-paper/95 px-3.5 py-2 shadow-button ring-1 ring-ink-soft/15 backdrop-blur"
          // One slot below the ItemToast (+3.75rem) so medal/item/companion
          // banners never collide when a single scene grants all three.
          style={{ top: "calc(max(0.625rem, env(safe-area-inset-top)) + 7rem)" }}
        >
          <span aria-hidden className="text-base">
            {event.kind === "leave" ? "👋" : "🎉"}
          </span>
          <span className="text-sm font-semibold text-ink">
            {event.names.join(", ")} {verb}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
