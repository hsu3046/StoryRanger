"use client";

import { useEffect, useMemo, useState } from "react";
import { Shuffle } from "@phosphor-icons/react";

import {
  generateChallenge,
  ageBandLabel,
  categoriesForAge,
  englishCategoriesForAge,
  type Challenge,
  type ChallengeCategory,
} from "@/lib/education";
import { EducationalChallenge } from "@/components/challenge/EducationalChallenge";
import { ChallengeVisualView } from "@/components/challenge/ChallengeVisualView";

/** Categories shown as columns. "auto" mirrors what the runtime picks for the
 *  age tier; the explicit ones force that category (numbers clamped to tier). */
const CATEGORIES: {
  value: "auto" | "english" | ChallengeCategory;
  label: string;
}[] = [
  { value: "auto", label: "Auto (mixed math)" },
  { value: "counting", label: "Counting" },
  { value: "shape", label: "Shapes" },
  { value: "compare", label: "Compare" },
  { value: "odd-one-out", label: "Odd one out" },
  { value: "pattern", label: "Number pattern" },
  { value: "add", label: "Addition" },
  { value: "sub", label: "Subtraction" },
  { value: "multiply", label: "Multiplication" },
  { value: "divide", label: "Division" },
  { value: "missing", label: "Missing number" },
  { value: "fraction", label: "Fractions" },
  { value: "decimal", label: "Decimals" },
  { value: "percentage", label: "Percentage" },
  { value: "ratio", label: "Ratio" },
  { value: "money", label: "Money" },
  { value: "time", label: "Time" },
  { value: "measure", label: "Area / perimeter / volume" },
  { value: "geometry", label: "Geometry / angles" },
  { value: "average", label: "Average" },
  { value: "factors", label: "Factors & multiples" },
  { value: "algebra", label: "Algebra" },
  { value: "speed", label: "Speed" },
  { value: "word", label: "Word / thinking" },
  // English literacy (author-gated; offline word-bank). Easiest → hardest.
  { value: "english", label: "English (mixed)" },
  { value: "vocab-picture", label: "English · Picture word" },
  { value: "first-letter", label: "English · First letter" },
  { value: "rhyme", label: "English · Rhyme" },
  { value: "syllables", label: "English · Syllables" },
  { value: "missing-letter", label: "English · Missing letter" },
  { value: "spelling", label: "English · Spelling" },
  { value: "plural", label: "English · Plural" },
  { value: "compound", label: "English · Compound word" },
  { value: "homophone", label: "English · Homophone" },
  { value: "opposite", label: "English · Opposite" },
  { value: "synonym", label: "English · Synonym" },
  { value: "analogy", label: "English · Analogy" },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
);

const AGES = [4, 5, 6, 7, 8, 9, 10, 11, 12];
const SAMPLES_PER_CATEGORY = 6;

