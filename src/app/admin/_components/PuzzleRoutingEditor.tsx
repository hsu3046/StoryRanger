"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  PuzzleRoutingSchema,
  type PuzzleRoutingT,
  type PuzzleGeneratorsT,
} from "@/data/schemas";
import { savePuzzleRoutingAction } from "../_actions/saveJson";
import { DEFAULT_GENERATORS, generatePuzzle } from "@/lib/puzzle";

type AttackerId = "hero" | "scarecrow" | "tinman" | "lion";
const ATTACKERS: AttackerId[] = ["hero", "scarecrow", "tinman", "lion"];
const PUZZLE_KINDS = [
  "add-1d",
  "sub-1d",
  "add-2d",
  "multiply",
  "pattern",
  "odd-out",
  "bigger",
  "missing",
] as const;
type PuzzleKind = (typeof PUZZLE_KINDS)[number];

interface Props {
  storyId: string;
  storyTitle?: string;
  initial: PuzzleRoutingT;
}

type Tab = "routing" | "generators";

export function PuzzleRoutingEditor({ storyId, storyTitle, initial }: Props) {
  const router = useRouter();
  const [routing, setRouting] = useState<PuzzleRoutingT>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("routing");

  const dirty = JSON.stringify(initial) !== JSON.stringify(routing);

  function toggle(attacker: AttackerId, kind: PuzzleKind) {
    setRouting((prev) => {
      const current = new Set<PuzzleKind>(
        (prev.attackerKinds[attacker] ?? []) as PuzzleKind[],
      );
      if (current.has(kind)) current.delete(kind);
      else current.add(kind);
      const ordered = PUZZLE_KINDS.filter((k) => current.has(k));
      return {
        ...prev,
        attackerKinds: {
          ...prev.attackerKinds,
          [attacker]: ordered,
        },
      };
    });
  }

  function updateGenerators(
    mut: (g: PuzzleGeneratorsT) => PuzzleGeneratorsT,
  ) {
    setRouting((prev) => ({
      ...prev,
      generators: mut(prev.generators ?? {}),
    }));
  }

  function save() {
    setError(null);
    const parsed = PuzzleRoutingSchema.safeParse(routing);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Validation failed");
      return;
    }
    for (const a of ATTACKERS) {
      if (!routing.attackerKinds[a] || routing.attackerKinds[a].length === 0) {
        setError(`${a} must have at least one puzzle kind`);
        return;
      }
    }
    startTransition(async () => {
      const res = await savePuzzleRoutingAction(storyId, routing);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p
            className="font-handwritten text-base text-accent-deep"
            title={storyId}
          >
            {storyTitle ?? storyId} / Puzzles
          </p>
          <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 font-mono text-[10px] text-ink-soft/70">
            puzzle-routing.json
          </code>
          {dirty && (
            <span className="rounded-pill bg-accent/15 px-2 py-0.5 text-xs text-accent-deep">
              unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-sm text-ruby">⚠ {error}</span>}
          <button
            type="button"
            onClick={() => {
              setRouting(initial);
              setError(null);
            }}
            disabled={!dirty || isPending}
            className="rounded-pill bg-paper-deep/60 px-3 py-1 text-sm text-ink-soft hover:bg-paper-deep disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || isPending}
            className="rounded-pill bg-emerald px-3 py-1 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-ink-soft/10 bg-paper px-4">
        {(["routing", "generators"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`relative px-3 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "text-accent-deep"
                : "text-ink-soft/70 hover:text-ink"
            }`}
          >
            {t === "routing" ? "Routing" : "Generators"}
            {tab === t && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent-deep" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === "routing" ? (
          <RoutingPane routing={routing} onToggle={toggle} />
        ) : (
          <GeneratorsPane
            generators={routing.generators ?? {}}
            onChange={updateGenerators}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Routing tab — attacker × kind matrix (existing UI, lifted out)
// ─────────────────────────────────────────────────────────────

function RoutingPane({
  routing,
  onToggle,
}: {
  routing: PuzzleRoutingT;
  onToggle: (a: AttackerId, k: PuzzleKind) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">
        Toggle which puzzle categories each attacker can draw from.
      </p>

      <div className="overflow-x-auto rounded-card-lg bg-paper ring-1 ring-ink-soft/10">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-ink-soft/10 bg-paper-deep/20 text-left">
            <tr>
              <th className="px-3 py-2 font-semibold text-ink">Attacker</th>
              {PUZZLE_KINDS.map((k) => (
                <th
                  key={k}
                  className="px-2 py-2 text-center font-mono text-xs text-ink-soft"
                >
                  {k}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs text-ink-soft">
                count
              </th>
            </tr>
          </thead>
          <tbody>
            {ATTACKERS.map((a) => {
              const set = new Set<string>(routing.attackerKinds[a] ?? []);
              return (
                <tr
                  key={a}
                  className="border-b border-ink-soft/5 last:border-0"
                >
                  <td className="px-3 py-2 font-semibold capitalize text-ink">
                    {a}
                  </td>
                  {PUZZLE_KINDS.map((k) => {
                    const on = set.has(k);
                    return (
                      <td key={k} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => onToggle(a, k)}
                          aria-pressed={on}
                          className={`h-7 w-7 rounded-full transition-all active:scale-90 ${
                            on
                              ? "bg-accent-deep ring-2 ring-accent/40"
                              : "bg-paper-deep/30 hover:bg-paper-deep/50"
                          }`}
                          title={`${a} × ${k}`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums text-ink-soft">
                    {set.size}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-card-lg bg-paper-deep/30 p-4 text-sm text-ink-soft">
        <p className="font-semibold text-ink">How the routing is used</p>
        <ul className="mt-1 list-disc pl-5">
          <li>
            <strong>Hero attacks:</strong> uses the target monster&apos;s{" "}
            <code>puzzleKind</code> (overrides this matrix).
          </li>
          <li>
            <strong>Companion attacks:</strong> picks randomly from the kinds
            enabled here for that attacker.
          </li>
          <li>Each attacker must have ≥ 1 kind enabled.</li>
        </ul>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Generators tab — per-kind range / spread editor
// ─────────────────────────────────────────────────────────────

function GeneratorsPane({
  generators,
  onChange,
}: {
  generators: PuzzleGeneratorsT;
  onChange: (mut: (g: PuzzleGeneratorsT) => PuzzleGeneratorsT) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        Tune the numeric ranges + distractor spread per puzzle kind. Tap{" "}
        <span className="italic">Sample</span> on a card to roll a few
        puzzles with the current settings.
      </p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <NumericRangeCard
          kind="add-1d"
          label="1-digit addition"
          formula="a + b = ?"
          cfg={generators["add-1d"] ?? DEFAULT_GENERATORS["add-1d"]}
          generators={generators}
          onChange={(next) =>
            onChange((g) => ({ ...g, "add-1d": next }))
          }
        />
        <NumericRangeCard
          kind="sub-1d"
          label="1-digit subtraction"
          formula="a − b = ?"
          cfg={generators["sub-1d"] ?? DEFAULT_GENERATORS["sub-1d"]}
          generators={generators}
          onChange={(next) =>
            onChange((g) => ({ ...g, "sub-1d": next }))
          }
        />
        <NumericRangeCard
          kind="add-2d"
          label="2-digit addition"
          formula="a + b = ?"
          cfg={generators["add-2d"] ?? DEFAULT_GENERATORS["add-2d"]}
          generators={generators}
          onChange={(next) =>
            onChange((g) => ({ ...g, "add-2d": next }))
          }
        />
        <MultiplyCard
          cfg={generators.multiply ?? DEFAULT_GENERATORS.multiply}
          generators={generators}
          onChange={(next) =>
            onChange((g) => ({ ...g, multiply: next }))
          }
        />
        <PatternCard
          cfg={generators.pattern ?? DEFAULT_GENERATORS.pattern}
          generators={generators}
          onChange={(next) =>
            onChange((g) => ({ ...g, pattern: next }))
          }
        />
        <OddOutCard
          cfg={generators["odd-out"] ?? DEFAULT_GENERATORS["odd-out"]}
          generators={generators}
          onChange={(next) =>
            onChange((g) => ({ ...g, "odd-out": next }))
          }
        />
        <BiggerCard
          cfg={generators.bigger ?? DEFAULT_GENERATORS.bigger}
          generators={generators}
          onChange={(next) =>
            onChange((g) => ({ ...g, bigger: next }))
          }
        />
        <MissingCard
          cfg={generators.missing ?? DEFAULT_GENERATORS.missing}
          generators={generators}
          onChange={(next) =>
            onChange((g) => ({ ...g, missing: next }))
          }
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Per-kind cards
// ─────────────────────────────────────────────────────────────

interface CardChrome {
  kind: PuzzleKind;
  title: string;
  formula: string;
  generators: PuzzleGeneratorsT;
  children: React.ReactNode;
}

function GenCard({
  kind,
  title,
  formula,
  generators,
  children,
}: CardChrome) {
  return (
    <div className="rounded-card-lg bg-paper p-3 ring-1 ring-ink-soft/10">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{title}</p>
          <code className="text-[11px] text-ink-soft">{kind}</code>
        </div>
        <code className="text-xs text-ink-soft/70">{formula}</code>
      </div>
      {children}
      <SamplePreview kind={kind} generators={generators} />
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase text-ink-soft">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.floor(v));
        }}
        className="w-full rounded-button bg-paper-deep/40 px-2 py-1 text-sm text-ink ring-1 ring-ink-soft/10 focus:outline-none focus:ring-accent/50"
      />
    </label>
  );
}

function NumericRangeCard({
  kind,
  label,
  formula,
  cfg,
  generators,
  onChange,
}: {
  kind: "add-1d" | "sub-1d" | "add-2d";
  label: string;
  formula: string;
  cfg: { min: number; max: number; spread: number };
  generators: PuzzleGeneratorsT;
  onChange: (next: { min: number; max: number; spread: number }) => void;
}) {
  return (
    <GenCard
      kind={kind}
      title={label}
      formula={formula}
      generators={generators}
    >
      <div className="grid grid-cols-3 gap-2">
        <NumInput
          label="min"
          value={cfg.min}
          onChange={(v) => onChange({ ...cfg, min: v })}
        />
        <NumInput
          label="max"
          value={cfg.max}
          onChange={(v) => onChange({ ...cfg, max: v })}
        />
        <NumInput
          label="spread (distractor)"
          value={cfg.spread}
          min={1}
          onChange={(v) => onChange({ ...cfg, spread: Math.max(1, v) })}
        />
      </div>
    </GenCard>
  );
}

function MultiplyCard({
  cfg,
  generators,
  onChange,
}: {
  cfg: {
    aMin: number;
    aMax: number;
    bMin: number;
    bMax: number;
    spread: number;
  };
  generators: PuzzleGeneratorsT;
  onChange: (next: {
    aMin: number;
    aMax: number;
    bMin: number;
    bMax: number;
    spread: number;
  }) => void;
}) {
  return (
    <GenCard
      kind="multiply"
      title="Multiplication"
      formula="a × b = ?"
      generators={generators}
    >
      <div className="grid grid-cols-5 gap-2">
        <NumInput
          label="a min"
          value={cfg.aMin}
          min={1}
          onChange={(v) => onChange({ ...cfg, aMin: Math.max(1, v) })}
        />
        <NumInput
          label="a max"
          value={cfg.aMax}
          min={1}
          onChange={(v) => onChange({ ...cfg, aMax: Math.max(1, v) })}
        />
        <NumInput
          label="b min"
          value={cfg.bMin}
          min={1}
          onChange={(v) => onChange({ ...cfg, bMin: Math.max(1, v) })}
        />
        <NumInput
          label="b max"
          value={cfg.bMax}
          min={1}
          onChange={(v) => onChange({ ...cfg, bMax: Math.max(1, v) })}
        />
        <NumInput
          label="spread"
          value={cfg.spread}
          min={1}
          onChange={(v) => onChange({ ...cfg, spread: Math.max(1, v) })}
        />
      </div>
    </GenCard>
  );
}

function PatternCard({
  cfg,
  generators,
  onChange,
}: {
  cfg: {
    startMin: number;
    startMax: number;
    steps: number[];
    spread: number;
  };
  generators: PuzzleGeneratorsT;
  onChange: (next: {
    startMin: number;
    startMax: number;
    steps: number[];
    spread: number;
  }) => void;
}) {
  const [stepsText, setStepsText] = useState(cfg.steps.join(", "));
  // Resync the textarea when cfg.steps changes from OUTSIDE this card
  // (Discard / external save load). When the change came from the user's
  // own keystroke, the parsed result equals cfg.steps so we keep the raw
  // text (preserves whitespace + partial typing like "1, ").
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: external→input sync when cfg.steps mutates outside this card (Discard / load)
    setStepsText((cur) => {
      const parsedFromCur = cur
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 1);
      const sameAsCfg =
        parsedFromCur.length === cfg.steps.length &&
        parsedFromCur.every((n, i) => n === cfg.steps[i]);
      return sameAsCfg ? cur : cfg.steps.join(", ");
    });
  }, [cfg.steps]);
  return (
    <GenCard
      kind="pattern"
      title="Number pattern"
      formula="a, a+s, a+2s, ?"
      generators={generators}
    >
      <div className="grid grid-cols-3 gap-2">
        <NumInput
          label="start min"
          value={cfg.startMin}
          onChange={(v) => onChange({ ...cfg, startMin: v })}
        />
        <NumInput
          label="start max"
          value={cfg.startMax}
          onChange={(v) => onChange({ ...cfg, startMax: v })}
        />
        <NumInput
          label="spread"
          value={cfg.spread}
          min={1}
          onChange={(v) => onChange({ ...cfg, spread: Math.max(1, v) })}
        />
      </div>
      <label className="mt-2 flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase text-ink-soft">
          Steps (comma-separated — repeat a value to weight it)
        </span>
        <input
          type="text"
          value={stepsText}
          onChange={(e) => {
            setStepsText(e.target.value);
            const parsed = e.target.value
              .split(",")
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => Number.isFinite(n) && n >= 1);
            if (parsed.length > 0) onChange({ ...cfg, steps: parsed });
          }}
          placeholder="1, 2, 2, 3, 5"
          className="w-full rounded-button bg-paper-deep/40 px-2 py-1 text-sm text-ink ring-1 ring-ink-soft/10 focus:outline-none focus:ring-accent/50"
        />
      </label>
    </GenCard>
  );
}

function OddOutCard({
  cfg,
  generators,
  onChange,
}: {
  cfg: { max: number };
  generators: PuzzleGeneratorsT;
  onChange: (next: { max: number }) => void;
}) {
  return (
    <GenCard
      kind="odd-out"
      title="Odd one out"
      formula="3 evens + 1 odd"
      generators={generators}
    >
      <div className="grid grid-cols-1 gap-2">
        <NumInput
          label="max (numbers go up to ~2× this)"
          value={cfg.max}
          min={1}
          onChange={(v) => onChange({ max: Math.max(1, v) })}
        />
      </div>
    </GenCard>
  );
}

function BiggerCard({
  cfg,
  generators,
  onChange,
}: {
  cfg: { min: number; max: number };
  generators: PuzzleGeneratorsT;
  onChange: (next: { min: number; max: number }) => void;
}) {
  return (
    <GenCard
      kind="bigger"
      title="Pick the bigger number"
      formula="a vs b"
      generators={generators}
    >
      <div className="grid grid-cols-2 gap-2">
        <NumInput
          label="min"
          value={cfg.min}
          onChange={(v) => onChange({ ...cfg, min: v })}
        />
        <NumInput
          label="max"
          value={cfg.max}
          onChange={(v) => onChange({ ...cfg, max: v })}
        />
      </div>
    </GenCard>
  );
}

function MissingCard({
  cfg,
  generators,
  onChange,
}: {
  cfg: {
    ansMin: number;
    ansMax: number;
    addMin: number;
    addMax: number;
    spread: number;
  };
  generators: PuzzleGeneratorsT;
  onChange: (next: {
    ansMin: number;
    ansMax: number;
    addMin: number;
    addMax: number;
    spread: number;
  }) => void;
}) {
  return (
    <GenCard
      kind="missing"
      title="Missing addend"
      formula="known + ? = total"
      generators={generators}
    >
      <div className="grid grid-cols-5 gap-2">
        <NumInput
          label="answer min"
          value={cfg.ansMin}
          onChange={(v) => onChange({ ...cfg, ansMin: v })}
        />
        <NumInput
          label="answer max"
          value={cfg.ansMax}
          onChange={(v) => onChange({ ...cfg, ansMax: v })}
        />
        <NumInput
          label="addend min"
          value={cfg.addMin}
          onChange={(v) => onChange({ ...cfg, addMin: v })}
        />
        <NumInput
          label="addend max"
          value={cfg.addMax}
          onChange={(v) => onChange({ ...cfg, addMax: v })}
        />
        <NumInput
          label="spread"
          value={cfg.spread}
          min={1}
          onChange={(v) => onChange({ ...cfg, spread: Math.max(1, v) })}
        />
      </div>
    </GenCard>
  );
}

function SamplePreview({
  kind,
  generators,
}: {
  kind: PuzzleKind;
  generators: PuzzleGeneratorsT;
}) {
  const [seed, setSeed] = useState(0);
  // Re-roll 3 samples whenever `seed` bumps (Re-roll click) OR generators
  // change. `seed` is in deps purely to invalidate the memo on roll.
  const samples = useMemo(() => {
    return Array.from({ length: 3 }, () => {
      try {
        return generatePuzzle(kind, "easy", generators);
      } catch (err) {
        return {
          kind,
          question: `⚠ ${err instanceof Error ? err.message : "bad config"}`,
          choices: [],
          correctIndex: -1,
        };
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed is intentionally a memo-busting counter; lint can't see the dataflow
  }, [seed, generators, kind]);

  return (
    <div className="mt-2 rounded-button bg-paper-deep/20 p-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase text-ink-soft">
          Sample puzzles
        </p>
        <button
          type="button"
          onClick={() => setSeed((s) => s + 1)}
          className="rounded-pill bg-paper-deep/50 px-2 py-0.5 text-[10px] text-ink-soft hover:bg-paper-deep"
        >
          🎲 Re-roll
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {samples.map((p, i) => (
          <li key={i} className="text-xs text-ink-soft">
            <code className="font-mono">{p.question}</code>{" "}
            <span className="text-ink-soft/60">
              {p.choices.length > 0
                ? `→ ${p.choices.join(" / ")} (answer: ${p.choices[p.correctIndex]})`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
