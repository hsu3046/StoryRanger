"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Backpack, Trophy, X } from "@phosphor-icons/react";
import type { MedalsFile } from "@/types/story";
import { itemIcon, prettyItem } from "@/data/items";
import { MedalShelf } from "./MedalShelf";

interface Props {
  open: boolean;
  catalog: MedalsFile;
  earned: string[];
  inventory: string[];
  onClose: () => void;
}

/**
 * "Treasures" modal — both the loot bag (items) and the medal shelf
 * (achievements) live here. Items get top billing since they're the more
 * tangible reward; medals follow below as long-term collectibles.
 */
export function MedalShelfModal({
  open,
  catalog,
  earned,
  inventory,
  onClose,
}: Props) {
  const itemCounts = countItems(inventory);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            key="treasures-backdrop"
            type="button"
            aria-label="Close treasures"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] cursor-pointer bg-ink/25 backdrop-blur-sm"
          />
          <motion.div
            key="treasures-card"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
            className="pointer-events-auto fixed left-1/2 top-1/2 z-[100] flex max-h-[88dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden rounded-card-lg bg-paper/95 p-5 shadow-overlay ring-1 ring-ink-soft/10 backdrop-blur"
          >
            <header className="flex items-center justify-between gap-3">
              <p className="font-handwritten text-xl text-accent-deep">
                Your Collections
              </p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-pill bg-paper-deep/60 text-ink-soft ring-1 ring-ink-soft/10 transition-colors hover:bg-paper-deep hover:text-ink active:scale-90"
              >
                <X size={16} weight="bold" />
              </button>
            </header>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-1">
              {/* Items section */}
              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 font-handwritten text-base text-accent-deep">
                  <Backpack size={18} weight="duotone" />
                  Items in your bag
                </h3>
                {itemCounts.length === 0 ? (
                  <p className="rounded-card bg-paper-deep/40 px-4 py-5 text-center text-sm text-ink-soft/70">
                    Your bag is empty — adventure on to find treasures.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {itemCounts.map(({ id, count }) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 rounded-pill bg-paper-deep/70 px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-ink-soft/10"
                      >
                        <span className="text-base leading-none" aria-hidden>
                          {itemIcon(id)}
                        </span>
                        <span>{prettyItem(id)}</span>
                        {count > 1 && (
                          <span className="rounded-pill bg-accent/20 px-1.5 text-xs text-accent-deep">
                            ×{count}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              {/* Medals section */}
              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 font-handwritten text-base text-accent-deep">
                  <Trophy size={18} weight="duotone" />
                  Medals
                </h3>
                <MedalShelf catalog={catalog} earned={earned} />
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function countItems(items: string[]): Array<{ id: string; count: number }> {
  const map = new Map<string, number>();
  for (const it of items) map.set(it, (map.get(it) ?? 0) + 1);
  return Array.from(map.entries()).map(([id, count]) => ({ id, count }));
}

