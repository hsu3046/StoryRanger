"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ImageSquare, Lock, LockOpen } from "@phosphor-icons/react";

import type {
  CharacterArtFileT,
  ConceptT,
  DraftMetaT,
  StoryboardT,
} from "@/data/schemas";
import type { Character, CharacterPersona, CharactersFile } from "@/types/story";
import { VOICES } from "@/data/voices";
import {
  saveCharacterArtAction,
  saveDraftCharactersAction,
} from "../../_actions/generateDraft";
import { useConfirm } from "../ConfirmDialog";
import { inputClsSm } from "../form";
import { GenderSelect } from "../GenderSelect";
import { VoiceSelectWithPreview } from "../VoiceSelectWithPreview";
import { ImagePreview } from "./ImagePreview";
import { RegenerateButton } from "./RegenerateButton";
import { Card, ErrorNote, postJson, PrimaryButton } from "./shared";
import { useAutosave, useStageVisit } from "./useAutosave";
import { useGenerationPool } from "./useGenerationPool";

const CHAR_MAX = 10; // hero + up to 9 NPCs
const fieldLabelCls =
  "text-xs font-semibold uppercase tracking-wide text-ink-soft";
const DEFAULT_NPC_VOICE = "ErXwobaYiN019PkySvjV";
const DEFAULT_NPC_COLOR = "#3a7ca5";

function emptyPersona(): CharacterPersona {
  return { shortBio: "", speechStyle: "", voiceTraits: "", dos: [], donts: [], giftableItems: [] };
}
function freshCharId(existing: Set<string>): string {
  let n = existing.size + 1;
  let id = `character-${n}`;
  while (existing.has(id)) id = `character-${++n}`;
  return id;
}
function newNpc(id: string): Character {
  return {
    id,
    name: "",
    gender: "neutral",
    voice: DEFAULT_NPC_VOICE,
    voiceSpeed: 1,
    color: DEFAULT_NPC_COLOR,
    size: "medium",
    persona: emptyPersona(),
  };
}

function Stepper({
  value,
  onDec,
  onInc,
  decDisabled,
  incDisabled,
}: {
  value: number;
  onDec: () => void;
  onInc: () => void;
  decDisabled: boolean;
  incDisabled: boolean;
}) {
  const btn =
    "rounded-pill bg-paper-deep/60 px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-ink-soft/10 hover:bg-paper-deep disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
      <button type="button" aria-label="Remove character" disabled={decDisabled} onClick={onDec} className={btn}>
        −
      </button>
      <span className="w-5 text-center text-sm font-semibold tabular-nums text-ink">{value}</span>
      <button type="button" aria-label="Add character" disabled={incDisabled} onClick={onInc} className={btn}>
        +
      </button>
    </span>
  );
}

interface Props {
  draftId: string;
  concept: ConceptT;
  storyboard: StoryboardT;
  meta: DraftMetaT;
  initialCharacters: CharactersFile | null;
  initialArt: CharacterArtFileT | null;
  presence: { characterStems: string[] };
}

