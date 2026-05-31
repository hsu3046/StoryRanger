"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  MedalsFileSchema,
  type MedalMetricSchema,
  type MedalT,
  type MedalsFileT,
} from "@/data/schemas";
import { z } from "zod";
import { saveMedalsAction } from "../_actions/saveJson";
import { useConfirm } from "./ConfirmDialog";
import { useNameLinkedId } from "../_lib/useNameLinkedId";
import { Field, StyledSelect, inputCls } from "./form";

type MedalMetric = z.infer<typeof MedalMetricSchema>;

/** Metrics in the order shown in the dropdown + their human labels. Medals
 *  are earned automatically once a play metric reaches the threshold — no
 *  per-scene/branch ids, so the catalog is story-agnostic. */
const METRICS = [
  "friends",
  "dialogues",
  "battles",
  "choices",
  "gifts",
] as const satisfies readonly MedalMetric[];

const METRIC_LABEL: Record<MedalMetric, string> = {
  friends: "Friends made",
  dialogues: "Dialogues",
  battles: "Battles cleared",
  choices: "Choices made",
  gifts: "Gifts received",
};

/** One-liner for the table column. */
function describeMedal(m: MedalT): string {
  return `${METRIC_LABEL[m.metric]} ≥ ${m.threshold}`;
}

interface Props {
  initial: MedalT[];
}

export function MedalsEditor({ initial }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [medals, setMedals] = useState<MedalT[]>(initial);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // New medals' ids auto-follow their name until saved (no id field shown —
  // the id is derived purely from the name).
  const idLink = useNameLinkedId();

  const dirty = useMemo(
    () => JSON.stringify(initial) !== JSON.stringify(medals),
    [initial, medals],
  );

  const selected =
    selectedIdx !== null && selectedIdx < medals.length
      ? medals[selectedIdx]
      : null;

  function save() {
    setError(null);
    const payload: MedalsFileT = { medals };
    const parsed = MedalsFileSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Validation failed");
      return;
    }
    const ids = new Set<string>();
    for (const m of medals) {
      if (ids.has(m.id)) {
        setError(`Duplicate medal id: ${m.id}`);
        return;
      }
      ids.add(m.id);
    }
    // Committed → freeze all ids (renaming must never rewrite a saved id).
    idLink.reset();
    startTransition(async () => {
      const res = await saveMedalsAction(payload);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function startCreate() {
    const id = `new-medal-${medals.length + 1}`;
    const placeholder: MedalT = {
      id,
      name: "New Medal",
      icon: "🏅",
      description: "",
      metric: "friends",
      threshold: 1,
    };
    setMedals((prev) => [...prev, placeholder]);
    setSelectedIdx(medals.length);
    idLink.register(id);
    setError(null);
  }

  function updateSelected(mut: (m: MedalT) => MedalT) {
    if (selectedIdx === null) return;
    setMedals((prev) => prev.map((m, i) => (i === selectedIdx ? mut(m) : m)));
  }

  /** Name edit — derives the id from the name while it's auto-linked. */
  function changeName(value: string) {
    if (selectedIdx === null) return;
    const cur = medals[selectedIdx];
    const others = medals.filter((_, i) => i !== selectedIdx).map((m) => m.id);
    const newId = idLink.fromName(cur.id, value, others);
    updateSelected((m) => ({ ...m, name: value, ...(newId ? { id: newId } : {}) }));
  }

  async function deleteSelected() {
    if (selectedIdx === null) return;
    const m = medals[selectedIdx];
    const ok = await confirm({
      title: "Delete medal",
      message: `Delete medal "${m.name}"?\nThis cannot be undone.`,
    });
    if (!ok) return;
    idLink.detach(m.id);
    setMedals((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  }

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p className="font-handwritten text-base text-accent-deep">Medals</p>
          <span className="rounded-pill bg-paper-deep/40 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
            {medals.length}
          </span>
          <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 font-mono text-[10px] text-ink-soft/70">
            medals.json
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
            + Medal
          </button>
          <button
            type="button"
            onClick={() => {
              setMedals(initial);
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
                  <th className="px-3 py-2 w-56">Earned when</th>
                  <th className="px-3 py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {medals.map((m, i) => (
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
                    <td className="px-3 py-2 text-2xl">{m.icon}</td>
                    <td className="px-3 py-2 text-ink">{m.name}</td>
                    <td className="px-3 py-2 text-ink-soft">
                      {describeMedal(m)}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{m.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-ink-soft/10 bg-paper p-4">
            <MedalForm
              medal={selected}
              onChange={updateSelected}
              onNameChange={changeName}
              onDelete={deleteSelected}
              onClose={() => setSelectedIdx(null)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function MedalForm({
  medal,
  onChange,
  onNameChange,
  onDelete,
  onClose,
}: {
  medal: MedalT;
  onChange: (mut: (m: MedalT) => MedalT) => void;
  onNameChange: (value: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <p className="font-handwritten text-base text-accent-deep">Medal</p>
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

      <Field label="Name">
        <input
          value={medal.name}
          onChange={(e) => onNameChange(e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field label="Emoji">
        <input
          value={medal.icon}
          onChange={(e) => onChange((m) => ({ ...m, icon: e.target.value }))}
          className={inputCls}
          placeholder="🏅"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Metric" hint="Play stat this tracks">
          <StyledSelect
            value={medal.metric}
            onChange={(e) =>
              onChange((m) => ({
                ...m,
                metric: e.target.value as MedalMetric,
              }))
            }
          >
            {METRICS.map((mt) => (
              <option key={mt} value={mt}>
                {METRIC_LABEL[mt]}
              </option>
            ))}
          </StyledSelect>
        </Field>
        <Field label="Threshold" hint="Earn at this count">
          <input
            type="number"
            min={1}
            value={medal.threshold}
            onChange={(e) =>
              onChange((m) => ({
                ...m,
                threshold: Math.max(1, Math.floor(Number(e.target.value) || 1)),
              }))
            }
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={medal.description}
          onChange={(e) =>
            onChange((m) => ({ ...m, description: e.target.value }))
          }
          rows={3}
          className={inputCls}
        />
      </Field>
    </div>
  );
}
