"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Shared wizard image thumbnail. Shows the asset (or a "—" placeholder) and
 * opens a fullscreen lightbox on click. `base` is the extensionless path;
 * `version` cache-busts after a regenerate; webp falls back to png.
 */
export function ImagePreview({
  base,
  version = 0,
  alt,
  present,
  className,
  fit = "cover",
}: {
  base: string;
  version?: number;
  alt: string;
  present: boolean;
  /** Wrapper sizing/shape utilities, e.g. "aspect-square w-20". */
  className?: string;
  fit?: "cover" | "contain";
}) {
  const [open, setOpen] = useState(false);
  const webp = `${base}.webp?v=${version}`;
  const png = `${base}.png?v=${version}`;
  const fitCls = fit === "contain" ? "object-contain" : "object-cover";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => present && setOpen(true)}
        aria-label={present ? `Open ${alt}` : "No image"}
        className={`relative overflow-hidden rounded-button bg-paper ring-1 ring-ink-soft/10 ${
          present ? "transition-opacity hover:opacity-90" : "cursor-default"
        } ${className ?? ""}`}
      >
        {present ? (
          // eslint-disable-next-line @next/next/no-img-element -- dev preview with ext fallback
          <img
            src={webp}
            alt={alt}
            className={`h-full w-full ${fitCls}`}
            onError={(e) => {
              const el = e.currentTarget;
              if (!el.src.includes(".png")) el.src = png;
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-soft/50">
            No Image
          </div>
        )}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/85 p-4"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- dev lightbox with ext fallback */}
            <img
              src={webp}
              alt={alt}
              className="max-h-[92vh] max-w-[92vw] object-contain"
              onError={(e) => {
                const el = e.currentTarget;
                if (!el.src.includes(".png")) el.src = png;
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