export function CharactersStep({
  draftId,
  concept,
  storyboard,
  meta,
  initialCharacters,
  initialArt,
  presence,
}: Props) {
  const confirm = useConfirm();
  const [chars, setChars] = useState<CharactersFile | null>(initialCharacters);
  const [art, setArt] = useState<CharacterArtFileT | null>(initialArt);
  const [busy, setBusy] = useState<"gen" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, number>>({});
  // Characters the author locked — kept verbatim when "Generate All" re-rolls.
  const [locks, setLocks] = useState<Record<string, boolean>>({});
  const toggleLock = (id: string) => setLocks((l) => ({ ...l, [id]: !l[id] }));
  const img = useGenerationPool();
  const doneRef = useRef<Set<string>>(new Set());

  // The narrator is a fixed system voice, not an editable character — hide it.
  const shown = useMemo(
    () => (chars?.characters ?? []).filter((c) => c.id !== "narrator"),
    [chars],
  );
  const initialImgDone = useMemo(() => new Set(presence.characterStems), [presence]);
  const visualOf = (id: string) =>
    art?.entries.find((e) => e.id === id)?.visualDescription ?? "";

  // Autosave cast + art on edit / navigation (memoized so unrelated re-renders
  // don't reset the debounce).
  const draftData = useMemo(() => ({ chars, art }), [chars, art]);
  useAutosave(
    draftData,
    (d) =>
      d.chars
        ? Promise.all([
            saveDraftCharactersAction(draftId, d.chars),
            saveCharacterArtAction(draftId, d.art ?? { entries: [] }),
          ])
        : undefined,
    { enabled: !!chars },
  );
  useStageVisit(draftId, meta, "characters");

  useEffect(() => {
    if (initialImgDone.size) {
      doneRef.current = new Set(initialImgDone);
      img.markDone([...initialImgDone]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate(authorRequest?: string, count?: number) {
    setErr(null);
    setBusy("gen");
    try {
      // Locked characters are kept verbatim; the route is told they already
      // exist so it designs only the rest (no duplicates / extra hero).
      const lockedChars = (chars?.characters ?? []).filter((c) => locks[c.id]);
      const res = await postJson<{ characters: CharactersFile; characterArt: CharacterArtFileT }>(
        "/api/admin/generate/characters",
        {
          concept,
          storyboard,
          authorRequest,
          castCount: count,
          lockedCharacters: lockedChars.map((c) => ({
            id: c.id,
            name: c.name,
            isHero: !!c.isHero,
            bio: c.persona?.shortBio ?? "",
          })),
        },
      );

      let nextChars = res.characters;
      let nextArt = res.characterArt;
      if (lockedChars.length > 0) {
        // id-based merge: locked characters kept exactly; AI's cast added,
        // dropping any that collide with a locked id or its unique role.
        const lockedIds = new Set(lockedChars.map((c) => c.id));
        const lockedHero = lockedChars.some((c) => c.isHero);
        const lockedNarrator = lockedChars.some((c) => c.id === "narrator");
        const aiChars = res.characters.characters.filter(
          (c) =>
            !lockedIds.has(c.id) &&
            !(lockedHero && c.isHero) &&
            !(lockedNarrator && c.id === "narrator"),
        );
        nextChars = { characters: [...lockedChars, ...aiChars] };
        const keepIds = new Set(nextChars.characters.map((c) => c.id));
        const lockedArt = (art?.entries ?? []).filter((e) => lockedIds.has(e.id));
        const aiArt = res.characterArt.entries.filter(
          (e) => keepIds.has(e.id) && !lockedIds.has(e.id),
        );
        nextArt = { entries: [...lockedArt, ...aiArt] };
      }

      setChars(nextChars);
      setArt(nextArt);
      void saveDraftCharactersAction(draftId, nextChars);
      void saveCharacterArtAction(draftId, nextArt);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function setName(id: string, name: string) {
    setChars((c) =>
      c ? { characters: c.characters.map((ch) => (ch.id === id ? { ...ch, name } : ch)) } : c,
    );
  }
  function setBio(id: string, bio: string) {
    setChars((c) =>
      c
        ? {
            characters: c.characters.map((ch) => {
              if (ch.id !== id) return ch;
              // Don't attach a persona to a persona-less character (e.g. the
              // hero) for empty input — a persona makes them "talkable".
              if (!ch.persona && bio.trim() === "") return ch;
              return { ...ch, persona: { ...(ch.persona ?? emptyPersona()), shortBio: bio } };
            }),
          }
        : c,
    );
  }
  function setVoice(id: string, voice: string) {
    setChars((c) =>
      c ? { characters: c.characters.map((ch) => (ch.id === id ? { ...ch, voice } : ch)) } : c,
    );
  }
  function setGender(id: string, gender: Character["gender"]) {
    setChars((c) =>
      c ? { characters: c.characters.map((ch) => (ch.id === id ? { ...ch, gender } : ch)) } : c,
    );
  }
  function setVisual(id: string, visualDescription: string) {
    setArt((a) => {
      const entries = a?.entries ?? [];
      const found = entries.some((e) => e.id === id);
      return {
        entries: found
          ? entries.map((e) => (e.id === id ? { ...e, visualDescription } : e))
          : [...entries, { id, visualDescription }],
      };
    });
  }
  function addChar() {
    setChars((c) => {
      if (!c || c.characters.filter((x) => x.id !== "narrator").length >= CHAR_MAX) return c;
      const id = freshCharId(new Set(c.characters.map((x) => x.id)));
      return { characters: [...c.characters, newNpc(id)] };
    });
  }
  async function removeLastNpc() {
    if (!chars) return;
    const npcs = chars.characters.filter((c) => c.id !== "narrator" && !c.isHero);
    if (npcs.length === 0) return;
    const last = npcs[npcs.length - 1];
    const hasContent =
      last.name.trim() || last.persona?.shortBio.trim() || visualOf(last.id).trim();
    if (hasContent) {
      const ok = await confirm({
        title: "Remove this character?",
        message: `"${last.name || "This character"}" has content. Remove it?`,
        confirmLabel: "Remove",
      });
      if (!ok) return;
    }
    setChars((c) => (c ? { characters: c.characters.filter((x) => x.id !== last.id) } : c));
    setArt((a) => (a ? { entries: a.entries.filter((e) => e.id !== last.id) } : a));
  }
  function bump(slug: string) {
    setVersions((v) => ({ ...v, [slug]: (v[slug] ?? 0) + 1 }));
  }

  /** Persist cast + art so the image route reads the edited briefs. */
  async function persist(): Promise<boolean> {
    if (!chars) return false;
    const a = await saveDraftCharactersAction(draftId, chars);
    if (!a.ok) {
      setErr(a.error);
      return false;
    }
    const b = await saveCharacterArtAction(draftId, art ?? { entries: [] });
    if (!b.ok) {
      setErr(b.error);
      return false;
    }
    return true;
  }

  async function imgWorker(slug: string) {
    await postJson("/api/admin/generate/character-image", {
      storyId: draftId,
      characterId: slug,
      kind: "sprite",
    });
    await postJson("/api/admin/generate/character-image", {
      storyId: draftId,
      characterId: slug,
      kind: "portrait",
    });
    doneRef.current.add(slug);
    bump(slug);
  }

  /** Per-character image generation. Confirms first if one already exists. */
  async function onGenerateImage(slug: string, present: boolean) {
    if (present) {
      const ok = await confirm({
        title: "Regenerate image?",
        message: "This character already has an image. Generate a new one?",
        confirmLabel: "Regenerate",
      });
      if (!ok) return;
    }
    setErr(null);
    if (!(await persist())) return;
    await img.run([slug], imgWorker, 1);
  }


  // A freshly-created draft ships a placeholder characters.json (narrator +
  // hero) but no characterArt, so `chars` is always truthy. Treat "no art yet"
  // as not-yet-generated and show the Generate action — otherwise the LLM cast
  // route is unreachable (the edit view has no cast-level generate button).
  const generated = (art?.entries.length ?? 0) > 0;

  // ── Empty state — first generation ──
  if (!chars || !generated) {
    return (
      <Card title="Characters">
        <p className="text-sm text-ink-soft">
          Design the cast — the hero and the NPCs the story needs.
        </p>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex justify-end">
          <PrimaryButton onClick={() => generate()} disabled={busy === "gen"}>
            {busy === "gen" ? "Generating…" : "✨ Generate characters"}
          </PrimaryButton>
        </div>
      </Card>
    );
  }

  const busyAny = busy !== null || img.running;
  const npcCount = shown.filter((c) => !c.isHero).length;
  const slugOf = (ch: Character) => (ch.isHero ? "hero" : ch.id);

  return (
    <Card
      title={
        <>
          <span>Characters</span>
          <Stepper
            value={shown.length}
            onDec={() => void removeLastNpc()}
            onInc={addChar}
            decDisabled={busyAny || npcCount === 0}
            incDisabled={busyAny || shown.length >= CHAR_MAX}
          />
        </>
      }
      actions={
        <RegenerateButton
          busy={busy === "gen"}
          disabled={busyAny}
          title="Revise the cast"
          hint={
            <>
              Re-designs the open (
              <LockOpen weight="regular" className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
              ) characters; keeps your locked (
              <Lock weight="fill" className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
              ) ones. Lock a character to protect it from Generate.
            </>
          }
          count={{
            initial: Math.min(Math.max(shown.length, 1), CHAR_MAX),
            min: 1,
            max: CHAR_MAX,
            label: "Cast",
          }}
          onRegenerate={generate}
        />
      }
    >
      <div className="flex flex-col gap-3">
        {shown.map((ch, idx) => {
          const slug = slugOf(ch);
          const imgSt = img.entries[slug]?.status;
          const imgPresent = imgSt === "done" || initialImgDone.has(slug);
          const imgBase = `/stories/${draftId}/characters/${slug}`;
          return (
            <Fragment key={ch.id}>
            <div
              className={`flex gap-3 rounded-card bg-paper-deep/20 p-2.5 ${
                locks[ch.id] ? "ring-2 ring-accent/40" : ""
              }`}
            >
              <div className="flex w-40 shrink-0 flex-col gap-3">
                <ImagePreview
                  base={imgBase}
                  version={versions[slug] ?? 0}
                  alt={ch.name}
                  present={imgPresent}
                  className="aspect-square w-full"
                  fit="contain"
                />
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-pill bg-accent px-3 py-1.5 text-sm font-medium text-paper ring-1 ring-accent-deep/20 transition hover:bg-accent-deep active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                  onClick={() => void onGenerateImage(slug, imgPresent)}
                  disabled={busyAny}
                >
                  <ImageSquare weight="fill" className="h-4 w-4" aria-hidden />
                  {imgSt === "running" ? "Generating…" : "Generate"}
                </button>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <span className={fieldLabelCls}>Name</span>
                  <div className="flex items-center gap-2">
                    <input
                      className={`${inputClsSm} min-w-0 flex-1 font-semibold`}
                      value={ch.name}
                      onChange={(e) => setName(ch.id, e.target.value)}
                      placeholder="Name"
                    />
                    <button
                      type="button"
                      onClick={() => toggleLock(ch.id)}
                      aria-pressed={!!locks[ch.id]}
                      title={
                        locks[ch.id]
                          ? "Locked — kept when you Generate All"
                          : "Open — Generate All may replace this character"
                      }
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-button transition-colors ${
                        locks[ch.id]
                          ? "bg-paper-deep/60 text-accent-deep ring-1 ring-ink-soft/10"
                          : "text-ink-soft/40 hover:text-ink-soft"
                      }`}
                    >
                      {locks[ch.id] ? (
                        <Lock weight="fill" className="h-4 w-4" aria-hidden />
                      ) : (
                        <LockOpen className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </div>
                <label className="flex flex-col gap-1">
                  <span className={fieldLabelCls}>Bio</span>
                  <textarea
                    className={`${inputClsSm} min-h-20`}
                    value={ch.persona?.shortBio ?? ""}
                    onChange={(e) => setBio(ch.id, e.target.value)}
                    placeholder="Who they are & how they talk"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={fieldLabelCls}>Appearance</span>
                  <textarea
                    className={`${inputClsSm} min-h-20`}
                    value={visualOf(ch.id)}
                    onChange={(e) => setVisual(ch.id, e.target.value)}
                    placeholder="Face, hair, outfit, palette…"
                  />
                </label>
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <span className={fieldLabelCls}>Gender</span>
                    <GenderSelect
                      value={ch.gender}
                      onChange={(g) => setGender(ch.id, g)}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={fieldLabelCls}>Voice</span>
                    <VoiceSelectWithPreview
                      value={ch.voice}
                      options={VOICES}
                      placeholder="(choose a voice)"
                      onChange={(v) => setVoice(ch.id, v)}
                    />
                  </div>
                </div>
              </div>
            </div>
            {idx < shown.length - 1 && (
              <hr className="border-t border-ink-soft/15" />
            )}
            </Fragment>
          );
        })}
      </div>

      {err && <ErrorNote>{err}</ErrorNote>}
    </Card>
  );
}
