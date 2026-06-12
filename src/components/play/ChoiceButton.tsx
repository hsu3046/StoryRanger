"use client";

import { ArrowCircleRight } from "@phosphor-icons/react";

import type { Branch } from "@/types/story";

interface Props {
  branch: Branch;
  /** Globally disabled (e.g. narration in progress). */
  disabled?: boolean;
  /** This label's audio is playing (auto read-aloud / tap replay). */
  reading?: boolean;
  /** First tap landed — the next tap on this tile confirms the choice. */
  armed?: boolean;
  onSelect: (branch: Branch) => void;
}

/**
 * Shared geometry/opacity for every bottom-row choice button — story
 * branches, scene "ask" chips, and the in-dialogue reply suggestions. Kept in
 * one place so size and opacity stay unified across all of them. Tall (h-20),
 * translucent (bg-paper/60) over the scene art, big legible label. On short
 * screens the fixed height gives way to h-full + min-h-10: choices sit 3-up
 * in one row there (see StoryPlayer), so a two-line label grows its button
 * and `h-full` stretches the one-line siblings to match — every button in a
 * row stays the same height. The ring colour is appended by the variant
 * below (neutral vs accent).
 */
const CHOICE_BUTTON_BASE =
  "group relative flex h-20 short:h-full short:min-h-10 short:py-1.5 w-full items-center justify-center gap-2 short:gap-1.5 rounded-pill bg-paper/60 px-6 short:px-3 text-center text-fluid-choice font-semibold leading-tight text-balance text-ink ring-1 shadow-button backdrop-blur-sm transition-all hover:bg-paper/85 hover:shadow-button-hover hover:-translate-y-0.5 hover:-translate-x-px active:translate-y-0 active:translate-x-0 active:scale-[0.98] active:shadow-button-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:translate-x-0 disabled:hover:shadow-button";

/** Neutral choice — branches, ask chips, dialogue reply suggestions. */
export const choiceButtonClass = `${CHOICE_BUTTON_BASE} ring-ink-soft/15 hover:ring-accent/50 disabled:hover:ring-ink-soft/15`;

/** Accent variant — a branch shown DURING a dialogue, marked with an accent
 *  ring (+ a "→" the caller prepends) so it reads as "advance the story"
 *  rather than "keep talking". Same size/opacity as the neutral variant. */
export const choiceButtonAccentClass = `${CHOICE_BUTTON_BASE} ring-accent/55 hover:ring-accent/80 disabled:hover:ring-accent/55`;

/**
 * Read-aloud state overrides, appended AFTER the variant class so the
 * stronger ring wins. `reading` marks the tile whose audio is playing (the
 * pre-reader's sound↔button link); `armed` marks a first tap waiting for its
 * confirming second tap. Shared by branches, ask chips, and suggestions.
 */
export function choiceStateClass(reading?: boolean, armed?: boolean): string {
  if (armed) return " ring-2 ring-accent-deep bg-paper/95";
  if (reading) return " ring-2 ring-accent bg-paper/90 animate-pulse";
  return "";
}

/** "Tap again to choose!" pill shown over an armed tile — the only new UI a
 *  pre-reader needs to learn. "choose" (not "select") — the everyday word
 *  early learners know, and it names what the game calls these: choices.
 *  Host button must be `relative` (the base class is). */
export function TapAgainBadge() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-pill bg-accent-deep px-2.5 py-0.5 text-xs font-bold text-paper shadow-soft"
    >
      Tap again to choose!
    </span>
  );
}

export function ChoiceButton({ branch, disabled, reading, armed, onSelect }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(branch)}
      className={choiceButtonAccentClass + choiceStateClass(reading, armed)}
    >
      {armed && <TapAgainBadge />}
      {/* Icon tracks the BUTTON scale, not the label font — 32px in the
          80px desktop button and 24px in the ~44-52px short one (≈ 40-50%
          of button height, visually matching the ask-chip portrait beside
          it). Font-matched sizes (16-22px) read lost inside the pill. */}
      <ArrowCircleRight
        weight="fill"
        className="size-8 shrink-0 text-accent-deep short:size-6"
        aria-hidden
      />
      <span>{branch.label}</span>
    </button>
  );
}
