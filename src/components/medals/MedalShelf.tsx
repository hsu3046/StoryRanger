"use client";

import { motion } from "framer-motion";
import type { MedalsFile } from "@/types/story";

interface Props {
  catalog: MedalsFile;
  earned: string[];
}

export function MedalShelf({ catalog, earned }: Props) {
  const earnedSet = new Set(earned);
  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
      {catalog.medals.map((m, i) => {
        const got = earnedSet.has(m.id);
        return (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 220,
              damping: 20,
              delay: i * 0.02,
            }}
            className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-card p-2 text-center transition-all ${
              got
                ? "bg-paper-deep/60 ring-1 ring-accent/30"
                : "bg-paper-deep/25 opacity-60"
            }`}
          >
            <span
              className={`text-3xl leading-none transition-all ${got ? "" : "grayscale opacity-50"}`}
              aria-hidden
            >
              {got ? m.icon : "🔒"}
            </span>
            <span
              className={`line-clamp-2 text-[11px] font-semibold leading-tight ${
                got ? "text-ink" : "text-ink-soft/50"
              }`}
            >
              {got ? m.name : "Locked"}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
