"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ConceptT, DraftMetaT, StoryboardT } from "@/data/schemas";
import type { Scene, Story } from "@/types/story";
import { saveDraftMetaAction, saveDraftScenesAction } from "../../_actions/generateDraft";
import { slugify } from "../../_lib/slugify";
import { advanceMeta, Card, ErrorNote, PrimaryButton } from "./shared";

interface Props {
  draftId: string;
  concept: ConceptT;
  storyboard: StoryboardT;
  meta: DraftMetaT;
  /** Already-assembled scenes (re-visit), if any. */
  initialScenes: Story | null;
}

export function ScenesStep({ draftId, concept, storyboard, meta, initialScenes }: Props) {
  const router = useRouter();
  const [story, setStory] = useState<Story | null>(initialScenes);
  const [busy, setBusy] = useState<"assemble" | "continue" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  function assemble(): Story {
    // Beat ids become scene-record keys AND image filenames, so normalise them
    // to a slug that satisfies the image-save NAME_RE. Build one raw→slug map
    // first (deduping collisions) so scene keys, image paths, branch.next, and
    // startScene all resolve to the SAME slug.
    const idMap = new Map<string, string>();
    const used = new Set<string>();
    storyboard.beats.forEach((beat, i) => {
      let slug = slugify(beat.id) || `scene-${i + 1}`;
      while (used.has(slug)) slug = `${slug}-2`;
      used.add(slug);
      idMap.set(beat.id, slug);
    });
    const resolve = (id: string): string => idMap.get(id) ?? slugify(id);

    // Preserve any narration / bgm / reward already authored for a beat that
    // still exists (re-assemble must NOT wipe prose). Index prior scenes by the
    // SAME slug so they line up across re-assembles.
    const prev = story?.scenes ?? {};

    const scenes: Record<string, Scene> = {};
    for (const beat of storyboard.beats) {
      const key = resolve(beat.id);
      const old = prev[key];
      scenes[key] = {
        image: old?.image || `/stories/${draftId}/scenes/${key}`,
        bgm: old?.bgm ?? "",
        speaker: beat.speaker ? slugify(beat.speaker) || "narrator" : "narrator",
        narration: old?.narration ?? "",
        ...(old?.reward ? { reward: old.reward } : {}),
        branches: beat.branches.map((b) => ({
          id: b.id,
          label: b.label,
          next: resolve(b.next),
          ...(b.outcomeHint.trim() ? { outcome: b.outcomeHint.trim() } : {}),
        })),
        ...(beat.isEnding
          ? { ending: { id: key, label: beat.endingLabel || "The End" } }
          : {}),
      };
    }
    return {
      id: draftId,
      title: concept.title,
      ...(concept.subtitle.trim() ? { subtitle: concept.subtitle.trim() } : {}),
      language: concept.language,
      estimatedMinutes: concept.estimatedMinutes,
      coverImage: `/stories/${draftId}/cover`,
      startScene: resolve(storyboard.startSceneId),
      scenes,
    };
  }

  function doAssemble() {
    setErr(null);
    setBusy("assemble");
    const assembled = assemble();
    start(async () => {
      const res = await saveDraftScenesAction(draftId, assembled);
      if (!res.ok) {
        setErr(res.error);
        setBusy(null);
        return;
      }
      setStory(assembled);
      setBusy(null);
    });
  }

  function continueNext() {
    setBusy("continue");
    start(async () => {
      await saveDraftMetaAction(draftId, advanceMeta(meta, "scenes", "narration"));
      router.push(`/admin/generate/${draftId}/narration`);
    });
  }

  const count = story ? Object.keys(story.scenes).length : 0;

  return (
    <Card title="Scenes">
      <p className="text-sm text-ink-soft">
        Assemble the storyboard into the playable scene graph. Narration and
        images are filled in the next stages.
      </p>
      <div className="rounded-card bg-paper-deep/40 px-3 py-2 text-sm">
        {story ? (
          <span className="text-ink">
            ✓ {count} scene{count === 1 ? "" : "s"} assembled · start ={" "}
            <code className="text-ink-soft">{story.startScene}</code>
          </span>
        ) : (
          <span className="text-ink-soft">{storyboard.beats.length} beats ready to assemble.</span>
        )}
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex justify-end gap-2">
        <PrimaryButton onClick={doAssemble} disabled={busy !== null}>
          {busy === "assemble" ? "Assembling…" : story ? "Re-assemble" : "Assemble scenes"}
        </PrimaryButton>
        {story && (
          <PrimaryButton onClick={continueNext} disabled={busy !== null}>
            {busy === "continue" ? "…" : "Continue →"}
          </PrimaryButton>
        )}
      </div>
    </Card>
  );
}
