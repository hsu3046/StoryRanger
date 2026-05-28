"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  BackgroundsFileSchema,
  type BackgroundMetaT,
  type BackgroundsFileT,
} from "@/data/schemas";
import { saveBackgroundsAction } from "../_actions/saveJson";
import { AssetThumb } from "./AssetThumb";

const MOODS = ["calm", "tense", "magical", "spooky", "warm"] as const;
type Mood = (typeof MOODS)[number];

function backgroundImageBase(storyId: string, key: string): string {
  return `/stories/${storyId}/backgrounds/${key}`;
}

interface Props {
  storyId: string;
  initial: BackgroundMetaT[];
  /** BGM keys that exist for this story (drives the inspector dropdown). */
  bgmOptions: string[];
  /** Server-precomputed resolved asset paths keyed by background key. */
  assetMap: Record<string, string | null>;
}

export function BackgroundsEditor({
  storyId,
  initial,
  bgmOptions,
  assetMap,
}: Props) {
  const router = useRouter();
  const [backgrounds, setBackgrounds] = useState<BackgroundMetaT[]>(initial);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = useMemo(
    () => JSON.stringify(initial) !== JSON.stringify(backgrounds),
    [initial, backgrounds],
  );

  const selected =
    selectedIdx !== null && selectedIdx < backgrounds.length
      ? backgrounds[selectedIdx]
      : null;

  function save() {
    setError(null);
    const payload: BackgroundsFileT = { backgrounds };
    const parsed = BackgroundsFileSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Validation failed");
      return;
    }
    const keys = new Set<string>();
    for (const b of backgrounds) {
      if (keys.has(b.key)) {
        setError(`Duplicate background key: ${b.key}`);
        return;
      }
      keys.add(b.key);
    }
    startTransition(async () => {
      const res = await saveBackgroundsAction(storyId, payload);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function startCreate() {
    const placeholder: BackgroundMetaT = {
      key: `new-background-${backgrounds.length + 1}`,
      label: "New Background",
      bgm: bgmOptions[0] ?? "yellow-road",
      mood: "calm",
    };
    setBackgrounds((prev) => [...prev, placeholder]);
    setSelectedIdx(backgrounds.length);
    setError(null);
  }

  function updateSelected(mut: (b: BackgroundMetaT) => BackgroundMetaT) {
    if (selectedIdx === null) return;
    setBackgrounds((prev) =>
      prev.map((b, i) => (i === selectedIdx ? mut(b) : b)),
    );
  }

  function deleteSelected() {
    if (selectedIdx === null) return;
    const b = backgrounds[selectedIdx];
    if (!confirm(`Delete background "${b.key}"?`)) return;
    setBackgrounds((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  }

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p className="font-handwritten text-base text-accent-deep">
            {storyId} / Backgrounds
          </p>
          <span className="rounded-pill bg-paper-deep/40 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
            {backgrounds.length}
          </span>
          <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 font-mono text-[10px] text-ink-soft/70">
            backgrounds.json
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
            + Background
          </button>
          <button
            type="button"
            onClick={() => {
              setBackgrounds(initial);
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
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="overflow-x-auto rounded-card-lg bg-paper ring-1 ring-ink-soft/10">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-ink-soft/10 bg-paper-deep/20 text-left">
                <tr>
                  <th className="px-3 py-2 w-24"></th>
                  <th className="px-3 py-2 w-48">Key</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2 w-32">BGM</th>
                  <th className="px-3 py-2 w-24">Mood</th>
                </tr>
              </thead>
              <tbody>
                {backgrounds.map((b, i) => (
                  <tr
                    key={`${b.key}-${i}`}
                    onClick={() => setSelectedIdx(i)}
                    className={`cursor-pointer border-b border-ink-soft/5 last:border-0 transition-colors ${
                      selectedIdx === i
                        ? "bg-accent/15 hover:bg-accent/20"
                        : "hover:bg-paper-deep/15"
                    }`}
                  >
                    <td className="px-3 py-2 align-middle">
                      <AssetThumb
                        base={backgroundImageBase(storyId, b.key)}
                        resolvedSrc={assetMap[b.key] ?? null}
                        alt={b.label}
                        className="h-12 w-20"
                        shape="banner"
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <code className="text-ink">{b.key}</code>
                    </td>
                    <td className="px-3 py-2 align-middle text-ink">
                      {b.label}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <code className="text-ink-soft">{b.bgm}</code>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <span
                        className={`rounded-pill px-2 py-0.5 text-xs ${moodColor(b.mood)}`}
                      >
                        {b.mood}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-ink-soft/10 bg-paper p-4">
            <BackgroundForm
              storyId={storyId}
              background={selected}
              resolvedSrc={assetMap[selected.key] ?? null}
              bgmOptions={bgmOptions}
              isNew={!initial.some((b) => b.key === selected.key)}
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

function BackgroundForm({
  storyId,
  background,
  resolvedSrc,
  bgmOptions,
  isNew,
  onChange,
  onDelete,
  onClose,
}: {
  storyId: string;
  background: BackgroundMetaT;
  resolvedSrc: string | null;
  bgmOptions: string[];
  isNew: boolean;
  onChange: (mut: (b: BackgroundMetaT) => BackgroundMetaT) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-handwritten text-base text-accent-deep">
            Background
          </p>
          <code className="text-sm text-ink">{background.key}</code>
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

      <AssetThumb
        base={backgroundImageBase(storyId, background.key)}
        resolvedSrc={resolvedSrc}
        alt={background.label}
        className="h-32 w-full"
        shape="banner"
      />

      <Field label="Key (kebab-case, matches filename)">
        <input
          value={background.key}
          onChange={(e) =>
            onChange((b) => ({ ...b, key: e.target.value }))
          }
          disabled={!isNew}
          className={`${inputCls} ${!isNew ? "opacity-60" : ""}`}
        />
      </Field>

      <Field label="Label">
        <input
          value={background.label}
          onChange={(e) =>
            onChange((b) => ({ ...b, label: e.target.value }))
          }
          className={inputCls}
        />
      </Field>

      <Field label="BGM">
        <select
          value={background.bgm}
          onChange={(e) =>
            onChange((b) => ({ ...b, bgm: e.target.value }))
          }
          className={inputCls}
        >
          {/* Allow editing to a value not yet in the options list — show it
              as a custom entry at the top so the dropdown reflects current
              state even before the BGM catalogue is updated. */}
          {!bgmOptions.includes(background.bgm) && (
            <option value={background.bgm}>{background.bgm} (custom)</option>
          )}
          {bgmOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Mood">
        <select
          value={background.mood}
          onChange={(e) =>
            onChange((b) => ({ ...b, mood: e.target.value as Mood }))
          }
          className={inputCls}
        >
          {MOODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
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

function moodColor(mood: BackgroundMetaT["mood"]): string {
  switch (mood) {
    case "calm":
      return "bg-emerald/15 text-emerald";
    case "tense":
      return "bg-accent/25 text-accent-deep";
    case "spooky":
      return "bg-ruby/15 text-ruby";
    case "magical":
      return "bg-accent-deep text-paper";
    case "warm":
      return "bg-amber-300/40 text-amber-800";
  }
}

const inputCls =
  "w-full rounded-button bg-paper-deep/40 px-3 py-1.5 text-sm text-ink ring-1 ring-ink-soft/10 focus:outline-none focus:ring-accent/50";
