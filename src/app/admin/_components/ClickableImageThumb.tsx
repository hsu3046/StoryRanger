"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

import { assetUrl } from "@/lib/asset-paths";
import { AssetThumb } from "./AssetThumb";

interface Props {
  base: string;
  alt: string;
  /** Tailwind sizing classes for the inline thumbnail. */
  className?: string;
  /** Thumbnail shape — same vocabulary as AssetThumb. */
  shape?: "square" | "circle" | "banner";
  /** object-fit for the thumbnail. The lightbox always uses `contain`
   *  so the full image is visible without cropping. */
  fit?: "cover" | "contain";
  /** Placeholder rendered when no image resolves (passed to AssetThumb). */
  placeholder?: React.ReactNode;
}

/**
 * Inline image thumbnail that opens a fullscreen lightbox on click.
 * Used by Scene/Branch image previews in the Story Graph and the
 * Character image picker — anywhere the author wants a glance plus an
 * easy way to inspect the full asset.
 */
export function ClickableImageThumb({
  base,
  alt,
  className,
  shape = "square",
  fit = "cover",
  placeholder,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${alt} preview`}
        className={`overflow-hidden rounded-card transition-opacity hover:opacity-90 ${className ?? ""}`}
      >
        {/* `!bg-transparent` overrides AssetThumb's default
            `bg-paper-deep/30` wrapper tint — we want the thumbnail to
            sit on whatever surface the form is on, not draw its own
            backdrop. */}
        <AssetThumb
          base={base}
          alt={alt}
          className="h-full w-full !bg-transparent"
          shape={shape}
          fit={fit}
          ringWidth={0}
          placeholder={placeholder}
        />
      </button>
      {open && (
        <ImageLightbox base={base} alt={alt} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

// Local extension-fallback set — mirrors AssetThumb's candidate list,
// but applied to a plain <img> here so the lightbox can render at the
// image's natural intrinsic dimensions (capped by 92vh/92vw). Using
// AssetThumb here would force `h-full w-full` inside a wrapper without
// fixed dims, collapsing the image to 0×0.
const LIGHTBOX_EXTS = [
  ".webp",
  ".png",
  ".jpeg",
  ".jpg",
  ".WEBP",
  ".PNG",
  ".JPEG",
  ".JPG",
];

function ImageLightbox({
  base,
  alt,
  onClose,
}: {
  base: string;
  alt: string;
  onClose: () => void;
}) {
  const [extIdx, setExtIdx] = useState(0);
  const stem = base.replace(/\.[^./]+$/, "");
  const src = stem + LIGHTBOX_EXTS[extIdx];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof window === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/85"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute right-4 top-4 z-[91] flex h-9 w-9 items-center justify-center rounded-pill bg-paper/85 text-ink shadow-button ring-1 ring-ink-soft/20 hover:bg-paper"
      >
        <X size={16} weight="bold" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- needs
          natural intrinsic dimensions; next/image would force layout
          constraints we don't want here */}
      <img
        src={assetUrl(src)}
        alt={alt}
        onError={() => {
          setExtIdx((i) => Math.min(i + 1, LIGHTBOX_EXTS.length - 1));
        }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[92vw] object-contain"
      />
    </div>,
    document.body,
  );
}
