"use client";

import { useEffect, useMemo, useState } from "react";

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
  alt,
  className = "h-12 w-12",
  shape = "square",
  fit = "cover",
  position = "center",
  ringColor,
  ringWidth,
  resolvedSrc,
  placeholder,
}: Props) {
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const usePrecomputed = resolvedSrc !== undefined;
  const list = useMemo(
    () => (usePrecomputed ? (resolvedSrc ? [resolvedSrc] : []) : candidates(base)),
    [usePrecomputed, resolvedSrc, base],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on path change
    setIdx(0);
    setFailed(usePrecomputed && resolvedSrc === null);
  }, [base, usePrecomputed, resolvedSrc]);

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
  const wrapperStyle: React.CSSProperties =
    hasCustomRing && !noRing
      ? { boxShadow: `0 0 0 ${ringPx}px ${ringColor}` }
      : {};

  return (
    <div
      className={`${className} ${rounded} ${ringClass} relative overflow-hidden bg-paper-deep/30`}
      style={wrapperStyle}
      title={failed ? `${alt} — no image` : alt}
    >
      {failed ? (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-ink-soft/60">
          {placeholder ?? "?"}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- extension fallback chain
        <img
          src={list[idx]}
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
