"use client";

import { useEffect, useState } from "react";

import { assetUrl } from "@/lib/asset-paths";

interface Props {
  src: string;
  alt: string;
  /**
   * Fired once the displayed image is decode-ready (or, if every extension
   * 404s, when the parchment fallback is shown) — lets the caller gate its
   * reveal on real pixels instead of a blind timer, so the entrance never
   * holds black after the image could paint, nor flashes a half-decoded frame.
   */
  onReady?: () => void;
}

const EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg"];

function getCandidates(src: string): string[] {
  const base = src.replace(/\.(webp|png|jpg|jpeg)$/i, "");
  return EXTENSIONS.map((ext) => base + ext);
}

/**
 * Full-bleed cinemascope background image.
 *
 * - Tries multiple file extensions if the canonical one is missing.
 * - Plain `<img>` (not `next/image`) so the resolved URL is served DIRECTLY
 *   from the asset origin (`assetUrl` → R2/CDN) without routing through
 *   Vercel's image optimizer — keeping CDN egress free. Assets are already
 *   pre-optimized to webp. `eager` + high fetch priority for a fast LCP.
 * - `object-cover` center-crops any aspect-ratio mismatch.
 * - Falls back to a warm parchment placeholder if every extension 404s.
 */
export function SceneImage({ src, alt, onReady }: Props) {
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [allFailed, setAllFailed] = useState(false);
  const candidates = getCandidates(src);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on src change
    setCandidateIdx(0);
    setAllFailed(false);
  }, [src]);

  if (allFailed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-paper-deep/40 to-accent/15 px-6 text-center text-ink-soft/50">
        <span className="font-handwritten text-3xl">{alt}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- served directly from the asset CDN (no next/image proxy); extension fallback via onError
    <img
      key={candidates[candidateIdx]}
      src={assetUrl(candidates[candidateIdx])}
      alt={alt}
      loading="eager"
      fetchPriority="high"
      draggable={false}
      onLoad={(e) => {
        const img = e.currentTarget;
        // decode() guarantees the bitmap is paint-ready (no half-painted flash
        // as the veil lifts). Best-effort: old browsers / detached nodes reject
        // — signal ready anyway so the reveal never stalls.
        if (img.decode) {
          img.decode().then(
            () => onReady?.(),
            () => onReady?.(),
          );
        } else {
          onReady?.();
        }
      }}
      onError={() => {
        if (candidateIdx + 1 < candidates.length) {
          setCandidateIdx(candidateIdx + 1);
        } else {
          setAllFailed(true);
          // Every extension 404'd — reveal the parchment placeholder instead of
          // leaving the caller's veil black forever.
          onReady?.();
        }
      }}
      className="absolute inset-0 h-full w-full object-cover object-center"
    />
  );
}
