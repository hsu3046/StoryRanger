"use client";

import { useMemo, useState } from "react";

import {
  generateChallenge,
  tierForAge,
  TIER_LABELS,
  type Challenge,
  type ChallengeCategory,
} from "@/lib/education";
import { EducationalChallenge } from "@/components/challenge/EducationalChallenge";
import { ChallengeVisualView } from "@/components/challenge/ChallengeVisualView";

/** Categories shown as columns. "auto" mirrors what the runtime picks for the
 *  age tier; the explicit ones force that category (numbers clamped to tier). */
const CATEGORIES: { value: "auto" | ChallengeCategory; label: string }[] = [
  { value: "auto", label: "Auto (age-appropriate)" },
  { value: "add", label: "Addition" },
  { value: "sub", label: "Subtraction" },
  { value: "multiply", label: "Multiplication" },
  { value: "divide", label: "Division" },
  { value: "missing", label: "Missing number" },
  { value: "compare", label: "Compare" },
  { value: "counting", label: "Counting" },
  { value: "pattern", label: "Number pattern" },
  { value: "geometry", label: "Shapes / geometry" },
  { value: "fraction", label: "Fractions" },
  { value: "word", label: "Word / thinking" },
  { value: "odd-one-out", label: "Odd one out" },
];

const AGES = [4, 5, 6, 7, 8, 9, 10, 11, 12];
const SAMPLES_PER_CATEGORY = 6;

export function ChallengePreviewer() {
  const [age, setAge] = useState(8);
  // Bumping the seed re-rolls every sample (generateChallenge is random).
  const [seed, setSeed] = useState(0);
  const [previewCategory, setPreviewCategory] = useState<
    "auto" | ChallengeCategory
  >("auto");
  const [preview, setPreview] = useState<Challenge | null>(null);
  const [previewResult, setPreviewResult] = useState<boolean | null>(null);

  const tier = tierForAge(age);

  // Generate a fresh sample sheet whenever age or seed changes.
  const sheet = useMemo(() => {
    void seed; // dep only — forces regeneration on "Regenerate"
    return CATEGORIES.map((cat) => ({
      cat,
      samples: Array.from({ length: SAMPLES_PER_CATEGORY }, () =>
        generateChallenge({ age, category: cat.value }),
      ),
    }));
  }, [age, seed]);

  function openPreview() {
    setPreviewResult(null);
    setPreview(generateChallenge({ age, category: previewCategory }));
  }

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p className="font-handwritten text-base text-accent-deep">
            Challenges
          </p>
          <span className="rounded-pill bg-paper-deep/40 px-2 py-0.5 text-xs text-ink-soft">
            preview only · generated live
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openPreview}
            className="rounded-pill bg-accent-deep px-3 py-1 text-sm font-medium text-paper hover:opacity-90"
          >
            ▶ In-game preview
          </button>
          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className="rounded-pill bg-paper-deep/60 px-3 py-1 text-sm text-ink-soft hover:bg-paper-deep"
          >
            ↻ Regenerate
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
            {TIER_LABELS[tier]}
          </span>
          <label className="ml-auto flex items-center gap-2 text-xs text-ink-soft">
            Preview category:
            <select
              value={previewCategory}
              onChange={(e) =>
                setPreviewCategory(e.target.value as "auto" | ChallengeCategory)
              }
              className="rounded-pill border border-ink-soft/20 bg-paper px-2 py-1 text-sm text-ink"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mb-3 text-xs text-ink-soft/70">
          Difficulty is driven by the story&apos;s age range (midpoint).
          &ldquo;Auto&rdquo; shows what the game actually picks for this age; the
          named categories force that type (numbers still clamped to the tier).
          Correct answers are{" "}
          <span className="font-semibold text-emerald">highlighted</span>.
        </p>

        {/* Sample sheet — one card per category. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sheet.map(({ cat, samples }) => (
            <div
              key={cat.value}
              className="rounded-card-lg bg-paper ring-1 ring-ink-soft/10"
            >
              <div className="flex items-center justify-between border-b border-ink-soft/10 px-3 py-2">
                <p className="text-sm font-semibold text-ink">{cat.label}</p>
                <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 text-[10px] text-ink-soft/70">
                  {cat.value}
                </code>
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

      {/* In-game preview overlay — the real component the player sees. */}
      {preview && (
        <div className="fixed inset-0 z-[80] bg-ink/85 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="absolute right-4 top-4 z-[90] rounded-pill bg-paper/90 px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper"
            style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}
          >
            ✕ Close
          </button>
          <div className="absolute left-1/2 top-4 z-[90] flex -translate-x-1/2 items-center gap-2">
            <button
              type="button"
              onClick={openPreview}
              className="rounded-pill bg-accent-deep px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90"
            >
              ↻ New problem
            </button>
            {previewResult !== null && (
              <span
                className={`rounded-pill px-3 py-1.5 text-sm font-semibold ${
                  previewResult
                    ? "bg-emerald/20 text-emerald"
                    : "bg-ruby/15 text-ruby"
                }`}
              >
                {previewResult ? "✓ Correct" : "✗ Wrong"}
              </span>
            )}
          </div>
          <EducationalChallenge
            key={`${age}-${previewCategory}-${preview.prompt}`}
            mode="gate"
            challenge={preview}
            onSolved={(correct) => setPreviewResult(correct)}
          />
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
