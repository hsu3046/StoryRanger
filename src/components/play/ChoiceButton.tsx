"use client";

import type { Branch } from "@/types/story";

interface Props {
  branch: Branch;
  disabled?: boolean;
  onSelect: (branch: Branch) => void;
}

export function ChoiceButton({ branch, disabled, onSelect }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(branch)}
      className="group flex h-20 w-full items-center justify-center rounded-pill bg-paper/60 px-6 text-center text-lg font-semibold leading-tight text-balance text-ink ring-1 ring-ink-soft/15 shadow-button backdrop-blur-sm transition-all hover:bg-paper/85 hover:shadow-button-hover hover:-translate-y-0.5 hover:-translate-x-px hover:ring-accent/50 active:translate-y-0 active:translate-x-0 active:scale-[0.98] active:shadow-button-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:translate-x-0 disabled:hover:shadow-button disabled:hover:ring-ink-soft/15"
    >
      {branch.label}
    </button>
  );
}
