"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, User } from "@phosphor-icons/react";

import {
  CharactersFileSchema,
  KNOWN_SPEAKER_IDS,
  type CharacterPersonaT,
  type CharacterT,
  type CharactersFileT,
  type ItemDefT,
} from "@/data/schemas";
import type { SpeakerId } from "@/types/story";
import { saveCharactersAction } from "../_actions/saveJson";
import { AssetThumb } from "./AssetThumb";
import { ClickableImageThumb } from "./ClickableImageThumb";
import { useConfirm } from "./ConfirmDialog";
import { Field, StyledSelect, inputCls } from "./form";
import { ItemChipPicker } from "./ItemChipPicker";

const VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;

type Voice = (typeof VOICES)[number];

function characterImageBase(
  storyId: string,
  charId: string,
  heroId: string,
): string {
  // The hero's portrait lives at `hero.*` (generic-protagonist art),
  // regardless of which character id is flagged the hero.
  const filename = charId === heroId ? "hero" : charId;
  return `/stories/${storyId}/characters/${filename}`;
}

interface Props {
  storyId: string;
  storyTitle?: string;
  initial: CharacterT[];
  /** Map from character.id → resolved asset path (or null). Server-side
   *  precomputed so the browser never flickers through an onError chain. */
  assetMap: Record<string, string | null>;
  /** Image stems scanned from /public/stories/<id>/characters/. Drives
   *  the in-form image picker. */
  imageOptions: { value: string; label: string }[];
  /** Item catalogue — drives the persona's giftable-items toggle chips
   *  (same picker as the Monsters editor's drops). */
  itemCatalog: ItemDefT[];
}

