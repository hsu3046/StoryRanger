"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

import type { CompanionId, SpeakerId } from "@/types/story";

export type StagePosition =
  | "far-left"
  | "left"
  | "left-center"
  | "center"
  | "right-center"
  | "right"
  | "far-right";

/**
 * Maps a discrete stage slot to a horizontal % anchor on the canvas.
 * Layer is anchored at its bottom center on this point.
 */
const POS_X: Record<StagePosition, number> = {
  "far-left": 12,
  left: 22,
  "left-center": 35,
  center: 50,
  "right-center": 65,
  right: 78,
  "far-right": 88,
};

export interface SceneLayer {
  /** image base path WITHOUT extension (composer tries multiple) */
  base: string;
  position: StagePosition;
  /** 0.4..1.4 — relative height of layer (1.0 = ~70% of parent height) */
  scale?: number;
  /** flip horizontally */
  flip?: boolean;
  /** layer stacking order (higher = on top). default by index. */
  z?: number;
  /** dimmed/defeated visual state */
  defeated?: boolean;
  /** flying / floating — lifts the layer off the ground. */
  airborne?: boolean;
  alt?: string;
  /** Brief lunge animation in this direction. */
  attacking?: "left" | "right";
  /** Damage-taken flash — sprite blinks red briefly (no positional shake). */
  hurting?: boolean;
  /** Successful dodge — sprite weaves side-to-side to avoid the blow. */
  dodging?: boolean;
}

export interface CharacterLayer extends SceneLayer {
  id: SpeakerId | CompanionId;
}

export interface MonsterLayer extends SceneLayer {
  monsterId: string;
}

interface Props {
  /** Owning story id — used to resolve per-story asset paths. */
  storyId: string;
  /** Background key — resolved to /stories/<storyId>/backgrounds/<bg>.* */
  bg: string;
  characters?: CharacterLayer[];
  monsters?: MonsterLayer[];
  /** subtle bottom gradient veil for legibility of UI on top */
  bottomVeil?: boolean;
}

/**
 * Stacks a background + character + monster layers into a single cinematic
 * 2.39:1 scene that fills its absolute-positioned parent.
 *
 * Parent must be `relative` (or absolute / fixed). Layers are
 * `absolute`-positioned within it.
 */
export function ComposedScene({
  storyId,
  bg,
  characters = [],
  monsters = [],
  bottomVeil = true,
}: Props) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <BackgroundLayer
        base={`/stories/${storyId}/backgrounds/${bg}`}
        alt={`Scene background: ${bg}`}
      />

      {bottomVeil && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-ink/45 via-ink/10 to-transparent" />
      )}

      {/* Characters underneath monsters by default (party in front when no
          monster, behind during battle if z says so). `scale` should always
          arrive from the size table (`sizeScale(characterSize(id))`); the
          defaults here are safety fallbacks only. */}
      {characters.map((c, i) => (
        <SpriteLayer
          key={`char-${c.id}-${i}`}
          layer={c}
          defaultScale={0.6}
          defaultZ={5 + i}
          fallbackInitial={typeof c.id === "string" ? c.id.charAt(0).toUpperCase() : "?"}
        />
      ))}

      {monsters.map((m, i) => (
        <SpriteLayer
          key={`mon-${m.monsterId}-${i}`}
          layer={m}
          defaultScale={0.6}
          defaultZ={3 + i}
          fallbackInitial="?"
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────

const EXTS = [".webp", ".png", ".jpg", ".jpeg"];

function getCandidates(base: string): string[] {
  return EXTS.map((ext) => base + ext);
}

function BackgroundLayer({ base, alt }: { base: string; alt: string }) {
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const candidates = getCandidates(base);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on base change
    setIdx(0);
    setFailed(false);
  }, [base]);

  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-paper-deep/40 to-accent/15 text-center text-ink-soft/50">
        <span className="font-handwritten text-2xl">{alt}</span>
      </div>
    );
  }

  return (
    <Image
      key={candidates[idx]}
      src={candidates[idx]}
      alt={alt}
      fill
      priority
      sizes="100vw"
      quality={82}
      className="object-cover object-center"
      onError={() => {
        if (idx + 1 < candidates.length) setIdx(idx + 1);
        else setFailed(true);
      }}
    />
  );
}

