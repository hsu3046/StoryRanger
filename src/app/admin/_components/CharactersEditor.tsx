"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  CharactersFileSchema,
  type CharacterT,
  type CharactersFileT,
} from "@/data/schemas";
import { saveCharactersAction } from "../_actions/saveJson";
import { AssetThumb } from "./AssetThumb";

const SPEAKER_IDS = [
  "narrator",
  "dorothy",
  "scarecrow",
  "tinman",
  "lion",
  "wicked-witch",
  "glinda",
  "wizard",
] as const;

const VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;

type SpeakerId = (typeof SPEAKER_IDS)[number];
type Voice = (typeof VOICES)[number];

function characterImageBase(storyId: string, charId: string): string {
  // Hero portrait lives at `hero.*` regardless of speaker id "dorothy".
  const filename = charId === "dorothy" ? "hero" : charId;
  return `/stories/${storyId}/characters/${filename}`;
}

interface Props {
  storyId: string;
  initial: CharacterT[];
  /** Map from character.id → resolved asset path (or null). Server-side
   *  precomputed so the browser never flickers through an onError chain. */
  assetMap: Record<string, string | null>;
}

export function CharactersEditor({ storyId, initial, assetMap }: Props) {
  const router = useRouter();
  const [characters, setCharacters] = useState<CharacterT[]>(initial);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = useMemo(
    () => JSON.stringify(initial) !== JSON.stringify(characters),
    [initial, characters],
  );

  const selected =
    selectedIdx !== null && selectedIdx < characters.length
      ? characters[selectedIdx]
      : null;

  const usedIds = useMemo(
    () => new Set(characters.map((c) => c.id)),
    [characters],
  );

  function save() {
    setError(null);
    const payload: CharactersFileT = { characters };
    const parsed = CharactersFileSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Validation failed");
      return;
    }
    const ids = new Set<string>();
    for (const c of characters) {
      if (ids.has(c.id)) {
        setError(`Duplicate character id: ${c.id}`);
        return;
      }
      ids.add(c.id);
    }
    startTransition(async () => {
      const res = await saveCharactersAction(storyId, payload);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function startCreate() {
    const available = SPEAKER_IDS.find((sid) => !usedIds.has(sid));
    if (!available) {
      setError("All speaker ids are already used");
      return;
    }
    const placeholder: CharacterT = {
      id: available,
      name: available.replace(/_/g, " "),
      voice: "alloy",
      voiceSpeed: 1.0,
      color: "#777777",
      size: "medium",
    };
    setCharacters((prev) => [...prev, placeholder]);
    setSelectedIdx(characters.length);
    setError(null);
  }

  function updateSelected(mut: (c: CharacterT) => CharacterT) {
    if (selectedIdx === null) return;
    setCharacters((prev) =>
      prev.map((c, i) => (i === selectedIdx ? mut(c) : c)),
    );
  }

  function deleteSelected() {
    if (selectedIdx === null) return;
    const c = characters[selectedIdx];
    if (!confirm(`Delete character "${c.id}"?`)) return;
    setCharacters((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  }

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p className="font-handwritten text-base text-accent-deep">
            {storyId} / Characters
          </p>
          <span className="rounded-pill bg-paper-deep/40 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
            {characters.length}
          </span>
          <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 font-mono text-[10px] text-ink-soft/70">
            → characters.json
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
            + Character
          </button>
          <button
            type="button"
            onClick={() => {
              setCharacters(initial);
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
                  <th className="px-3 py-2 w-16"></th>
                  <th className="px-3 py-2 w-32">ID</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 w-24">Voice</th>
                  <th className="px-3 py-2 w-24">Voice speed</th>
                  <th className="px-3 py-2 w-28">Color</th>
                </tr>
              </thead>
              <tbody>
                {characters.map((c, i) => (
                  <tr
                    key={`${c.id}-${i}`}
                    onClick={() => setSelectedIdx(i)}
                    className={`cursor-pointer border-b border-ink-soft/5 last:border-0 transition-colors ${
                      selectedIdx === i
                        ? "bg-accent/15 hover:bg-accent/20"
                        : "hover:bg-paper-deep/15"
                    }`}
                  >
                    <td className="px-3 py-2 align-middle">
                      <AssetThumb
                        base={characterImageBase(storyId, c.id)}
                        resolvedSrc={assetMap[c.id] ?? null}
                        alt={c.name}
                        className="h-12 w-12 p-1"
                        shape="circle"
                        fit="contain"
                        ringColor={c.color}
                        ringWidth={3}
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <code className="text-ink">{c.id}</code>
                    </td>
                    <td className="px-3 py-2 align-middle text-ink">{c.name}</td>
                    <td className="px-3 py-2 align-middle">
                      <code className="text-ink-soft">{c.voice}</code>
                    </td>
                    <td className="px-3 py-2 align-middle tabular-nums text-ink-soft">
                      {c.voiceSpeed.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <code className="text-ink-soft">{c.color}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-ink-soft/10 bg-paper p-4">
            <CharacterForm
              character={selected}
              isNew={!initial.some((c) => c.id === selected.id)}
              usedIds={usedIds}
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

function CharacterForm({
  character,
  isNew,
  usedIds,
  onChange,
  onDelete,
  onClose,
}: {
  character: CharacterT;
  isNew: boolean;
  usedIds: Set<string>;
  onChange: (mut: (c: CharacterT) => CharacterT) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-handwritten text-base text-accent-deep">
            Character
          </p>
          <code className="text-sm text-ink">{character.id}</code>
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

      <Field label="ID (speaker)">
        <select
          value={character.id}
          onChange={(e) =>
            onChange((c) => ({ ...c, id: e.target.value as SpeakerId }))
          }
          disabled={!isNew}
          className={`${inputCls} ${!isNew ? "opacity-60" : ""}`}
        >
          {SPEAKER_IDS.map((sid) => {
            const taken = usedIds.has(sid) && sid !== character.id;
            return (
              <option key={sid} value={sid} disabled={taken}>
                {sid}
                {taken ? " (used)" : ""}
              </option>
            );
          })}
        </select>
      </Field>

      <Field label="Name">
        <input
          value={character.name}
          onChange={(e) =>
            onChange((c) => ({ ...c, name: e.target.value }))
          }
          className={inputCls}
        />
      </Field>

      <Field label="Voice">
        <select
          value={character.voice}
          onChange={(e) =>
            onChange((c) => ({ ...c, voice: e.target.value as Voice }))
          }
          className={inputCls}
        >
          {VOICES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Voice speed (0.25 – 4.0)">
        <input
          type="number"
          step={0.05}
          min={0.25}
          max={4.0}
          value={character.voiceSpeed}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n))
              onChange((c) => ({ ...c, voiceSpeed: n }));
          }}
          className={inputCls}
        />
      </Field>

      <Field label="Color (outline + dialogue)">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={character.color}
            onChange={(e) =>
              onChange((c) => ({ ...c, color: e.target.value }))
            }
            className="h-9 w-12 cursor-pointer rounded-button bg-paper-deep/40 ring-1 ring-ink-soft/10"
          />
          <input
            value={character.color}
            onChange={(e) =>
              onChange((c) => ({ ...c, color: e.target.value }))
            }
            className={inputCls}
            placeholder="#aabbcc"
          />
        </div>
      </Field>

      <Field label="Sprite size">
        <select
          value={character.size}
          onChange={(e) =>
            onChange((c) => ({
              ...c,
              size: e.target.value as CharacterT["size"],
            }))
          }
          className={inputCls}
        >
          <option value="tiny">tiny — pet-scale (Toto)</option>
          <option value="small">small</option>
          <option value="medium">medium — Dorothy / Scarecrow / Tin Man</option>
          <option value="large">large — Lion / Wizard</option>
          <option value="huge">huge — boss-scale</option>
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

const inputCls =
  "w-full rounded-button bg-paper-deep/40 px-3 py-1.5 text-sm text-ink ring-1 ring-ink-soft/10 focus:outline-none focus:ring-accent/50";