export function ChallengePreviewer() {
  const [age, setAge] = useState(8);
  // Bumping the seed re-rolls every sample (generateChallenge is random).
  const [seed, setSeed] = useState(0);
  const [preview, setPreview] = useState<Challenge | null>(null);
  // Monotonic id so each new preview problem remounts the component even if the
  // random prompt happens to repeat (e.g. counting's "How many?").
  const [previewNonce, setPreviewNonce] = useState(0);
  // Samples use Math.random, so generating during SSR/first render would
  // mismatch on hydration. Defer to after mount — server + first client render
  // both show nothing, then we fill in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only gate for random content (avoids hydration mismatch)
    setMounted(true);
  }, []);

  // Only the categories this age actually produces (the auto pool) + an "auto"
  // mix card — so the sheet never shows level-inappropriate types (e.g. no
  // counting/shapes at age 12).
  const ageCategories = useMemo<("auto" | "english" | ChallengeCategory)[]>(
    () => [
      "auto",
      ...categoriesForAge(age),
      "english",
      ...englishCategoriesForAge(age),
    ],
    [age],
  );

  // Generate a fresh sample sheet whenever age or seed changes (post-mount).
  const sheet = useMemo(() => {
    if (!mounted) return [];
    void seed; // dep only — forces regeneration on "Regenerate"
    return ageCategories.map((value) => ({
      value,
      label: CATEGORY_LABEL[value] ?? value,
      samples: Array.from({ length: SAMPLES_PER_CATEGORY }, () =>
        generateChallenge({ age, category: value }),
      ),
    }));
  }, [mounted, age, seed, ageCategories]);

  function openPreview() {
    setPreviewNonce((n) => n + 1);
    setPreview(generateChallenge({ age, category: "auto" }));
  }

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p className="font-handwritten text-base text-accent-deep">
            Challenges
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openPreview}
            className="rounded-pill bg-accent-deep px-3 py-1 text-sm font-medium text-paper hover:opacity-90"
          >
            ▶ Preview
          </button>
          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className="flex items-center gap-1.5 rounded-pill bg-paper-deep/60 px-3 py-1 text-sm text-ink-soft hover:bg-paper-deep"
          >
            <Shuffle size={15} weight="bold" />
            Regenerate
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Age selector */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase text-ink-soft">
            Age
          </span>
          <div className="flex gap-1">
            {AGES.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAge(a)}
                className={`flex h-9 w-9 items-center justify-center rounded-pill text-sm font-semibold tabular-nums transition-colors ${
                  a === age
                    ? "bg-accent-deep text-paper"
                    : "bg-paper-deep/50 text-ink-soft hover:bg-paper-deep"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
          <span className="rounded-pill bg-emerald/15 px-2.5 py-1 text-xs font-semibold text-emerald">
            {ageBandLabel(age)}
          </span>
        </div>

        {/* Sample sheet — one card per category. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sheet.map(({ value, label, samples }) => (
            <div
              key={value}
              className="rounded-card-lg bg-paper ring-1 ring-ink-soft/10"
            >
              <div className="border-b border-ink-soft/10 px-3 py-2">
                <p className="text-sm font-semibold text-ink">{label}</p>
              </div>
              <ul className="flex flex-col divide-y divide-ink-soft/5">
                {samples.map((c, i) => (
                  <SampleRow key={i} challenge={c} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* In-game preview overlay — the real component the player sees, with a
          "Next Challenge" button stacked directly beneath it (tight gap). */}
      {preview && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 overflow-y-auto bg-ink/85 px-4 py-8 backdrop-blur-sm">
          {/* Close control — "Close ✕". */}
          <button
            type="button"
            onClick={() => setPreview(null)}
            aria-label="Close preview"
            className="absolute right-4 top-4 z-[90] flex items-center gap-2 rounded-pill bg-paper/90 px-3 py-1.5 text-sm font-medium text-ink shadow-soft hover:bg-paper"
            style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}
          >
            Close <span className="text-base leading-none">✕</span>
          </button>
          <EducationalChallenge
            key={`preview-${previewNonce}`}
            mode="gate"
            placement="inline"
            challenge={preview}
            onSolved={(correct) => {
              // Correct → auto-advance to the next random problem (keep going
              // until Close). Wrong → leave the in-card "Not quite" feedback up.
              if (correct) openPreview();
            }}
          />
          {/* Next Challenge — sits right under the card (flex gap), larger. */}
          <button
            type="button"
            onClick={openPreview}
            className="flex shrink-0 items-center gap-2 rounded-pill bg-accent-deep px-6 py-3 text-base font-semibold text-paper shadow-card hover:opacity-90 active:scale-95"
          >
            <Shuffle size={18} weight="bold" />
            Next Challenge
          </button>
        </div>
      )}
    </div>
  );
}

/** Compact inline rendering of one generated challenge for the sample sheet. */
function SampleRow({ challenge }: { challenge: Challenge }) {
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2">
      {challenge.visual && (
        <div className="flex items-center">
          <ChallengeVisualView visual={challenge.visual} size="sm" />
        </div>
      )}
      <p className="text-sm font-semibold tabular-nums text-ink">
        {challenge.prompt}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {challenge.choices.map((ch, i) => (
          <span
            key={i}
            className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${
              i === challenge.correctIndex
                ? "bg-emerald/20 text-emerald ring-1 ring-emerald/40"
                : "bg-paper-deep/40 text-ink-soft"
            }`}
          >
            {ch}
          </span>
        ))}
      </div>
    </li>
  );
}
