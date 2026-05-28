"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

import { StoryPlayer } from "@/components/play/StoryPlayer";
import type { CharactersFile, MedalsFile, Story } from "@/types/story";

interface Props {
  story: Story;
  medals: MedalsFile;
  characters: CharactersFile;
  /** Scene id where the preview should start. Null = closed. */
  sceneId: string | null;
  onClose: () => void;
}

/**
 * Admin-side scene preview. Mounts StoryPlayer in `previewMode` (no
 * localStorage persistence, fresh state at the chosen scene) over the
 * graph editor. Closing dismounts → state is gone; re-opening is a clean
 * start. ESC + the × button both close.
 */
export function ScenePreviewModal({
  story,
  medals,
  characters,
  sceneId,
  onClose,
}: Props) {
  // ESC closes; body scroll locked while open.
  useEffect(() => {
    if (!sceneId) return;
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
  }, [sceneId, onClose]);

  if (!sceneId) return null;
  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label="Scene preview"
    >
      {/* Backdrop — opaque enough to fully isolate the preview from the
          graph editor behind it. */}
      <div className="absolute inset-0 bg-ink/85" />
      {/* Player surface — fills the viewport minus a small inset so the
          author can see the modal frame and find the close button. */}
      <div className="absolute inset-2 overflow-hidden rounded-card-lg bg-ink shadow-overlay sm:inset-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="absolute left-1/2 top-3 z-[90] flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-pill bg-paper/85 text-ink shadow-button ring-1 ring-ink-soft/20 hover:bg-paper active:scale-95"
          title="Close preview (Esc)"
        >
          <X size={16} weight="bold" />
        </button>
        <StoryPlayer
          story={story}
          medals={medals}
          characters={characters}
          slot="admin-preview"
          initialSceneId={sceneId}
        />
      </div>
    </div>,
    document.body,
  );
}
