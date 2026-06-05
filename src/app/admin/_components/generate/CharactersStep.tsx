"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkle } from "@phosphor-icons/react";

import type { CharacterArtFileT, ConceptT, DraftMetaT, StoryboardT } from "@/data/schemas";
import type { Character, CharacterPersona, CharactersFile } from "@/types/story";
import {
  saveCharacterArtAction,
  saveDraftCharactersAction,
} from "../../_actions/generateDraft";
import { useConfirm } from "../ConfirmDialog";
import { inputClsSm } from "../form";
import { ImagePreview } from "./ImagePreview";
import { Card, ErrorNote, postJson, PrimaryButton } from "./shared";
import { useAutosave, useStageVisit } from "./useAutosave";
import { useGenerationPool } from "./useGenerationPool";

const CHAR_MAX = 10; // hero + up to 9 NPCs
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
    (d) => {
      if (!d.chars) return;
      void saveDraftCharactersAction(draftId, d.chars);
      void saveCharacterArtAction(draftId, d.art ?? { entries: [] });
    },
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

  async function generate(authorRequest?: string) {
    setErr(null);
    setBusy("gen");
    try {
      const res = await postJson<{ characters: CharactersFile; characterArt: CharacterArtFileT }>(
        "/api/admin/generate/characters",
        { concept, storyboard, authorRequest },
      );
      setChars(res.characters);
      setArt(res.characterArt);
      void saveDraftCharactersAction(draftId, res.characters);
      void saveCharacterArtAction(draftId, res.characterArt);
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
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((ch) => {
          const slug = slugOf(ch);
          const imgSt = img.entries[slug]?.status;
          const imgPresent = imgSt === "done" || initialImgDone.has(slug);
          const imgBase = `/stories/${draftId}/characters/${slug}`;
          return (
            <div key={ch.id} className="flex gap-3 rounded-card bg-paper-deep/20 p-2.5">
              <div className="flex w-24 shrink-0 flex-col gap-1">
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
                  className="inline-flex w-full items-center justify-center gap-1 rounded-pill bg-paper-deep/60 px-2 py-1 text-xs font-medium text-accent-deep ring-1 ring-ink-soft/10 transition-colors hover:bg-paper-deep active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => void onGenerateImage(slug, imgPresent)}
                  disabled={busyAny}
                >
                  <Sparkle weight="fill" className="h-3.5 w-3.5" aria-hidden />
                  {imgSt === "running" ? "Generating…" : "Generate"}
                </button>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <input
                  className={`${inputClsSm} font-semibold`}
                  value={ch.name}
                  onChange={(e) => setName(ch.id, e.target.value)}
                  placeholder="Name"
                />
                <textarea
                  className={`${inputClsSm} min-h-20`}
                  value={ch.persona?.shortBio ?? ""}
                  onChange={(e) => setBio(ch.id, e.target.value)}
                  placeholder="Bio — who they are & how they talk"
                />
                <textarea
                  className={`${inputClsSm} min-h-20`}
                  value={visualOf(ch.id)}
                  onChange={(e) => setVisual(ch.id, e.target.value)}
                  placeholder="Appearance for Image"
                />
              </div>
            </div>
          );
        })}
      </div>

      {err && <ErrorNote>{err}</ErrorNote>}
    </Card>
  );
}
