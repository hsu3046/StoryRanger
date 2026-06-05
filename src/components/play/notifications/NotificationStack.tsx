"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { itemIcon, prettyItem } from "@/data/items";
import type { Notif, NotifChip, NotifKind } from "./types";

const DEFAULT_DURATION_MS = 3800;

// Visual priority — the stack always renders medal → item → companion
// top-to-bottom, regardless of enqueue order. Items are pushed LATER (on scene
// arrival) than the medal/companion pushed at branch-commit, so insertion order
// alone would misorder them (and a companion recruited alongside a medal would
// sit above it). A stable sort by this priority restores the intended order.
const KIND_ORDER: Record<NotifKind, number> = {
  medal: 0,
  item: 1,
  companion: 2,
  hint: 3,
};

/** Build the "icon + name ×N" chips for an item notification from raw ids. */
export function itemChips(storyId: string, ids: string[]): NotifChip[] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].map(([id, count]) => ({
    icon: itemIcon(storyId, id),
    label: prettyItem(storyId, id),
    count,
  }));
}

// Shared entrance/exit — identical to the three former toasts (preserved
// verbatim so the look doesn't regress).
const cardMotion = {
  initial: { opacity: 0, y: -16, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -12, scale: 0.97 },
  transition: { type: "spring" as const, stiffness: 280, damping: 22 },
};

const SHELL =
  "pointer-events-auto flex max-w-xs bg-paper/95 px-3.5 py-2 shadow-button ring-1 backdrop-blur";

function NotificationCard({
  notif,
  onDismiss,
}: {
  notif: Notif;
  /** Stable dispatcher (useNotifications.dismiss) — keyed by id, so the
   *  auto-dismiss timer below is set once per card and never reset. */
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const t = setTimeout(
      () => onDismiss(notif.id),
      notif.durationMs ?? DEFAULT_DURATION_MS,
    );
    return () => clearTimeout(t);
  }, [notif.id, notif.durationMs, onDismiss]);

  // Hint variant (tutorial tip) — icon + handwritten "Tip!" eyebrow + one line.
  // Soft accent ring so it reads as friendly guidance, not a reward.
  if (notif.kind === "hint") {
    return (
      <motion.button
        {...cardMotion}
        type="button"
        aria-label="Tip. Tap to dismiss."
        onClick={() => onDismiss(notif.id)}
        className={`${SHELL} items-center gap-2.5 rounded-card ring-accent/25`}
      >
        {notif.icon && (
          <span className="text-xl leading-none" aria-hidden>
            {notif.icon}
          </span>
        )}
        <span className="flex flex-col items-start text-left leading-tight">
          {notif.eyebrow && (
            <span className="font-handwritten text-sm text-accent-deep">
              {notif.eyebrow}
            </span>
          )}
          {notif.title && (
            <span className="text-sm font-medium text-ink">{notif.title}</span>
          )}
        </span>
      </motion.button>
    );
  }

  // Item variant — eyebrow + a row of "×N" chips.
  if (notif.chips) {
    return (
      <motion.button
        {...cardMotion}
        type="button"
        aria-label="Items received. Tap to dismiss."
        onClick={() => onDismiss(notif.id)}
        className={`${SHELL} flex-col items-start gap-1 rounded-card ring-ink-soft/15`}
      >
        {notif.eyebrow && (
          <span className="font-handwritten text-sm text-accent-deep">
            {notif.eyebrow}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {notif.chips.map((c, i) => (
            <span
              key={`${c.label}-${i}`}
              className="inline-flex items-center gap-1 rounded-pill bg-paper-deep/70 px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-ink-soft/15"
            >
              {c.icon && <span aria-hidden>{c.icon}</span>}
              <span>{c.label}</span>
              {c.count != null && c.count > 1 && (
                <span className="text-ink-soft">×{c.count}</span>
              )}
            </span>
          ))}
        </div>
      </motion.button>
    );
  }

  // Medal variant — big icon + eyebrow + title, celebratory pill + accent ring.
  if (notif.accent === "accent") {
    return (
      <motion.button
        {...cardMotion}
        type="button"
        aria-label={`New medal: ${notif.title}. Tap to dismiss.`}
        onClick={() => onDismiss(notif.id)}
        className={`${SHELL} items-center gap-2.5 rounded-pill ring-accent/30`}
      >
        {notif.icon && (
          <span className="text-2xl leading-none" aria-hidden>
            {notif.icon}
          </span>
        )}
        <span className="flex flex-col items-start text-left leading-tight">
          {notif.eyebrow && (
            <span className="font-handwritten text-sm text-accent-deep">
              {notif.eyebrow}
            </span>
          )}
          {notif.title && (
            <span className="text-sm font-semibold text-ink">
              {notif.title}
            </span>
          )}
        </span>
      </motion.button>
    );
  }

  // Neutral variant (companion) — icon + single line.
  return (
    <motion.button
      {...cardMotion}
      type="button"
      aria-label="Party changed. Tap to dismiss."
      onClick={() => onDismiss(notif.id)}
      className={`${SHELL} items-center gap-1.5 rounded-card ring-ink-soft/15`}
    >
      {notif.icon && (
        <span className="text-base" aria-hidden>
          {notif.icon}
        </span>
      )}
      {notif.title && (
        <span className="text-sm font-semibold text-ink">{notif.title}</span>
      )}
    </motion.button>
  );
}

/**
 * Single top-center notification stack for medal / item / companion toasts.
 * Replaces the three former components + their hardcoded vertical offsets
 * (0 / +3.75rem / +7rem): notifications flow down ONE flex column (gap-2) so
 * they auto-stack with no overlap and reflow up when one dismisses (no more
 * empty-slot gap for a lone companion). The container is pointer-events-none
 * so taps fall through the gaps to the scene; each card is pointer-events-auto
 * so tapping a card dismisses it.
 */
export function NotificationStack({
  queue,
  onDismiss,
  max = 4,
}: {
  queue: Notif[];
  onDismiss: (id: string) => void;
  max?: number;
}) {
  return (
    <div
      aria-live="polite"
      // z-[65] keeps toasts above the battle (z-50), challenge gate (z-[55])
      // and in-gate problem card (z-[60]) overlays so a tutorial tip enqueued
      // for the first encounter/challenge isn't hidden under the gate and lost
      // to its auto-dismiss timer. Still below modals (Settings z-[80],
      // Treasures z-100), which legitimately cover toasts.
      className="pointer-events-none fixed left-1/2 z-[65] flex w-full max-w-xs -translate-x-1/2 flex-col items-center gap-2"
      style={{ top: "max(0.625rem, env(safe-area-inset-top))" }}
    >
      <AnimatePresence initial={false}>
        {/* Stable sort (Array.sort is stable) → medal → item → companion,
            preserving insertion order within a kind (e.g. multiple medals). */}
        {[...queue]
          .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
          .slice(0, max)
          .map((n) => (
            <NotificationCard key={n.id} notif={n} onDismiss={onDismiss} />
          ))}
      </AnimatePresence>
    </div>
  );
}
