"use client";

import { motion } from "framer-motion";
import { Heart } from "@phosphor-icons/react";
import type { CompanionId, CompanionMoods } from "@/types/story";

interface Props {
  companions: CompanionId[];
  moods: CompanionMoods;
  imageBase: (id: CompanionId) => string;
  characterColor: (id: CompanionId) => string;
  characterName: (id: CompanionId) => string;
  onTalk: (id: CompanionId) => void;
}

const IMAGE_EXTS = [".png", ".webp", ".jpg", ".jpeg"];

/**
 * Floating left-edge column of companion portrait chips. Tap a chip to
 * open a dialogue with that companion.
 */
export function CompanionRail({
  companions,
  moods,
  imageBase,
  characterColor,
  characterName,
  onTalk,
}: Props) {
  if (companions.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed left-0 z-30 flex flex-col items-start gap-2 px-3 sm:px-4"
      style={{
        top: "max(4.5rem, calc(env(safe-area-inset-top) + 4rem))",
      }}
    >
      {companions.map((id, i) => {
        const mood = moods[id] ?? 5;
        const color = characterColor(id);
        return (
          <motion.button
            key={id}
            type="button"
            onClick={() => onTalk(id)}
            aria-label={`Talk to ${characterName(id)}`}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              type: "spring",
              stiffness: 280,
              damping: 22,
              delay: i * 0.05,
            }}
            className="pointer-events-auto flex items-center gap-2 rounded-pill bg-paper/85 py-1.5 pl-1.5 pr-3 ring-1 ring-ink-soft/10 shadow-button backdrop-blur transition-all hover:bg-paper hover:ring-accent/40 hover:-translate-y-px active:scale-95"
          >
            <CompanionAvatar
              imageBase={imageBase(id)}
              fallbackInitial={characterName(id).charAt(0)}
              ring={color}
            />
            <span className="flex items-center gap-1 text-sm">
              <Heart size={14} weight="fill" className="text-ruby" />
              <span className="font-semibold tabular-nums text-ink">
                {mood}
              </span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

function CompanionAvatar({
  imageBase,
  fallbackInitial,
  ring,
}: {
  imageBase: string;
  fallbackInitial: string;
  ring: string;
}) {
  // For the rail we just try the first available extension at render time.
  // If it 404s we silently show the fallback initial.
  return (
    <div
      className="flex h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2"
      style={{ borderColor: ring, backgroundColor: `${ring}22`, boxShadow: "none" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageBase + IMAGE_EXTS[0]}
        alt=""
        className="h-full w-full object-cover"
        onError={(e) => {
          // Try the other extensions inline (cheap, no state)
          const img = e.currentTarget;
          const currentSrc = img.src;
          for (const ext of IMAGE_EXTS) {
            const candidate = imageBase + ext;
            if (!currentSrc.endsWith(candidate.split("/").pop()!)) {
              img.src = candidate;
              return;
            }
          }
          // All failed: replace with initial
          img.style.display = "none";
          const sibling = img.parentElement!.querySelector("[data-fallback]");
          if (sibling instanceof HTMLElement) sibling.style.display = "flex";
        }}
      />
      <span
        data-fallback
        className="m-auto hidden font-handwritten text-base"
        style={{ color: ring }}
      >
        {fallbackInitial}
      </span>
    </div>
  );
}
