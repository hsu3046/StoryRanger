"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  ItemsFileSchema,
  type ItemDefT,
  type ItemEffectKind,
  type ItemEffectT,
  type ItemsFileT,
} from "@/data/schemas";
import { effectLabel } from "@/data/item-effects";
import { saveItemsAction } from "../_actions/saveJson";
import { useConfirm } from "./ConfirmDialog";
import { uniqueId } from "../_lib/uniqueId";
import { Field, StyledSelect, inputCls } from "./form";

/** Effect kinds offered in the editor. Add a kind here + a default + a
 *  field block below when a new effect ships. */
const EFFECT_KINDS = ["heal", "event"] as const satisfies readonly ItemEffectKind[];

const EFFECT_KIND_LABEL: Record<ItemEffectKind, string> = {
  heal: "Restore HP",
  event: "Event",
};

/** Default-shaped effect when switching the kind dropdown. */
function defaultEffect(kind: ItemEffectKind): ItemEffectT {
  switch (kind) {
    case "heal":
      return { kind: "heal", amount: 1 };
    case "event":
      return { kind: "event" };
  }
}

interface Props {
  storyId: string;
  storyTitle?: string;
  initial: ItemDefT[];
  missingRefs?: Array<{ where: string; id: string }>;
}

export function ItemsEditor({
  storyId,
  storyTitle,
  initial,
  missingRefs = [],
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [items, setItems] = useState<ItemDefT[]>(initial);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = useMemo(
    () => JSON.stringify(initial) !== JSON.stringify(items),
    [initial, items],
  );

  const selected =
    selectedIdx !== null && selectedIdx < items.length
      ? items[selectedIdx]
      : null;

  function save() {
    setError(null);
    const payload: ItemsFileT = { items };
    const parsed = ItemsFileSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Validation failed");
      return;
    }
    const ids = new Set<string>();
    for (const it of items) {
      if (ids.has(it.id)) {
        setError(`Duplicate item id: ${it.id}`);
        return;
      }
      ids.add(it.id);
    }
    startTransition(async () => {
      const res = await saveItemsAction(storyId, payload);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function startCreate() {
    const placeholder: ItemDefT = {
      id: uniqueId("new-item", items.map((i) => i.id)),
      name: "New Item",
      icon: "🎁",
      description: "",
      effect: { kind: "heal", amount: 1 },
    };
    setItems((prev) => [...prev, placeholder]);
    setSelectedIdx(items.length);
    setError(null);
  }

  function updateSelected(mut: (it: ItemDefT) => ItemDefT) {
    if (selectedIdx === null) return;
    setItems((prev) =>
      prev.map((it, i) => (i === selectedIdx ? mut(it) : it)),
    );
  }

  async function deleteSelected() {
    if (selectedIdx === null) return;
    const it = items[selectedIdx];
    const ok = await confirm({
      title: "Delete item",
      message: `Delete item "${it.name}"?\nThis cannot be undone.`,
    });
    if (!ok) return;
    setItems((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  }

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p
            className="font-handwritten text-base text-accent-deep"
            title={storyId}
          >
            {storyTitle ?? storyId} / Items
          </p>
          <span className="rounded-pill bg-paper-deep/40 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
            {items.length}
          </span>
          <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 font-mono text-[10px] text-ink-soft/70">
            items.json
          </code>
          {missingRefs.length > 0 && (
            <span
              className="rounded-pill bg-ruby/15 px-2 py-0.5 text-xs text-ruby"
              title={missingRefs
                .slice(0, 8)
                .map((m) => `${m.id} @ ${m.where}`)
                .join("\n")}
            >
              ⚠ {missingRefs.length} unknown refs
            </span>
          )}
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
            + Item
          </button>
          <button
            type="button"
            onClick={() => {
              setItems(initial);
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
                  <th className="px-3 py-2 w-10"></th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 w-28">Effect</th>
                  <th className="px-3 py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr
                    key={`${it.id}-${i}`}
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
                    <td className="px-3 py-2 text-2xl">{it.icon ?? "🎁"}</td>
                    <td className="px-3 py-2 text-ink">{it.name}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-pill bg-emerald/15 px-2 py-0.5 text-xs text-emerald">
                        {effectLabel(it.effect)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink-soft">
                      {it.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-ink-soft/10 bg-paper p-4">
            <ItemForm
              item={selected}
              isNew={!initial.some((i) => i.id === selected.id)}
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

function ItemForm({
  item,
  isNew,
  onChange,
  onDelete,
  onClose,
}: {
  item: ItemDefT;
  isNew: boolean;
  onChange: (mut: (it: ItemDefT) => ItemDefT) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-handwritten text-base text-accent-deep">Item</p>
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

      {isNew && (
        <Field label="ID (kebab-case)">
          <input
            value={item.id}
            onChange={(e) => onChange((it) => ({ ...it, id: e.target.value }))}
            className={inputCls}
            placeholder="e.g. magic-key"
          />
        </Field>
      )}

      <Field label="Name">
        <input
          value={item.name}
          onChange={(e) =>
            onChange((it) => ({ ...it, name: e.target.value }))
          }
          className={inputCls}
        />
      </Field>
      <Field label="Emoji">
        <input
          value={item.icon ?? ""}
          onChange={(e) =>
            onChange((it) => ({
              ...it,
              icon: e.target.value || undefined,
            }))
          }
          className={inputCls}
          placeholder="🪶"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Effect">
          <StyledSelect
            value={item.effect.kind}
            onChange={(e) =>
              onChange((it) => ({
                ...it,
                effect: defaultEffect(e.target.value as ItemEffectKind),
              }))
            }
          >
            {EFFECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {EFFECT_KIND_LABEL[k]}
              </option>
            ))}
          </StyledSelect>
        </Field>
        {/* Heal-only field — disabled (greyed) for effects that don't heal,
            e.g. Event items. */}
        <Field label="Heal amount">
          <input
            type="number"
            min={1}
            max={10}
            disabled={item.effect.kind !== "heal"}
            value={item.effect.kind === "heal" ? item.effect.amount : ""}
            placeholder={item.effect.kind === "heal" ? undefined : "—"}
            onChange={(e) =>
              onChange((it) =>
                it.effect.kind === "heal"
                  ? {
                      ...it,
                      effect: {
                        kind: "heal",
                        amount: Math.max(
                          1,
                          Math.min(10, Math.floor(Number(e.target.value) || 1)),
                        ),
                      },
                    }
                  : it,
              )
            }
            className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-50`}
          />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          value={item.description}
          onChange={(e) =>
            onChange((it) => ({ ...it, description: e.target.value }))
          }
          rows={3}
          className={inputCls}
        />
      </Field>
    </div>
  );
}
