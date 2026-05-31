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
  /** Optional branch id (on `sceneId`) — when set, the preview opens right
   *  after that branch's choice instead of on the scene itself. */
  branchId?: string | null;
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
  branchId,
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
        {/* Top-center: a single pill holding the "Preview" label and the
            close button together. */}
        <div className="absolute left-1/2 top-3 z-[90] flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-pill bg-paper/55 pl-4 pr-1.5 shadow-button ring-1 ring-ink-soft/20 backdrop-blur-sm">
          <span className="text-sm font-semibold text-ink">Preview</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="flex h-6 w-6 items-center justify-center rounded-pill text-ink transition-colors hover:bg-ink/10 active:scale-95"
            title="Close preview (Esc)"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
        <StoryPlayer
          // Remount when the start point changes so a fresh preview state is
          // built (incl. re-running the branch auto-take).
          key={`${sceneId}:${branchId ?? ""}`}
          story={story}
          medals={medals}
          characters={characters}
          slot="admin-preview"
          initialSceneId={sceneId}
          initialBranchId={branchId ?? undefined}
        />
      </div>
    </div>,
    document.body,
  );
}
