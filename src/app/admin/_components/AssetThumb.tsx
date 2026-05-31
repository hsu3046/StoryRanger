"use client";

import { useEffect, useMemo, useState } from "react";

import { assetUrl } from "@/lib/asset-paths";

// Try common extension variants (lowercase + uppercase) so admin keeps
// rendering whichever file is actually on disk.
const EXTS = [
  ".webp",
  ".png",
  ".jpeg",
  ".jpg",
  ".WEBP",
  ".PNG",
  ".JPEG",
  ".JPG",
];

function candidates(input: string): string[] {
  const lastDot = input.lastIndexOf(".");
  const lastSlash = input.lastIndexOf("/");
  const hasExt = lastDot > lastSlash;
  const base = hasExt ? input.slice(0, lastDot) : input;
  // Only seed the list with the verbatim input when it has a real
  // extension. Otherwise the first request is guaranteed to 404 and
  // would trigger an unnecessary fallback (visible flicker).
  const seed = hasExt ? [input] : [];
  const list = [...seed, ...EXTS.map((e) => base + e)];
  const seen = new Set<string>();
  return list.filter((v) => {
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}

interface Props {
  /** Asset path. Can include or omit extension — extension fallback chain
   *  tries .webp / .png / .jpeg / .jpg (and uppercase variants) in order. */
  base: string;
  /** Secondary base tried (with its own extension chain) only after every
   *  `base` candidate 404s. Used for dialogue portraits: prefer the dedicated
   *  `/dialogue/<id>` head-shot, else fall back to the in-scene sprite
   *  (`image` override / `characters/<id>`) so a single uploaded image still
   *  shows everywhere. Ignored when `resolvedSrc` is supplied. */
  fallbackBase?: string;
  alt: string;
  /** Tailwind size classes — defaults to a 48×48 square. */
  className?: string;
  /** Shape — `square` (default) or `circle`. */
  shape?: "square" | "circle" | "banner";
  /** object-fit — `cover` (default) or `contain`. */
  fit?: "cover" | "contain";
  /** object-position — defaults to "center". */
  position?: string;
  /** Outline color override (e.g. character.color). Falls back to a subtle
   *  ink ring when omitted. */
  ringColor?: string;
  /** Outline width in pixels. Defaults to 1 when no `ringColor` is given. */
  ringWidth?: number;
  /** Fill color behind the image (overrides the default paper-deep tint).
   *  Useful with `fit="contain"` to seat a sprite on a solid disc. */
  bgColor?: string;
  /** Inner padding in px — shrinks a `contain` sprite inward so it doesn't get
   *  clipped by a circular mask at the corners. */
  pad?: number;
  /** When provided, skip the fallback chain entirely. Pass the result of
   *  `resolveAssetPath()` from a server component — `null` means "no file
   *  on disk; render the ? placeholder immediately, no flicker". */
  resolvedSrc?: string | null;
  /** Placeholder rendered when no image resolves. Defaults to a "?" glyph. */
  placeholder?: React.ReactNode;
}

/**
 * Auto-loading asset thumbnail with extension fallback chain. The outer
 * wrapper owns the size/shape/ring; the inner <img> only fills it. That
 * way, when the fallback chain remounts the image, the box never resizes
 * (no flicker, no layout shift).
 */
export function AssetThumb({
  base,
  fallbackBase,
  alt,
  className = "h-12 w-12",
  shape = "square",
  fit = "cover",
  position = "center",
  ringColor,
  ringWidth,
  bgColor,
  pad,
  resolvedSrc,
  placeholder,
}: Props) {
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const usePrecomputed = resolvedSrc !== undefined;
  const list = useMemo(() => {
    if (usePrecomputed) return resolvedSrc ? [resolvedSrc] : [];
    // Primary base's extension chain, then the fallback base's — deduped so a
    // shared file isn't requested twice.
    const all = [...candidates(base), ...(fallbackBase ? candidates(fallbackBase) : [])];
    const seen = new Set<string>();
    return all.filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
  }, [usePrecomputed, resolvedSrc, base, fallbackBase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on path change
    setIdx(0);
    setFailed(usePrecomputed && resolvedSrc === null);
  }, [base, fallbackBase, usePrecomputed, resolvedSrc]);

  const rounded =
    shape === "circle"
      ? "rounded-full"
      : shape === "banner"
        ? "rounded-none"
        : "rounded-card";
  const objectFit = fit === "contain" ? "object-contain" : "object-cover";

  const hasCustomRing = !!ringColor;
  const ringPx = ringWidth ?? (hasCustomRing ? 3 : 1);
  // ringWidth === 0 explicitly disables both the default ink ring and any
  // custom-color ring. Useful when the thumbnail sits inside another
  // bordered control (chip pills, etc.) and a doubled outline looks busy.
  const noRing = ringWidth === 0;
  const ringClass = noRing || hasCustomRing ? "" : "ring-1 ring-ink-soft/10";
  const wrapperStyle: React.CSSProperties = {};
  if (hasCustomRing && !noRing) {
    wrapperStyle.boxShadow = `0 0 0 ${ringPx}px ${ringColor}`;
  }
  // Inline backgroundColor wins over the default `bg-paper-deep/30` class.
  if (bgColor) wrapperStyle.backgroundColor = bgColor;
  if (pad) wrapperStyle.padding = pad;

  return (
    <div
      className={`${className} ${rounded} ${ringClass} relative overflow-hidden bg-paper-deep/30`}
      style={wrapperStyle}
      title={failed ? `${alt} — no image` : alt}
    >
      {failed || !list[idx] ? (
        // No candidate to show (precomputed `resolvedSrc === null`, or the
        // fallback chain is exhausted). Render the placeholder synchronously —
        // the `failed` flag is set a render late by the effect, so without the
        // `!list[idx]` guard the first paint would hit `<img src={undefined}>`.
        <div className="flex h-full w-full items-center justify-center text-[10px] text-ink-soft/60">
          {placeholder ?? "?"}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- extension fallback chain
        <img
          src={assetUrl(list[idx])}
          alt={alt}
          draggable={false}
          style={{ objectPosition: position }}
          className={`block h-full w-full select-none ${objectFit}`}
          onError={() => {
            if (idx + 1 < list.length) setIdx(idx + 1);
            else setFailed(true);
          }}
        />
      )}
    </div>
  );
}
