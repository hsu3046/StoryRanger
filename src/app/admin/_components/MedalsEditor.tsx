"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  MedalsFileSchema,
  type MedalT,
  type MedalsFileT,
} from "@/data/schemas";
import { saveMedalsAction } from "../_actions/saveJson";
import { useConfirm } from "./ConfirmDialog";
import { Field, StyledSelect, inputCls } from "./form";

/** All medal trigger kinds, in the order shown in the type dropdown. */
const TRIGGER_TYPES = [
  "scene",
  "branch",
  "ending",
  "encounter",
  "dialogue_count",
] as const;

type MedalTrigger = MedalT["trigger"];
type TriggerType = MedalTrigger["type"];

const TRIGGER_LABEL: Record<TriggerType, string> = {
  scene: "Scene",
  branch: "Branch",
  ending: "Ending",
  encounter: "Encounter",
  dialogue_count: "Min dialogues",
};

/** Uppercase only the first character (leaves ids untouched). */
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const TRIGGER_TYPE_LABEL: Record<TriggerType, string> = {
  scene: "Scene entered",
  branch: "Branch taken",
  ending: "Ending reached",
  encounter: "Encounter reward",
  dialogue_count: "Dialogue count",
};

/** Default-shaped trigger when switching the type dropdown. Story-specific
 *  types carry the given storyId; dialogue_count is story-agnostic. */
function defaultTrigger(type: TriggerType, storyId: string): MedalTrigger {
  switch (type) {
    case "branch":
      return { type: "branch", storyId, branchId: "" };
    case "scene":
      return { type: "scene", storyId, sceneId: "" };
    case "ending":
      return { type: "ending", storyId, endingId: "" };
    case "encounter":
      return { type: "encounter", storyId, encounterId: "" };
    case "dialogue_count":
      return { type: "dialogue_count", min: 1 };
  }
}

/** storyId of a story-specific trigger, or null for dialogue_count. */
function triggerStoryId(t: MedalTrigger): string | null {
  return t.type === "dialogue_count" ? null : t.storyId;
}

/** The single editable value carried by each trigger type, as a string. */
function triggerValue(t: MedalTrigger): string {
  switch (t.type) {
    case "branch":
      return t.branchId;
    case "scene":
      return t.sceneId;
    case "ending":
      return t.endingId;
    case "encounter":
      return t.encounterId;
    case "dialogue_count":
      return String(t.min);
  }
}

function setTriggerValue(t: MedalTrigger, v: string): MedalTrigger {
  switch (t.type) {
    case "branch":
      return { type: "branch", storyId: t.storyId, branchId: v };
    case "scene":
      return { type: "scene", storyId: t.storyId, sceneId: v };
    case "ending":
      return { type: "ending", storyId: t.storyId, endingId: v };
    case "encounter":
      return { type: "encounter", storyId: t.storyId, encounterId: v };
    case "dialogue_count":
      // Clamp to ≥1 — a min of 0 would make the medal trigger immediately
      // (always earned). Empty/invalid input falls back to 1.
      return {
        type: "dialogue_count",
        min: Math.max(1, Math.floor(Number(v) || 1)),
      };
  }
}

/** Set the storyId of a story-specific trigger (no-op for dialogue_count). */
function setTriggerStory(t: MedalTrigger, storyId: string): MedalTrigger {
  switch (t.type) {
    case "branch":
      return { ...t, storyId };
    case "scene":
      return { ...t, storyId };
    case "ending":
      return { ...t, storyId };
    case "encounter":
      return { ...t, storyId };
    case "dialogue_count":
      return t;
  }
}

/** Human-readable one-liner for the table column. */
function describeTrigger(t: MedalTrigger): string {
  switch (t.type) {
    case "branch":
      return `branch: ${t.branchId} · ${t.storyId}`;
    case "scene":
      return `scene: ${t.sceneId} · ${t.storyId}`;
    case "dialogue_count":
      return `dialogue ≥ ${t.min}`;
    case "ending":
      return `ending: ${t.endingId} · ${t.storyId}`;
    case "encounter":
      return `encounter: ${t.encounterId} · ${t.storyId}`;
  }
}

