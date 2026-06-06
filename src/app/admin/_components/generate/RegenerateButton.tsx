"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkle } from "@phosphor-icons/react";

import { inputClsSm } from "../form";
import { GhostButton } from "./shared";

/**
 * Regenerate control that first asks the author HOW to revise. The instruction
 * is passed through to the stage's LLM route as `authorRequest` (already
 * supported by concept/storyboard/characters), turning a blind reroll into a
 * directed revision. Leaving it empty reproduces the old fresh-reroll behaviour.
 */
export function RegenerateButton({
  busy,
  disabled,
  label = "Generate",
  title = "Revise & regenerate",
  hint,
  count,
  allowEmpty = false,
  onRegenerate,
}: {
  busy: boolean;
  disabled?: boolean;
  /** Trigger button label (default "Generate"). */
  label?: string;
  title?: string;
  /** Description line — should state exactly which fields get rewritten. */
  hint?: React.ReactNode;
  /** Allow generating with no instruction even without an in-modal count
   *  control (e.g. the Scene step, whose page count lives outside this modal). */
  allowEmpty?: boolean;
  /** Optional "how many" control (e.g. beat count) shown in the modal. The
   *  chosen value is passed as the 2nd arg of onRegenerate. */
  count?: { initial: number; min: number; max: number; label?: string };
  onRegenerate: (authorRequest?: string, count?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [cnt, setCnt] = useState(count?.initial ?? 0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal needs document; flip after mount
    setMounted(true);
  }, []);

  function openModal() {
    if (count) setCnt(count.initial);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function submit() {
    const req = text.trim();
    setOpen(false);
    setText("");
    onRegenerate(req || undefined, count ? cnt : undefined);
  }

  const stepBtn =
    "rounded-pill bg-paper-deep/60 px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-ink-soft/10 hover:bg-paper-deep disabled:opacity-40";

  return (
    <>
      <GhostButton onClick={openModal} disabled={disabled} accent>
        <Sparkle weight="fill" className="h-4 w-4" aria-hidden />
        {busy ? "Generating…" : label}
      </GhostButton>
      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-ink/50"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-md rounded-card-lg bg-paper p-5 shadow-button ring-1 ring-ink-soft/15"
            >
              <h2 className="mb-1 font-handwritten text-lg text-accent-deep">{title}</h2>
              <p className="mb-3 text-sm text-ink-soft">
                {hint ?? "Describe what to change."}
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. add a twist in the middle…"
                className={`${inputClsSm} min-h-24 w-full`}
              />
              <div className="mt-5 flex items-center justify-between gap-2">
                {count ? (
                  <div className="flex items-center gap-1.5 text-xs text-ink-soft">
                    <span className="font-semibold uppercase tracking-wide">
                      {count.label ?? "Count"}
                    </span>
                    <button
                      type="button"
                      aria-label="Fewer"
                      disabled={cnt <= count.min}
                      onClick={() => setCnt((n) => Math.max(count.min, n - 1))}
                      className={stepBtn}
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums text-ink">
                      {cnt}
                    </span>
                    <button
                      type="button"
                      aria-label="More"
                      disabled={cnt >= count.max}
                      onClick={() => setCnt((n) => Math.min(count.max, n + 1))}
                      className={stepBtn}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-pill bg-paper-deep/60 px-4 py-1.5 text-sm text-ink-soft hover:bg-paper-deep"
                  >
                    Cancel
                  </button>
                  <GhostButton
                    accent
                    onClick={submit}
                    disabled={!text.trim() && !count && !allowEmpty}
                  >
                    <Sparkle weight="fill" className="h-4 w-4" aria-hidden />
                    Generate
                  </GhostButton>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
