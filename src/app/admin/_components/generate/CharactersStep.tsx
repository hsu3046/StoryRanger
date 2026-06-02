"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { CharacterArtFileT, ConceptT, DraftMetaT, StoryboardT } from "@/data/schemas";
import type { CharactersFile } from "@/types/story";
import {
  saveCharacterArtAction,
  saveDraftCharactersAction,
  saveDraftMetaAction,
} from "../../_actions/generateDraft";
import { inputClsSm } from "../form";
import { advanceMeta, Card, ErrorNote, GhostButton, postJson, PrimaryButton } from "./shared";

interface Props {
  draftId: string;
  concept: ConceptT;
  storyboard: StoryboardT;
  meta: DraftMetaT;
  initialCharacters: CharactersFile | null;
  initialArt: CharacterArtFileT | null;
}

export function CharactersStep({
  draftId,
  concept,
  storyboard,
  meta,
  initialCharacters,
  initialArt,
}: Props) {
  const router = useRouter();
  const [chars, setChars] = useState<CharactersFile | null>(initialCharacters);
  const [art, setArt] = useState<CharacterArtFileT | null>(initialArt);
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  async function generate() {
    setErr(null);
    setBusy("gen");
    try {
      const res = await postJson<{ characters: CharactersFile; characterArt: CharacterArtFileT }>(
        "/api/admin/generate/characters",
        { concept, storyboard },
      );
      setChars(res.characters);
      setArt(res.characterArt);
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
            characters: c.characters.map((ch) =>
              ch.id === id && ch.persona ? { ...ch, persona: { ...ch.persona, shortBio: bio } } : ch,
            ),
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

  function saveContinue() {
    if (!chars) return;
    setErr(null);
    setBusy("save");
    start(async () => {
      const a = await saveDraftCharactersAction(draftId, chars);
      if (!a.ok) {
        setErr(a.error);
        setBusy(null);
        return;
      }
      const b = await saveCharacterArtAction(draftId, art ?? { entries: [] });
      if (!b.ok) {
        setErr(b.error);
        setBusy(null);
        return;
      }
      await saveDraftMetaAction(draftId, advanceMeta(meta, "characters", "scenes"));
      router.push(`/admin/generate/${draftId}/scenes`);
    });
  }

  if (!chars) {
    return (
      <Card title="Characters">
        <p className="text-sm text-ink-soft">
          Design the cast — the hero, narrator, and NPCs the storyboard refers to.
        </p>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex justify-end">
          <PrimaryButton onClick={generate} disabled={busy === "gen"}>
            {busy === "gen" ? "Generating…" : "✨ Generate characters"}
          </PrimaryButton>
        </div>
      </Card>
    );
  }

  const visualOf = (id: string) => art?.entries.find((e) => e.id === id)?.visualDescription ?? "";

  return (
    <Card
      title={`Characters · ${chars.characters.length}`}
      actions={
        <GhostButton onClick={generate} disabled={busy !== null}>
          {busy === "gen" ? "Regenerating…" : "↻ Regenerate"}
        </GhostButton>
      }
    >
      <div className="flex flex-col gap-3">
        {chars.characters.map((ch) => (
          <div key={ch.id} className="rounded-card bg-paper-deep/30 p-3 ring-1 ring-ink-soft/10">
            <div className="mb-2 flex items-center gap-2">
              <input
                className={`${inputClsSm} max-w-[14rem] font-semibold`}
                value={ch.name}
                onChange={(e) => setName(ch.id, e.target.value)}
              />
              <code className="rounded-pill bg-paper px-2 py-0.5 text-xs text-ink-soft">{ch.id}</code>
              {ch.isHero && (
                <span className="rounded-pill bg-accent/20 px-2 py-0.5 text-xs text-accent-deep">hero</span>
              )}
              {ch.persona && (
                <span className="rounded-pill bg-paper px-2 py-0.5 text-xs text-ink-soft">npc</span>
              )}
            </div>
            {ch.persona && (
              <textarea
                className={`${inputClsSm} mb-2 min-h-12`}
                value={ch.persona.shortBio}
                onChange={(e) => setBio(ch.id, e.target.value)}
                placeholder="bio"
              />
            )}
            <textarea
              className={`${inputClsSm} min-h-12`}
              value={visualOf(ch.id)}
              onChange={(e) => setVisual(ch.id, e.target.value)}
              placeholder="visual description (illustrator brief — English)"
            />
          </div>
        ))}
      </div>

      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex justify-end">
        <PrimaryButton onClick={saveContinue} disabled={busy !== null}>
          {busy === "save" ? "Saving…" : "Save & continue →"}
        </PrimaryButton>
      </div>
    </Card>
  );
}
