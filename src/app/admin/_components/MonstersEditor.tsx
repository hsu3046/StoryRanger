"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  MonstersFileSchema,
  type ItemDefT,
  type MonsterStatsT,
  type MonstersFileT,
} from "@/data/schemas";
import { saveMonstersAction } from "../_actions/saveJson";
import { AssetThumb } from "./AssetThumb";

const TYPES = ["hostile", "neutral", "friendly"] as const;
const SIZES = ["tiny", "small", "medium", "large", "huge"] as const;
const PUZZLES = [
  "add-1d",
  "sub-1d",
  "add-2d",
  "multiply",
  "pattern",
  "odd-out",
  "bigger",
  "missing",
] as const;

interface Props {
  storyId: string;
  initial: MonsterStatsT[];
  itemCatalog: ItemDefT[];
  /** Server-side resolved portrait paths keyed by monster id. */
  assetMap?: Record<string, string | null>;
}

function monsterImageBase(storyId: string, monsterId: string): string {
  return `/stories/${storyId}/monsters/${monsterId}`;
}

export function MonstersEditor({
  storyId,
  initial,
  itemCatalog,
  assetMap,
}: Props) {
  const router = useRouter();
  const [monsters, setMonsters] = useState<MonsterStatsT[]>(initial);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = useMemo(
    () => JSON.stringify(initial) !== JSON.stringify(monsters),
    [initial, monsters],
  );

  const selected =
    selectedIdx !== null && selectedIdx < monsters.length
      ? monsters[selectedIdx]
      : null;

  function save() {
    setError(null);
    const payload: MonstersFileT = { monsters };
    const parsed = MonstersFileSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Validation failed");
      return;
    }
    // ID uniqueness (Zod won't catch duplicate keys at this level)
    const ids = new Set<string>();
    for (const m of monsters) {
      if (ids.has(m.id)) {
        setError(`Duplicate monster id: ${m.id}`);
        return;
      }
      ids.add(m.id);
    }
    startTransition(async () => {
      const res = await saveMonstersAction(storyId, payload);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function startCreate() {
    const placeholder: MonsterStatsT = {
      id: `new-monster-${monsters.length + 1}`,
      name: "New Monster",
      type: "hostile",
      hits: 2,
      size: "small",
      drops: [],
    };
    setMonsters((prev) => [...prev, placeholder]);
    setSelectedIdx(monsters.length);
    setError(null);
  }

  function updateSelected(mut: (m: MonsterStatsT) => MonsterStatsT) {
    if (selectedIdx === null) return;
    setMonsters((prev) =>
      prev.map((m, i) => (i === selectedIdx ? mut(m) : m)),
    );
  }

  function deleteSelected() {
    if (selectedIdx === null) return;
    const m = monsters[selectedIdx];
    if (!confirm(`Delete monster "${m.id}"?`)) return;
    setMonsters((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  }

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      {/* Header — actions live here, Story Graph style */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p className="font-handwritten text-base text-accent-deep">
            {storyId} / Monsters
          </p>
          <span className="rounded-pill bg-paper-deep/40 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
            {monsters.length}
          </span>
          <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 font-mono text-[10px] text-ink-soft/70">
            → monsters.json
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
            onClick={startCreate}
            disabled={isPending}
            className="rounded-pill bg-accent-deep px-3 py-1 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
          >
            + Monster
          </button>
          <button
            type="button"
            onClick={() => {
              setMonsters(initial);
              setSelectedIdx(null);
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

      <div className="flex flex-1 overflow-hidden">
        {/* Table */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="overflow-x-auto rounded-card-lg bg-paper ring-1 ring-ink-soft/10">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-ink-soft/10 bg-paper-deep/20 text-left">
                <tr>
                  <th className="px-3 py-2 w-14"></th>
                  <th className="px-3 py-2 w-40">ID</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 w-20">Type</th>
                  <th className="px-3 py-2 w-20">Size</th>
                  <th className="px-3 py-2 w-16">Hits</th>
                  <th className="px-3 py-2 w-24">Puzzle</th>
                  <th className="px-3 py-2">Drops</th>
                </tr>
              </thead>
              <tbody>
                {monsters.map((m, i) => (
                  <tr
                    key={`${m.id}-${i}`}
                    onClick={() => setSelectedIdx(i)}
                    className={`cursor-pointer border-b border-ink-soft/5 last:border-0 transition-colors ${
                      selectedIdx === i
                        ? "bg-accent/15 hover:bg-accent/20"
                        : "hover:bg-paper-deep/15"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <AssetThumb
                        base={monsterImageBase(storyId, m.id)}
                        resolvedSrc={assetMap?.[m.id] ?? undefined}
                        alt={m.name}
                        className="h-12 w-12 p-1"
                        shape="circle"
                        fit="contain"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <code className="text-ink">{m.id}</code>
                    </td>
                    <td className="px-3 py-2 text-ink">{m.name}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-pill px-2 py-0.5 text-xs ${
                          m.type === "hostile"
                            ? "bg-ruby/15 text-ruby"
                            : m.type === "friendly"
                              ? "bg-emerald/15 text-emerald"
                              : "bg-accent/15 text-accent-deep"
                        }`}
                      >
                        {m.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{m.size}</td>
                    <td className="px-3 py-2 tabular-nums">{m.hits}</td>
                    <td className="px-3 py-2 text-ink-soft">
                      {m.puzzleKind ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(m.drops ?? []).map((d) => (
                          <code
                            key={d}
                            className="rounded-pill bg-paper-deep/40 px-1.5 py-0.5 text-xs"
                          >
                            {d}
                          </code>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inspector */}
        {selected && (
          <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-ink-soft/10 bg-paper p-4">
            <MonsterForm
              monster={selected}
              isNew={!initial.some((m) => m.id === selected.id)}
              itemCatalog={itemCatalog}
              onChange={updateSelected}
              onDelete={deleteSelected}
              onClose={() => setSelectedIdx(null)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function MonsterForm({
  monster,
  isNew,
  itemCatalog,
  onChange,
  onDelete,
  onClose,
}: {
  monster: MonsterStatsT;
  isNew: boolean;
  itemCatalog: ItemDefT[];
  onChange: (mut: (m: MonsterStatsT) => MonsterStatsT) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const dropSet = new Set(monster.drops ?? []);

  function toggleDrop(itemId: string) {
    const next = new Set(dropSet);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    onChange((m) => ({ ...m, drops: Array.from(next) }));
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-handwritten text-base text-accent-deep">Monster</p>
          <code className="text-sm text-ink">{monster.id}</code>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill bg-paper-deep/60 px-2 py-0.5 text-xs hover:bg-paper-deep"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-pill bg-ruby/15 px-2 py-0.5 text-xs text-ruby hover:bg-ruby/25"
          >
            Delete
          </button>
        </div>
      </header>

      <Field label="ID">
        <input
          value={monster.id}
          onChange={(e) => onChange((m) => ({ ...m, id: e.target.value }))}
          disabled={!isNew}
          className={`${inputCls} ${!isNew ? "opacity-60" : ""}`}
        />
      </Field>
      <Field label="Name">
        <input
          value={monster.name}
          onChange={(e) => onChange((m) => ({ ...m, name: e.target.value }))}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <select
            value={monster.type}
            onChange={(e) =>
              onChange((m) => ({
                ...m,
                type: e.target.value as MonsterStatsT["type"],
              }))
            }
            className={inputCls}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Size">
          <select
            value={monster.size}
            onChange={(e) =>
              onChange((m) => ({
                ...m,
                size: e.target.value as MonsterStatsT["size"],
              }))
            }
            className={inputCls}
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hits">
          <input
            type="number"
            min={0}
            max={20}
            value={monster.hits}
            onChange={(e) =>
              onChange((m) => ({ ...m, hits: Number(e.target.value) }))
            }
            className={inputCls}
          />
        </Field>
        <Field label="Puzzle kind">
          <select
            value={monster.puzzleKind ?? ""}
            onChange={(e) =>
              onChange((m) => ({
                ...m,
                puzzleKind: (e.target.value ||
                  undefined) as MonsterStatsT["puzzleKind"],
              }))
            }
            className={inputCls}
          >
            <option value="">(none)</option>
            {PUZZLES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Airborne">
        <label className="flex h-9 items-center gap-2">
          <input
            type="checkbox"
            checked={!!monster.airborne}
            onChange={(e) =>
              onChange((m) => ({
                ...m,
                airborne: e.target.checked || undefined,
              }))
            }
          />
          <span className="text-sm text-ink-soft">Lifts off the ground</span>
        </label>
      </Field>
      <Field label="Notes">
        <input
          value={monster.notes ?? ""}
          onChange={(e) =>
            onChange((m) => ({
              ...m,
              notes: e.target.value || undefined,
            }))
          }
          className={inputCls}
        />
      </Field>
      <Field label="Drops (multi-select from item catalog)">
        <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-button bg-paper-deep/40 p-2 ring-1 ring-ink-soft/10">
          {itemCatalog.map((it) => {
            const on = dropSet.has(it.id);
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => toggleDrop(it.id)}
                className={`rounded-pill px-2 py-0.5 text-xs transition-colors ${
                  on
                    ? "bg-accent-deep text-paper"
                    : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                }`}
              >
                {it.icon ?? "🎁"} {it.id}
              </button>
            );
          })}
        </div>
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-button bg-paper-deep/40 px-3 py-1.5 text-sm text-ink ring-1 ring-ink-soft/10 focus:outline-none focus:ring-accent/50";
