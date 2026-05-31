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
import { useNameLinkedId } from "../_lib/useNameLinkedId";
import { AssetThumb } from "./AssetThumb";
import { ClickableImageThumb } from "./ClickableImageThumb";
import { useConfirm } from "./ConfirmDialog";
import { Field, StyledSelect, inputCls } from "./form";
import { ItemChipPicker } from "./ItemChipPicker";

const TYPES = ["hostile", "neutral", "friendly"] as const;
const SIZES = ["tiny", "small", "medium", "large", "huge"] as const;
interface Props {
  storyId: string;
  storyTitle?: string;
  initial: MonsterStatsT[];
  itemCatalog: ItemDefT[];
  /** Server-side resolved portrait paths keyed by monster id. */
  assetMap?: Record<string, string | null>;
  /** Image stems scanned from /public/stories/<id>/monsters/. Drives
   *  the in-form image picker. */
  imageOptions: { value: string; label: string }[];
}

function monsterImageBase(storyId: string, monsterId: string): string {
  return `/stories/${storyId}/monsters/${monsterId}`;
}

export function MonstersEditor({
  storyId,
  storyTitle,
  initial,
  itemCatalog,
  assetMap,
  imageOptions,
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [monsters, setMonsters] = useState<MonsterStatsT[]>(initial);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // New monsters' ids auto-follow their name until saved / hand-edited.
  const idLink = useNameLinkedId();

  const dirty = useMemo(
    () => JSON.stringify(initial) !== JSON.stringify(monsters),
    [initial, monsters],
  );

  const selected =
    selectedIdx !== null && selectedIdx < monsters.length
      ? monsters[selectedIdx]
      : null;

  // id → item definition, so the Drops column can render the same
  // icon + name as the inspector instead of the raw id.
  const itemById = useMemo(
    () => new Map(itemCatalog.map((it) => [it.id, it])),
    [itemCatalog],
  );

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
    // Committed → freeze all ids (renaming must never rewrite a saved id).
    idLink.reset();
    startTransition(async () => {
      const res = await saveMonstersAction(storyId, payload);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function startCreate() {
    const id = `new-monster-${monsters.length + 1}`;
    const placeholder: MonsterStatsT = {
      id,
      name: "New Monster",
      type: "hostile",
      hits: 2,
      size: "small",
      drops: [],
    };
    setMonsters((prev) => [...prev, placeholder]);
    setSelectedIdx(monsters.length);
    idLink.register(id);
    setError(null);
  }

  function updateSelected(mut: (m: MonsterStatsT) => MonsterStatsT) {
    if (selectedIdx === null) return;
    setMonsters((prev) =>
      prev.map((m, i) => (i === selectedIdx ? mut(m) : m)),
    );
  }

  /** Name edit — retargets the id while it's auto-linked (new drafts). */
  function changeName(value: string) {
    if (selectedIdx === null) return;
    const cur = monsters[selectedIdx];
    const others = monsters
      .filter((_, i) => i !== selectedIdx)
      .map((m) => m.id);
    const newId = idLink.fromName(cur.id, value, others);
    updateSelected((m) => ({ ...m, name: value, ...(newId ? { id: newId } : {}) }));
  }

  /** Manual id edit — takes the id off auto-follow. */
  function changeId(value: string) {
    if (selectedIdx === null) return;
    idLink.detach(monsters[selectedIdx].id);
    updateSelected((m) => ({ ...m, id: value }));
  }

  async function deleteSelected() {
    if (selectedIdx === null) return;
    const m = monsters[selectedIdx];
    const ok = await confirm({
      title: "Delete monster",
      message: `Delete monster "${m.name}"?\nThis cannot be undone.`,
    });
    if (!ok) return;
    idLink.detach(m.id);
    setMonsters((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  }

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      {/* Header — actions live here, Story Graph style */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p
            className="font-handwritten text-base text-accent-deep"
            title={storyId}
          >
            {storyTitle ?? storyId} / Monsters
          </p>
          <span className="rounded-pill bg-paper-deep/40 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
            {monsters.length}
          </span>
          <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 font-mono text-[10px] text-ink-soft/70">
            monsters.json
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
              idLink.reset();
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
        {/* Clicking empty space in the list pane closes the inspector. Row
            clicks stopPropagation so selecting doesn't immediately re-close. */}
        <div
          className="flex-1 overflow-y-auto px-4 py-3"
          onClick={() => setSelectedIdx(null)}
        >
          <div className="overflow-x-auto rounded-card-lg bg-paper ring-1 ring-ink-soft/10">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-ink-soft/10 bg-paper-deep/20 text-left">
                <tr>
                  <th className="px-3 py-2 w-14"></th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 w-20">Type</th>
                  <th className="px-3 py-2 w-20">Size</th>
                  <th className="px-3 py-2 w-16">HP</th>
                  <th className="px-3 py-2 w-20">Airborne</th>
                  <th className="px-3 py-2">Drops</th>
                </tr>
              </thead>
              <tbody>
                {monsters.map((m, i) => (
                  <tr
                    key={`${m.id}-${i}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIdx(i);
                    }}
                    className={`cursor-pointer border-b border-ink-soft/5 last:border-0 transition-colors ${
                      selectedIdx === i
                        ? "bg-accent/15 hover:bg-accent/20"
                        : "hover:bg-paper-deep/15"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <AssetThumb
                        base={m.image ?? monsterImageBase(storyId, m.id)}
                        resolvedSrc={assetMap?.[m.id] ?? undefined}
                        alt={m.name}
                        className="h-12 w-12 p-1"
                        shape="circle"
                        fit="contain"
                      />
                    </td>
                    <td className="px-3 py-2 text-ink">{m.name}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-pill px-2 py-0.5 text-xs capitalize ${
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
                    <td className="px-3 py-2 capitalize text-ink-soft">{m.size}</td>
                    <td className="px-3 py-2 tabular-nums">{m.hits}</td>
                    <td className="px-3 py-2 text-ink-soft">
                      {m.airborne ? "🕊️ Yes" : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(m.drops ?? []).map((d) => {
                          const it = itemById.get(d);
                          return (
                            <span
                              key={d}
                              className="rounded-pill bg-paper-deep/40 px-1.5 py-0.5 text-xs text-ink"
                            >
                              {it?.icon ?? "🎁"} {it?.name ?? d}
                            </span>
                          );
                        })}
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
              storyId={storyId}
              monster={selected}
              isNew={!initial.some((m) => m.id === selected.id)}
              itemCatalog={itemCatalog}
              imageOptions={imageOptions}
              onChange={updateSelected}
              onNameChange={changeName}
              onIdChange={changeId}
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
  storyId,
  monster,
  isNew,
  itemCatalog,
  imageOptions,
  onChange,
  onNameChange,
  onIdChange,
  onDelete,
  onClose,
}: {
  storyId: string;
  monster: MonsterStatsT;
  isNew: boolean;
  itemCatalog: ItemDefT[];
  imageOptions: { value: string; label: string }[];
  onChange: (mut: (m: MonsterStatsT) => MonsterStatsT) => void;
  onNameChange: (value: string) => void;
  onIdChange: (value: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const dropSet = new Set(monster.drops ?? []);
  const defaultImageBase = `/stories/${storyId}/monsters/${monster.id}`;
  const currentImagePath = monster.image ?? defaultImageBase;

  function toggleDrop(itemId: string) {
    const next = new Set(dropSet);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    onChange((m) => ({ ...m, drops: Array.from(next) }));
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <p className="font-handwritten text-base text-accent-deep">Monster</p>
        <div className="flex gap-1">
          {isNew && (
            <input
              value={monster.id}
              onChange={(e) => onIdChange(e.target.value)}
              placeholder="id"
              className={`${inputCls} max-w-[10rem]`}
            />
          )}
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

      <Field label="Name">
        <input
          value={monster.name}
          onChange={(e) => onNameChange(e.target.value)}
          className={inputCls}
        />
      </Field>

      <Field label="Image">
        <div className="flex items-start gap-3">
          <ClickableImageThumb
            base={currentImagePath}
            alt={monster.name}
            className="h-20 w-20 shrink-0"
            shape="square"
            fit="contain"
          />
          <StyledSelect
            className="flex-1"
            value={currentImagePath}
            onChange={(e) => {
              const v = e.target.value;
              onChange((m) => ({
                ...m,
                image: v === defaultImageBase ? undefined : v,
              }));
            }}
          >
            {!imageOptions.some((o) => o.value === currentImagePath) && (
              <option value={currentImagePath}>
                {currentImagePath.split("/").pop() ?? currentImagePath} (custom)
              </option>
            )}
            {imageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </StyledSelect>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <StyledSelect
            value={monster.type}
            onChange={(e) =>
              onChange((m) => ({
                ...m,
                type: e.target.value as MonsterStatsT["type"],
              }))
            }
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </StyledSelect>
        </Field>
        <Field label="Size">
          <StyledSelect
            value={monster.size}
            onChange={(e) =>
              onChange((m) => ({
                ...m,
                size: e.target.value as MonsterStatsT["size"],
              }))
            }
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </StyledSelect>
        </Field>
        <Field label="HP">
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
      <Field label="Drops">
        <ItemChipPicker
          catalog={itemCatalog}
          selected={monster.drops ?? []}
          onToggle={toggleDrop}
        />
      </Field>
    </div>
  );
}