export function CharactersEditor({
  storyId,
  storyTitle,
  initial,
  assetMap,
  imageOptions,
  itemCatalog,
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();
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
  const heroId = useMemo(
    () => characters.find((c) => c.isHero)?.id ?? "dorothy",
    [characters],
  );

  function save() {
    setError(null);
    // The Do/Don't textareas keep raw lines (incl. blanks) while editing —
    // strip empty/whitespace-only lines before persisting so the prompt
    // never gets empty bullets.
    const cleaned = characters.map(normalizeCharacter);
    const payload: CharactersFileT = { characters: cleaned };
    const parsed = CharactersFileSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Validation failed");
      return;
    }
    const ids = new Set<string>();
    for (const c of cleaned) {
      if (ids.has(c.id)) {
        setError(`Duplicate character id: ${c.id}`);
        return;
      }
      ids.add(c.id);
    }
    setCharacters(cleaned);
    startTransition(async () => {
      const res = await saveCharactersAction(storyId, payload);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function startCreate() {
    // Seed with the first unused known id; once those run out (or for a fresh
    // story) fall back to a generated `character-N`. Ids are free-text now, so
    // the author can rename it in the inspector.
    let id: string | undefined = KNOWN_SPEAKER_IDS.find(
      (sid) => !usedIds.has(sid),
    );
    if (!id) {
      let n = 1;
      while (usedIds.has(`character-${n}`)) n++;
      id = `character-${n}`;
    }
    const placeholder: CharacterT = {
      id,
      name: id.replace(/[-_]/g, " "),
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

  async function deleteSelected() {
    if (selectedIdx === null) return;
    const c = characters[selectedIdx];
    const ok = await confirm({
      title: "Delete character",
      message: `Delete character "${c.name}"?\nThis cannot be undone.`,
    });
    if (!ok) return;
    setCharacters((prev) => prev.filter((_, i) => i !== selectedIdx));
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
            {storyTitle ?? storyId} / Characters
          </p>
          <span className="rounded-pill bg-paper-deep/40 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
            {characters.length}
          </span>
          <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 font-mono text-[10px] text-ink-soft/70">
            characters.json
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
                  <th className="px-4 py-3 w-20"></th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3 w-36">Voice</th>
                  <th className="px-4 py-3 w-36">Voice speed</th>
                  <th className="px-4 py-3 w-36">Size</th>
                </tr>
              </thead>
              <tbody>
                {characters.map((c, i) => (
                  <tr
                    key={`${c.id}-${i}`}
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
                    <td className="px-4 py-3 align-middle">
                      <AssetThumb
                        base={c.image ?? characterImageBase(storyId, c.id, heroId)}
                        resolvedSrc={assetMap[c.id] ?? null}
                        alt={c.name}
                        className="h-12 w-12 p-1"
                        shape="circle"
                        fit="contain"
                        ringColor={c.color}
                        ringWidth={3}
                        placeholder={
                          <User size={20} weight="duotone" className="text-ink-soft/50" />
                        }
                      />
                    </td>
                    <td className="px-4 py-3 align-middle text-ink">
                      <span className="inline-flex items-center gap-1.5">
                        {c.name}
                        {c.isHero && (
                          <span className="inline-flex items-center gap-1 rounded-pill bg-accent-deep/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-deep">
                            <Star size={9} weight="fill" />
                            Hero
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <code className="text-ink-soft">{c.voice}</code>
                    </td>
                    <td className="px-4 py-3 align-middle tabular-nums text-ink-soft">
                      {c.voiceSpeed.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 align-middle capitalize text-ink-soft">
                      {c.size}
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
              storyId={storyId}
              character={selected}
              isNew={!initial.some((c) => c.id === selected.id)}
              imageOptions={imageOptions}
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

function CharacterForm({
  storyId,
  character,
  isNew,
  imageOptions,
  itemCatalog,
  onChange,
  onDelete,
  onClose,
}: {
  storyId: string;
  character: CharacterT;
  isNew: boolean;
  imageOptions: { value: string; label: string }[];
  itemCatalog: ItemDefT[];
  onChange: (mut: (c: CharacterT) => CharacterT) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const defaultImageBase = character.isHero
    ? `/stories/${storyId}/characters/hero`
    : `/stories/${storyId}/characters/${character.id}`;
  // The select binds to the effective base path (override or convention).
  // Picking an option that matches the convention clears the override so
  // we don't store redundant data; picking anything else writes it.
  const currentImagePath = character.image ?? defaultImageBase;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="font-handwritten text-base text-accent-deep">
            Character
          </p>
          {character.isHero && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-accent-deep px-2 py-0.5 text-[10px] font-semibold text-paper">
              <Star size={10} weight="fill" />
              Hero
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {isNew && (
            <input
              className={`${inputCls} max-w-[10rem]`}
              value={character.id}
              onChange={(e) =>
                onChange((c) => ({
                  ...c,
                  // Ids are free-text now (any story can add characters), but
                  // keep them slug-shaped for tidy asset paths.
                  id: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-") as SpeakerId,
                }))
              }
              placeholder="character-id"
              aria-label="Character id"
              title="Unique slug-style id (lowercase, hyphens)"
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

      <Field
        label={character.isHero ? "Name (default)" : "Name"}
        hint={
          character.isHero
            ? "Players name the hero in-game — this is only the fallback/example shown if they skip it."
            : undefined
        }
      >
        <input
          value={character.name}
          onChange={(e) =>
            onChange((c) => ({ ...c, name: e.target.value }))
          }
          className={inputCls}
        />
      </Field>

      <Field label="Image">
        <div className="flex items-start gap-3">
          <ClickableImageThumb
            base={currentImagePath}
            alt={character.name}
            className="h-20 w-20 shrink-0"
            shape="square"
            fit="contain"
            placeholder={
              <User size={32} weight="duotone" className="text-ink-soft/50" />
            }
          />
          <StyledSelect
            className="flex-1"
            value={currentImagePath}
            onChange={(e) => {
              const v = e.target.value;
              onChange((c) => ({
                ...c,
                // Skip the override when the picked value is the id-based
                // convention — keeps JSON clean.
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

      <Field label="Voice">
        <StyledSelect
          value={character.voice}
          onChange={(e) =>
            onChange((c) => ({ ...c, voice: e.target.value as Voice }))
          }
        >
          {VOICES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </StyledSelect>
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

      <Field label="Color">
        <div className="flex items-center gap-2">
          {/* Circular swatch — the entire circle is the color. The native
              color input sits invisibly on top so clicking it opens the
              browser color picker. */}
          <label
            className="relative h-9 w-9 shrink-0 cursor-pointer rounded-full ring-1 ring-ink-soft/15"
            style={{ backgroundColor: character.color }}
          >
            <input
              type="color"
              value={character.color}
              onChange={(e) =>
                onChange((c) => ({ ...c, color: e.target.value }))
              }
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Pick color"
            />
          </label>
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

      <Field label="Size">
        <StyledSelect
          value={character.size}
          onChange={(e) =>
            onChange((c) => ({
              ...c,
              size: e.target.value as CharacterT["size"],
            }))
          }
        >
          <option value="tiny">Tiny</option>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
          <option value="huge">Huge</option>
        </StyledSelect>
      </Field>

      <PersonaEditor
        persona={character.persona}
        itemCatalog={itemCatalog}
        onChange={(mut) =>
          onChange((c) =>
            c.persona ? { ...c, persona: mut(c.persona) } : c,
          )
        }
        onAdd={() => onChange((c) => ({ ...c, persona: EMPTY_PERSONA }))}
      />
    </div>
  );
}

/** Blank persona seeded by the "+ Add dialogue persona" button. */
const EMPTY_PERSONA: CharacterPersonaT = {
  shortBio: "",
  speechStyle: "",
  voiceTraits: "",
  dos: [],
  donts: [],
  giftableItems: [],
};

/**
 * Dialogue persona editor — the admin-tunable half of the character's LLM
 * system prompt. Hidden until the author opts in via "+ Add dialogue
 * persona"; characters without a persona (narrator, hero) simply skip it.
 */
function PersonaEditor({
  persona,
  itemCatalog,
  onChange,
  onAdd,
}: {
  persona: CharacterPersonaT | undefined;
  itemCatalog: ItemDefT[];
  onChange: (mut: (p: CharacterPersonaT) => CharacterPersonaT) => void;
  onAdd: () => void;
}) {
  if (!persona) {
    return (
      <div className="flex flex-col gap-2 border-t border-ink-soft/10 pt-3">
        <p className="text-xs text-ink-soft/70">
          No interactive-dialogue persona. Add one to let players chat with
          this character.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="self-start rounded-pill bg-accent-deep px-3 py-1 text-sm font-medium text-paper hover:opacity-90"
        >
          + Add dialogue persona
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-ink-soft/10 pt-3">
      <p className="font-handwritten text-base text-accent-deep">
        Dialogue persona
      </p>

      <Field label="Short bio">
        <textarea
          value={persona.shortBio}
          onChange={(e) =>
            onChange((p) => ({ ...p, shortBio: e.target.value }))
          }
          rows={6}
          className={inputCls}
          placeholder="Who is this character? 1–3 sentences."
        />
      </Field>

      <Field label="Speech style">
        <textarea
          value={persona.speechStyle}
          onChange={(e) =>
            onChange((p) => ({ ...p, speechStyle: e.target.value }))
          }
          rows={6}
          className={inputCls}
          placeholder="How do they talk? Cadence, quirks, vocabulary."
        />
      </Field>

      <Field label="Tone / personality">
        <input
          value={persona.voiceTraits}
          onChange={(e) =>
            onChange((p) => ({ ...p, voiceTraits: e.target.value }))
          }
          className={inputCls}
          placeholder="One-line tone for the LLM — not TTS."
        />
      </Field>

      <TextLinesField
        label="Do"
        hint="One behaviour per line"
        items={persona.dos}
        onChange={(arr) => onChange((p) => ({ ...p, dos: arr }))}
        placeholder={"A behaviour to lean into\n(one per line)"}
      />
      <TextLinesField
        label="Don't"
        hint="One behaviour per line"
        items={persona.donts}
        onChange={(arr) => onChange((p) => ({ ...p, donts: arr }))}
        placeholder={"A behaviour to avoid\n(one per line)"}
      />
      <Field
        label="Giftable items"
        hint="One gift per character, at mood ≥8"
      >
        <ItemChipPicker
          catalog={itemCatalog}
          selected={persona.giftableItems}
          onToggle={(id) =>
            onChange((p) => ({
              ...p,
              giftableItems: p.giftableItems.includes(id)
                ? p.giftableItems.filter((x) => x !== id)
                : [...p.giftableItems, id],
            }))
          }
        />
      </Field>
    </div>
  );
}

/**
 * Multi-line string[] editor — one item per line in a single textarea.
 * Far more compact than one input per item. Raw blank lines are kept
 * while editing (so the cursor behaves) and stripped on save by
 * `normalizeCharacter`. Newline is the only safe delimiter here since
 * persona lines themselves contain commas, quotes, and ellipses.
 */
function TextLinesField({
  label,
  hint,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        value={items.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
        rows={Math.max(4, items.length + 1)}
        className={inputCls}
        placeholder={placeholder}
      />
    </Field>
  );
}

/** Drop empty / whitespace-only lines from a persona's Do/Don't lists. */
function normalizeCharacter(c: CharacterT): CharacterT {
  if (!c.persona) return c;
  const clean = (arr: string[]) =>
    arr.map((s) => s.trim()).filter((s) => s.length > 0);
  return {
    ...c,
    persona: {
      ...c.persona,
      dos: clean(c.persona.dos),
      donts: clean(c.persona.donts),
    },
  };
}

