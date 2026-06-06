"use client";

import type { CharacterGenderT } from "@/data/schemas";

const OPTIONS: { value: CharacterGenderT; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "neutral", label: "Neutral" },
];

/**
 * Compact 3-way segmented control for a character's gender. Native <select> is
 * unreliable in Tailwind v4, so this is a button group. Shared by the Create
 * Story wizard and the story editor — placed to the left of the Voice picker.
 */
export function GenderSelect({
  value,
  onChange,
}: {
  value: CharacterGenderT;
  onChange: (g: CharacterGenderT) => void;
}) {
  return (
    <div className="flex w-56 shrink-0 rounded-pill bg-paper-deep/40 p-0.5 ring-1 ring-ink-soft/10">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex-1 rounded-pill px-2 py-1 text-center text-sm font-medium transition-colors ${
            value === o.value
              ? "bg-paper text-ink shadow-soft"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
