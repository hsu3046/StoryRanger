"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { itemIcon, prettyItem } from "@/data/items";

interface Props {
  /** Batch of item ids received on scene entry (null/empty → nothing). */
  items: string[] | null;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3800;

/** Group repeated ids into `{id, count}` for a tidy "×N" chip. */
function countItems(ids: string[]): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].map(([id, count]) => ({ id, count }));
}

/**
 * "Received" toast for items granted on scene entry. Sits just BELOW the
 * MedalToast (same top edge + an offset) so an item drop and a medal never
 * overlap when a scene grants both.
 */
export function ItemToast({ items, onDismiss }: Props) {
  const has = !!items && items.length > 0;
  useEffect(() => {
    if (!has) return;
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [has, items, onDismiss]);

  return (
    <AnimatePresence>
      {has && items && (
        <motion.button
          key={items.join("-")}
          type="button"
          aria-label="Items received. Tap to dismiss."
          onClick={onDismiss}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 280, damping: 22 }}
          className="pointer-events-auto fixed left-1/2 z-50 flex max-w-xs -translate-x-1/2 flex-col items-start gap-1 rounded-card bg-paper/95 px-3.5 py-2 shadow-button ring-1 ring-ink-soft/15 backdrop-blur"
          // Offset below the MedalToast (which sits at the very top) so the two
          // never collide when a scene grants both a medal and items.
          style={{ top: "calc(max(0.625rem, env(safe-area-inset-top)) + 3.75rem)" }}
        >
          <span className="font-handwritten text-sm text-accent-deep">
            Received
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {countItems(items).map(({ id, count }) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-pill bg-paper-deep/70 px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-ink-soft/15"
              >
                <span aria-hidden>{itemIcon(id)}</span>
                <span>{prettyItem(id)}</span>
                {count > 1 && <span className="text-ink-soft">×{count}</span>}
              </span>
            ))}
          </div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
