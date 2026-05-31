"use client";

import { ArrowCircleRight } from "@phosphor-icons/react";

import type { Branch } from "@/types/story";

interface Props {
  branch: Branch;
  /** Globally disabled (e.g. narration in progress). */
  disabled?: boolean;
  onSelect: (branch: Branch) => void;
}

/**
 * Shared geometry/opacity for every bottom-row choice button — story
 * branches, scene "ask" chips, and the in-dialogue reply suggestions. Kept in
 * one place so size and opacity stay unified across all of them. Tall (h-20),
 * translucent (bg-paper/60) over the scene art, big legible label. The ring
 * colour is appended by the variant below (neutral vs accent).
 */
const CHOICE_BUTTON_BASE =
  "group relative flex h-20 w-full items-center justify-center gap-2 rounded-pill bg-paper/60 px-6 text-center text-lg font-semibold leading-tight text-balance text-ink ring-1 shadow-button backdrop-blur-sm transition-all hover:bg-paper/85 hover:shadow-button-hover hover:-translate-y-0.5 hover:-translate-x-px active:translate-y-0 active:translate-x-0 active:scale-[0.98] active:shadow-button-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:translate-x-0 disabled:hover:shadow-button";

/** Neutral choice — branches, ask chips, dialogue reply suggestions. */
export const choiceButtonClass = `${CHOICE_BUTTON_BASE} ring-ink-soft/15 hover:ring-accent/50 disabled:hover:ring-ink-soft/15`;

/** Accent variant — a branch shown DURING a dialogue, marked with an accent
 *  ring (+ a "→" the caller prepends) so it reads as "advance the story"
 *  rather than "keep talking". Same size/opacity as the neutral variant. */
export const choiceButtonAccentClass = `${CHOICE_BUTTON_BASE} ring-accent/55 hover:ring-accent/80 disabled:hover:ring-accent/55`;

export function ChoiceButton({ branch, disabled, onSelect }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(branch)}
      className={choiceButtonAccentClass}
    >
      <ArrowCircleRight
        size={22}
        weight="fill"
        className="shrink-0 text-accent-deep"
        aria-hidden
      />
      <span>{branch.label}</span>
    </button>
  );
}
