"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ConceptT, DraftMetaT, StoryboardT } from "@/data/schemas";
import type { CharactersFile, Story } from "@/types/story";
import { saveDraftMetaAction, saveDraftScenesAction } from "../../_actions/generateDraft";
import { slugify } from "../../_lib/slugify";
import { inputClsSm } from "../form";
import {
  advanceMeta,
  Card,
  ErrorNote,
  GhostButton,
  postJson,
  PrimaryButton,
  StatusDot,
} from "./shared";
import { useGenerationPool } from "./useGenerationPool";

interface Props {
  draftId: string;
  concept: ConceptT;
  characters: CharactersFile;
  meta: DraftMetaT;
  initialScenes: Story;
  /** The storyboard so each scene's narration is grounded in its beat's
   *  synopsis + setting (scene keys = slugified beat ids). */
  storyboard: StoryboardT | null;
}

export function NarrationStep({
  draftId,
  concept,
  characters,
  meta,
  initialScenes,
  storyboard,
}: Props) {
  const router = useRouter();
  const [story, setStory] = useState<Story>(initialScenes);
  const storyRef = useRef<Story>(initialScenes);
  const { entries, running, run, markDone } = useGenerationPool();
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const [saving, setSaving] = useState(false);

  const sceneIds = useMemo(() => Object.keys(initialScenes.scenes), [initialScenes]);
  const nameOf = (id: string) => characters.characters.find((c) => c.id === id)?.name ?? id;

  // Scene keys are slugified beat ids — index the storyboard the same way so we
  // can feed each scene's beat synopsis + setting into narration generation.
  const beatBySlug = useMemo(() => {
    const m: Record<string, { synopsis: string; setting: string }> = {};
    for (const b of storyboard?.beats ?? []) {
      m[slugify(b.id)] = { synopsis: b.synopsis, setting: b.setting };
    }
    return m;
  }, [storyboard]);

  // Pre-mark scenes that already have narration as done (resume).
  const initiallyDone = useMemo(
    () => sceneIds.filter((id) => (initialScenes.scenes[id].narration ?? "").trim().length > 0),
    [sceneIds, initialScenes],
  );
  // Resume: mark already-narrated scenes done (after mount, not during render).
  useEffect(() => {
    if (initiallyDone.length) markDone(initiallyDone);
  }, [initiallyDone, markDone]);

  // Keep the ref in sync so the pool worker + save read the latest scenes.
  useEffect(() => {
    storyRef.current = story;
  }, [story]);

  function applyNarration(id: string, narration: string) {
    setStory((prev) => ({
      ...prev,
      scenes: { ...prev.scenes, [id]: { ...prev.scenes[id], narration } },
    }));
  }

  async function worker(sceneId: string) {
    const cur = storyRef.current;
    const scene = cur.scenes[sceneId];
    // Incoming = branches that lead INTO this scene (with their source prose).
    const incoming: { label: string; narration: string }[] = [];
    for (const s of Object.values(cur.scenes)) {
      for (const b of s.branches) {
        if (b.next === sceneId) {
          incoming.push({ label: b.label, narration: s.narration ?? "" });
        }
      }
    }
    const before = scene.narration ?? "";
    const beat = beatBySlug[sceneId];
    const authorRequest = beat
      ? `Write THIS beat: ${beat.synopsis}${beat.setting ? ` (setting: ${beat.setting})` : ""}`
      : undefined;
    const res = await postJson<{ narration: string }>("/api/scene-narration", {
      storyId: draftId,
      language: concept.language,
      storyTitle: concept.title,
      storyPremise: concept.premise,
      speaker: scene.speaker,
      speakerName: scene.speaker === "narrator" ? undefined : nameOf(scene.speaker),
      choices: scene.branches.map((b) => b.label).slice(0, 6),
      incoming: incoming.slice(0, 3),
      authorRequest,
    });
    // If the author edited this scene's text while the request was in flight,
    // keep THEIR text rather than clobbering it with the generated prose.
    if ((storyRef.current.scenes[sceneId].narration ?? "") !== before) return;
    applyNarration(sceneId, res.narration);
  }

  function generateMissing() {
    setErr(null);
    const todo = sceneIds.filter((id) => (storyRef.current.scenes[id].narration ?? "").trim() === "");
    void run(todo.length ? todo : sceneIds, worker, 3);
  }
  function regenerateOne(id: string) {
    setErr(null);
    void run([id], worker, 1);
  }

  function saveContinue() {
    setErr(null);
    setSaving(true);
    start(async () => {
      const res = await saveDraftScenesAction(draftId, storyRef.current);
      if (!res.ok) {
        setErr(res.error);
        setSaving(false);
        return;
      }
      await saveDraftMetaAction(draftId, advanceMeta(meta, "narration", "images"));
      router.push(`/admin/generate/${draftId}/images`);
    });
  }

  const doneCount = sceneIds.filter(
    (id) => (story.scenes[id].narration ?? "").trim().length > 0,
  ).length;

  return (
    <Card
      title={`Narration · ${doneCount}/${sceneIds.length}`}
      actions={
        <PrimaryButton onClick={generateMissing} disabled={running}>
          {running ? "Generating…" : "✨ Generate missing"}
        </PrimaryButton>
      }
    >
      <p className="text-sm text-ink-soft">
        Per-scene storybook prose. Reuses the same narration model as the graph
        editor. Edit any text after generating.
      </p>

      <div className="flex flex-col gap-2">
        {sceneIds.map((id) => {
          const scene = story.scenes[id];
          const st = entries[id]?.status;
          return (
            <div key={id} className="rounded-card bg-paper-deep/30 p-2.5 ring-1 ring-ink-soft/10">
              <div className="mb-1.5 flex items-center gap-2">
                <StatusDot status={st} />
                <code className="rounded-pill bg-paper px-2 py-0.5 text-xs text-ink-soft">{id}</code>
                <span className="text-xs text-ink-soft">
                  {scene.speaker === "narrator" ? "narrator" : nameOf(scene.speaker)}
                </span>
                <button
                  type="button"
                  className="ml-auto text-xs text-accent-deep disabled:opacity-40"
                  onClick={() => regenerateOne(id)}
                  disabled={running}
                >
                  ↻ regenerate
                </button>
              </div>
              <textarea
                className={`${inputClsSm} min-h-14`}
                value={scene.narration ?? ""}
                onChange={(e) => applyNarration(id, e.target.value)}
                readOnly={st === "running"}
                placeholder="(narration)"
              />
              {entries[id]?.error && (
                <p className="mt-1 text-xs text-ruby">{entries[id].error}</p>
              )}
            </div>
          );
        })}
      </div>

      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex items-center justify-between">
        <GhostButton onClick={() => router.push(`/admin/generate/${draftId}/scenes`)}>
          ← Back
        </GhostButton>
        <PrimaryButton onClick={saveContinue} disabled={running || saving}>
          {saving ? "Saving…" : "Save & continue →"}
        </PrimaryButton>
      </div>
    </Card>
  );
}
