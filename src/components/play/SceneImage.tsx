"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

interface Props {
  src: string;
  alt: string;
}

const EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg"];

function getCandidates(src: string): string[] {
  const base = src.replace(/\.(webp|png|jpg|jpeg)$/i, "");
  return EXTENSIONS.map((ext) => base + ext);
}

/**
 * Full-bleed cinemascope background image powered by `next/image`.
 *
 * - Tries multiple file extensions if the canonical one is missing.
 * - `next/image` auto-generates srcSet, serves AVIF/WebP, and lazy-loads
 *   off-screen images. `priority` is on so the first scene is preloaded
 *   for a fast LCP.
 * - `object-cover` center-crops any aspect-ratio mismatch.
 * - Falls back to a warm parchment placeholder if every extension 404s.
 */
export function SceneImage({ src, alt }: Props) {
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
    <Image
      key={candidates[candidateIdx]}
      src={candidates[candidateIdx]}
      alt={alt}
      fill
      priority
      sizes="100vw"
      quality={82}
      onError={() => {
        if (candidateIdx + 1 < candidates.length) {
          setCandidateIdx(candidateIdx + 1);
        } else {
          setAllFailed(true);
        }
      }}
      className="object-cover object-center"
    />
  );
}