interface Props {
  initial: MedalT[];
  /** All stories, for the trigger's story picker. First is the default. */
  stories: { id: string; title: string }[];
}

export function MedalsEditor({ initial, stories }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const firstStoryId = stories[0]?.id ?? "";
  const [medals, setMedals] = useState<MedalT[]>(initial);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    startTransition(async () => {
      const res = await saveMedalsAction(payload);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function startCreate() {
    const placeholder: MedalT = {
      id: `new-medal-${medals.length + 1}`,
      name: "New Medal",
      icon: "🏅",
      description: "",
      trigger: { type: "scene", storyId: firstStoryId, sceneId: "" },
    };
    setMedals((prev) => [...prev, placeholder]);
    setSelectedIdx(medals.length);
    setError(null);
  }

  function updateSelected(mut: (m: MedalT) => MedalT) {
    if (selectedIdx === null) return;
    setMedals((prev) =>
      prev.map((m, i) => (i === selectedIdx ? mut(m) : m)),
    );
  }

  async function deleteSelected() {
    if (selectedIdx === null) return;
    const m = medals[selectedIdx];
    const ok = await confirm({
      title: "Delete medal",
      message: `Delete medal "${m.name}"?\nThis cannot be undone.`,
    });
    if (!ok) return;
    setMedals((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  }

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p className="font-handwritten text-base text-accent-deep">
            Medals
          </p>
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
                  <th className="px-3 py-2 w-64">Trigger</th>
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
                    <td className="px-3 py-2">
                      <code className="text-ink-soft">
                        {capitalizeFirst(describeTrigger(m.trigger))}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-ink-soft">
                      {m.description}
                    </td>
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
              stories={stories}
              firstStoryId={firstStoryId}
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

function MedalForm({
  medal,
  stories,
  firstStoryId,
  onChange,
  onDelete,
  onClose,
}: {
  medal: MedalT;
  stories: { id: string; title: string }[];
  firstStoryId: string;
  onChange: (mut: (m: MedalT) => MedalT) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const trigger = medal.trigger;
  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-handwritten text-base text-accent-deep">Medal</p>
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

      <Field label="Name">
        <input
          value={medal.name}
          onChange={(e) =>
            onChange((m) => ({ ...m, name: e.target.value }))
          }
          className={inputCls}
        />
      </Field>
      <Field label="Emoji">
        <input
          value={medal.icon}
          onChange={(e) =>
            onChange((m) => ({ ...m, icon: e.target.value }))
          }
          className={inputCls}
          placeholder="🏅"
        />
      </Field>

      <Field label="Trigger">
        <StyledSelect
          value={trigger.type}
          onChange={(e) =>
            onChange((m) => ({
              ...m,
              trigger: defaultTrigger(
                e.target.value as TriggerType,
                triggerStoryId(m.trigger) ?? firstStoryId,
              ),
            }))
          }
        >
          {TRIGGER_TYPES.map((t) => (
            <option key={t} value={t}>
              {TRIGGER_TYPE_LABEL[t]}
            </option>
          ))}
        </StyledSelect>
      </Field>

      {/* Story picker — story-specific triggers only fire while playing the
          chosen story. dialogue_count is story-agnostic, so it's hidden. */}
      {trigger.type !== "dialogue_count" && (
        <Field label="Story" hint="Which story this trigger fires in">
          <StyledSelect
            value={trigger.storyId}
            onChange={(e) =>
              onChange((m) => ({
                ...m,
                trigger: setTriggerStory(m.trigger, e.target.value),
              }))
            }
          >
            {!stories.some((s) => s.id === trigger.storyId) && (
              <option value={trigger.storyId}>
                {trigger.storyId || "(none)"} (unknown)
              </option>
            )}
            {stories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </StyledSelect>
        </Field>
      )}

      <Field label={TRIGGER_LABEL[trigger.type]}>
        <input
          type={trigger.type === "dialogue_count" ? "number" : "text"}
          min={trigger.type === "dialogue_count" ? 1 : undefined}
          value={triggerValue(trigger)}
          onChange={(e) =>
            onChange((m) => ({
              ...m,
              trigger: setTriggerValue(m.trigger, e.target.value),
            }))
          }
          className={inputCls}
        />
      </Field>

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
