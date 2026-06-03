"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Backpack, Trophy, X } from "@phosphor-icons/react";
import { useState } from "react";
import type { MedalsFile } from "@/types/story";
import { getItem, itemIcon, prettyItem } from "@/data/items";
import { MedalShelf } from "./MedalShelf";

interface Props {
  /** Story whose item catalog resolves names/icons. */
  storyId: string;
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
  storyId,
  open,
  catalog,
  earned,
  inventory,
  onClose,
}: Props) {
  const itemCounts = countItems(inventory);
  // Which item's description is expanded — tap a pill to toggle. One open at a
  // time; the panel renders once below the grid (not per-pill) to avoid shift.
  const [openId, setOpenId] = useState<string | null>(null);
  const openItem = openId ? getItem(storyId, openId) : null;
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
            <header className="relative flex items-center justify-center">
              <p className="font-handwritten text-xl text-accent-deep">
                Your Collections
              </p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-pill bg-paper-deep/60 text-ink-soft ring-1 ring-ink-soft/10 transition-colors hover:bg-paper-deep hover:text-ink active:scale-90"
              >
                <X size={16} weight="bold" />
              </button>
            </header>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-1">
              {/* Items section */}
              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 font-handwritten text-base text-accent-deep">
                  <Backpack size={18} weight="duotone" />
                  Items
                </h3>
                {itemCounts.length === 0 ? (
                  <p className="rounded-card bg-paper-deep/40 px-4 py-5 text-center text-sm text-ink-soft/70">
                    No items yet
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {itemCounts.map(({ id, count }) => {
                      const isOpen = openId === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setOpenId(isOpen ? null : id)}
                          aria-expanded={isOpen}
                          className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-semibold text-ink ring-1 transition-colors ${
                            isOpen
                              ? "bg-paper-deep ring-accent/40"
                              : "bg-paper-deep/70 ring-ink-soft/10 hover:bg-paper-deep"
                          }`}
                        >
                          <span className="text-base leading-none" aria-hidden>
                            {itemIcon(storyId, id)}
                          </span>
                          <span>{prettyItem(storyId, id)}</span>
                          {count > 1 && (
                            <span className="rounded-pill bg-accent/20 px-1.5 text-xs text-accent-deep">
                              ×{count > 99 ? "99+" : count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* Description of the tapped item — one panel below the grid
                    (keyed by openId) so expanding doesn't shift the pills. Tap
                    the same pill again to close. Description is authored in the
                    item catalog (always present). */}
                <AnimatePresence initial={false}>
                  {openItem && (
                    <motion.div
                      key={openItem.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-start gap-2 rounded-card bg-paper-deep/50 px-3 py-2 text-sm text-ink-soft ring-1 ring-ink-soft/10">
                        <span className="text-base leading-none" aria-hidden>
                          {itemIcon(storyId, openItem.id)}
                        </span>
                        <span>
                          <span className="font-semibold text-ink">
                            {prettyItem(storyId, openItem.id)}
                          </span>
                          {" — "}
                          {openItem.description}
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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