function SpriteLayer({
  layer,
  defaultScale,
  defaultZ,
  fallbackInitial,
}: {
  layer: SceneLayer;
  defaultScale: number;
  defaultZ: number;
  fallbackInitial: string;
}) {
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  /**
   * Natural aspect ratio of the loaded image (width / height). Measured on
   * `onLoad`. Until known, outer has no width — letting `<img width:auto
   * height:100%>` size itself naturally. Once measured we lock the outer's
   * `aspectRatio` so the browser stops applying its quirky shrink-to-fit
   * (which was rendering swamp-beast / wicked-witch at the wrong ratio).
   */
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const candidates = getCandidates(layer.base);

  // Measure as soon as the <img> is attached IF it's already decoded (a cached
  // image — e.g. a 2nd instance of the same monster — whose `onLoad` never
  // fires). Without this the ratio stays null, `width:auto` kicks in, and the
  // browser's aspect-ratio shrink quirk renders that instance at ~40% size —
  // the "random tiny duplicate monster" bug. Stable identity (useCallback) so
  // React only invokes it on real mount/unmount.
  const measureOnAttach = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth > 0) {
      setAspectRatio((prev) => prev ?? img.naturalWidth / img.naturalHeight);
    }
  }, []);

  useEffect(() => {
    // Reset the extension-fallback cursor when the image path changes. We do
    // NOT null `aspectRatio` here — the <img> remounts on its `key` (the
    // resolved src) and `measureOnAttach` / `onLoad` re-measure the new image.
    // Nulling it would race with (and clobber) the synchronous cached-image
    // measurement, dropping the sprite back to the `width:auto` shrink path.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on base change
    setIdx(0);
    setFailed(false);
  }, [layer.base]);

  const scale = layer.scale ?? defaultScale;
  const xPercent = POS_X[layer.position];

  // Container height as a fraction of viewport. We deliberately compute
  // BOTH width and height as explicit `dvh` values rather than relying on
  // the `aspect-ratio` CSS property. Why: in our layout
  //   `<fixed inset-0>` → `<absolute inset-0>` → `<absolute bottom:0; height:Xdvh; aspect-ratio:R>`
  // every major browser (iOS Safari, desktop Chrome / Edge / Firefox)
  // intermittently treated the aspect-ratio as the authoritative
  // constraint and shrank `height` to fit a content-derived width, even
  // though we had specified `height` explicitly. That dropped sprites
  // to ~40% of their intended size. Deriving width directly from the
  // image's aspect (`height × naturalAspect`) sidesteps the ambiguity —
  // both axes are explicit, no circular layout, no surprises.
  const heightDvh = Math.min(92, Math.max(15, scale * 80));
  const widthDvh = aspectRatio != null ? heightDvh * aspectRatio : null;

  // Outer positioner: spring-animates left/bottom/zIndex so the slot swap
  // glides instead of teleporting. translateX(-50%) is the static centering
  // offset and stays in the style (Framer Motion isn't animating x here).
  const outerStyle: React.CSSProperties = {
    height: `${heightDvh}dvh`,
    width: widthDvh != null ? `${widthDvh}dvh` : "auto",
    transform: "translateX(-50%)",
  };

  // Inner animator: handles the lunge / dodge pixel offset so it can layer
  // on top of the outer centering transform without conflict. Flip is folded
  // into Framer's scaleX so it doesn't clobber the animated x transform.
  // `hurting` is intentionally NOT a positional shake — damage feedback is a
  // blink on the outer container (filter + opacity) so the sprite stays put.
  const lungePx = 36;
  const dodgePx = 22;
  const flipX = layer.flip ? -1 : 1;
  const innerAnimate =
    layer.attacking === "right"
      ? { x: [0, lungePx, 0], scaleX: flipX }
      : layer.attacking === "left"
        ? { x: [0, -lungePx, 0], scaleX: flipX }
        : layer.dodging
          ? { x: [0, -dodgePx, dodgePx, -dodgePx / 2, 0], scaleX: flipX }
          : { x: 0, scaleX: flipX };
  const innerDuration = layer.dodging
    ? 0.55
    : layer.attacking !== undefined
      ? 0.4
      : 0.001;

  if (failed) {
    return (
      <motion.div
        className="absolute flex items-end justify-center"
        initial={false}
        animate={{
          left: `${xPercent}%`,
          bottom: layer.airborne ? "55%" : "3%",
          zIndex: layer.z ?? defaultZ,
          opacity: layer.defeated ? 0.35 : 1,
          filter: layer.defeated ? "grayscale(70%)" : "grayscale(0%)",
        }}
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
        // Fallback placeholder is a 1:1 square — width equals height so
        // we don't hit the same aspect-ratio-collapses-height bug as the
        // main render path.
        style={{ ...outerStyle, width: `${heightDvh}dvh` }}
        aria-hidden
      >
        <div className="flex h-3/4 w-3/4 items-center justify-center rounded-full bg-paper/30 ring-1 ring-ink-soft/20 backdrop-blur">
          <span className="font-handwritten text-3xl text-ink-soft/60">
            {fallbackInitial}
          </span>
        </div>
      </motion.div>
    );
  }

  // Damage flash: blink opacity + pulse a red drop-shadow. No position
  // change — the sprite stays put so the kid registers "I got hit" rather
  // than "I moved".
  const isHurting = !!layer.hurting && !layer.defeated;
  const baseFilter = layer.defeated ? "grayscale(70%)" : "grayscale(0%)";
  const hurtFilter = [
    "drop-shadow(0 0 0px rgba(255,70,70,0))",
    "drop-shadow(0 0 18px rgba(255,70,70,1))",
    "drop-shadow(0 0 0px rgba(255,70,70,0))",
    "drop-shadow(0 0 14px rgba(255,70,70,0.85))",
    "drop-shadow(0 0 0px rgba(255,70,70,0))",
  ];
  const hurtOpacity = [1, 0.25, 1, 0.3, 1];

  return (
    <motion.div
      className="absolute"
      initial={false}
      animate={{
        left: `${xPercent}%`,
        bottom: layer.airborne ? "55%" : "3%",
        zIndex: layer.z ?? defaultZ,
        opacity: isHurting ? hurtOpacity : layer.defeated ? 0.35 : 1,
        filter: isHurting ? hurtFilter : baseFilter,
      }}
      transition={
        isHurting
          ? {
              opacity: {
                duration: 0.55,
                times: [0, 0.18, 0.42, 0.7, 1],
              },
              filter: {
                duration: 0.55,
                times: [0, 0.18, 0.42, 0.7, 1],
              },
              default: { type: "spring", stiffness: 220, damping: 26 },
            }
          : { type: "spring", stiffness: 220, damping: 26 }
      }
      style={outerStyle}
    >
      {/* The img probes its own natural ratio on load and tells the outer
          via `setAspectRatio`. Once known, the outer has explicit height
          + width (both in dvh) so the inner img just fills the box. While
          ratio is still null on the very first frame, the outer has
          `width: auto` so the img can size to its natural aspect — once
          measured we swap to the exact width derived from `naturalAspect`. */}
      <motion.img
        key={candidates[idx]}
        ref={measureOnAttach}
        src={candidates[idx]}
        alt={layer.alt ?? ""}
        draggable={false}
        animate={innerAnimate}
        transition={{ duration: innerDuration, ease: "easeOut" }}
        style={{
          height: "100%",
          width: aspectRatio === null ? "auto" : "100%",
          display: "block",
          objectFit: "contain",
          objectPosition: "bottom",
          userSelect: "none",
        }}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            setAspectRatio(img.naturalWidth / img.naturalHeight);
          }
        }}
        onError={() => {
          if (idx + 1 < candidates.length) setIdx(idx + 1);
          else setFailed(true);
        }}
      />
    </motion.div>
  );
}
