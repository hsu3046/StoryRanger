"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, X } from "@phosphor-icons/react";

import { assetUrl } from "@/lib/asset-paths";

interface HeartsProps {
  lives: number;
  maxLives: number;
}

/** Player health as a row of hearts (simple, kid-friendly). Used in
 *  cinematic terminal panels, not the live battle HUD. */
export function HeartsBar({ lives, maxLives }: HeartsProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-pill bg-paper/85 px-3 py-1.5 ring-1 ring-ink-soft/10 backdrop-blur">
      {Array.from({ length: maxLives }).map((_, i) => {
        const lit = i < lives;
        return (
          <Heart
            key={i}
            size={20}
            weight={lit ? "fill" : "regular"}
            className={lit ? "text-ruby" : "text-ink-soft/30"}
          />
        );
      })}
    </div>
  );
}

interface HitsProps {
  label: string;
  hitsRemaining: number;
  maxHits: number;
  /** When defeated, fade the whole pill to match the sprite. */
  defeated?: boolean;
  /** Portrait base path (no extension). Renders a 32px circle to the
   *  left of the label so the monster chip matches PartyHpRow's layout. */
  portraitBase?: string;
}

const IMAGE_EXTS = [".webp", ".png", ".jpeg", ".jpg"];

/**
 * Monster status chip. Mirrors the PartyHpRow visual: small circular
 * portrait + stacked (name + HP dots) on the right.
 */
export function HitsBar({
  label,
  hitsRemaining,
  maxHits,
  defeated,
  portraitBase,
}: HitsProps) {
  return (
    <div
      className={`flex h-11 items-center gap-1.5 rounded-pill bg-paper/85 px-1.5 ring-1 ring-ink-soft/10 backdrop-blur transition-opacity duration-300 short:h-9 ${
        defeated ? "opacity-30 grayscale" : "opacity-100"
      }`}
    >
      {portraitBase && (
        <span className="relative">
          <Portrait base={portraitBase} alt={label} />
          {defeated && (
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center text-ruby"
            >
              <X size={20} weight="bold" />
            </span>
          )}
        </span>
      )}
      <span className="flex flex-col items-start gap-0.5 pr-1.5">
        <span className="text-xs font-semibold leading-none text-ink">
          {label}
        </span>
        {!defeated && (
          <span className="flex items-center gap-0.5">
            <AnimatePresence>
              {Array.from({ length: maxHits }).map((_, i) => {
                const alive = i < hitsRemaining;
                return (
                  <motion.span
                    key={i}
                    initial={false}
                    animate={{
                      scale: alive ? 1 : 0.7,
                      opacity: alive ? 1 : 0.3,
                    }}
                    transition={{ type: "spring", stiffness: 240, damping: 18 }}
                    className={`block h-1.5 w-1.5 rounded-full ${
                      alive ? "bg-ruby" : "bg-ink-soft/25"
                    }`}
                  />
                );
              })}
            </AnimatePresence>
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Small circular portrait with extension fallback (webp → png → jpeg → jpg).
 * Hidden when no image is found so the chip degrades gracefully.
 */
function Portrait({ base, alt }: { base: string; alt: string }) {
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const list = useMemo(() => IMAGE_EXTS.map((e) => base + e), [base]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on path change
    setIdx(0);
    setFailed(false);
  }, [base]);

  if (failed) return null;
  return (
    // Wrapper keeps the 32px circular frame; the inner image renders at
    // ~80% with `object-contain` so trimmed monster sprites don't get
    // clipped by the circle.
    <span className="block h-8 w-8 overflow-hidden rounded-full short:h-6 short:w-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- extension fallback */}
      <img
        src={assetUrl(list[idx])}
        alt={alt}
        draggable={false}
        className="block h-full w-full object-contain p-[10%]"
        onError={() => {
          if (idx + 1 < list.length) setIdx(idx + 1);
          else setFailed(true);
        }}
      />
    </span>
  );
}
