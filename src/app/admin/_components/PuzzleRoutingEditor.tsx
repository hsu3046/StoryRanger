"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  PuzzleRoutingSchema,
  type PuzzleRoutingT,
} from "@/data/schemas";
import { savePuzzleRoutingAction } from "../_actions/saveJson";

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
  initial: PuzzleRoutingT;
}

export function PuzzleRoutingEditor({ storyId, initial }: Props) {
  const router = useRouter();
  const [routing, setRouting] = useState<PuzzleRoutingT>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
        attackerKinds: {
          ...prev.attackerKinds,
          [attacker]: ordered,
        },
      };
    });
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
          <p className="font-handwritten text-base text-accent-deep">
            {storyId} / Puzzle routing
          </p>
          <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 font-mono text-[10px] text-ink-soft/70">
            → puzzle-routing.json
          </code>
          <span className="text-xs text-ink-soft/70">
            attacker × puzzle-kind
          </span>
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

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            Toggle which puzzle categories each attacker can draw from. Saves to{" "}
            <code>puzzle-routing.json</code>.
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
                              onClick={() => toggle(a, k)}
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
                <strong>Companion attacks:</strong> picks randomly from the
                kinds enabled here for that attacker.
              </li>
              <li>Each attacker must have ≥ 1 kind enabled.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
