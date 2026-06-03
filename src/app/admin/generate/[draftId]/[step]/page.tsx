import { notFound, redirect } from "next/navigation";

import type { DraftStageT } from "@/data/schemas";
import {
  coverPresent,
  listPresentImageStems,
  readCharacterArt,
  readConcept,
  readDraftCharacters,
  readDraftMeta,
  readDraftScenes,
  readStoryboard,
} from "../../../_lib/draftStore";
import { validateStory } from "../../../_lib/validateStory";
import { buildBeatKeyMap } from "../../../_lib/sceneKeys";
import { StepRail } from "../../../_components/generate/shared";
import { ConceptStep } from "../../../_components/generate/ConceptStep";
import { StoryboardStep } from "../../../_components/generate/StoryboardStep";
import { CharactersStep } from "../../../_components/generate/CharactersStep";
import { ScenesStep } from "../../../_components/generate/ScenesStep";
import { NarrationStep } from "../../../_components/generate/NarrationStep";
import { ImagesStep } from "../../../_components/generate/ImagesStep";
import { ReviewStep } from "../../../_components/generate/ReviewStep";

const STAGE_IDS: DraftStageT[] = [
  "concept",
  "storyboard",
  "characters",
  "scenes",
  "narration",
  "images",
  "review",
];

export default async function WizardStepPage({
  params,
}: {
  params: Promise<{ draftId: string; step: string }>;
}) {
  const { draftId, step } = await params;
  if (!STAGE_IDS.includes(step as DraftStageT)) notFound();
  const stage = step as DraftStageT;

  const meta = await readDraftMeta(draftId);
  if (!meta) notFound();

  const base = `/admin/generate/${draftId}`;

  let body: React.ReactNode;

  if (stage === "concept") {
    const concept = await readConcept(draftId);
    body = (
      <ConceptStep
        draftId={draftId}
        brief={meta.brief}
        language={meta.language}
        meta={meta}
        initialConcept={concept}
      />
    );
  } else if (stage === "storyboard") {
    const concept = await readConcept(draftId);
    if (!concept) redirect(`${base}/concept`);
    const storyboard = await readStoryboard(draftId);
    body = (
      <StoryboardStep
        draftId={draftId}
        concept={concept}
        meta={meta}
        initialStoryboard={storyboard}
      />
    );
  } else if (stage === "characters") {
    const concept = await readConcept(draftId);
    const storyboard = await readStoryboard(draftId);
    if (!concept) redirect(`${base}/concept`);
    if (!storyboard) redirect(`${base}/storyboard`);
    const [characters, art] = await Promise.all([
      readDraftCharacters(draftId),
      readCharacterArt(draftId),
    ]);
    body = (
      <CharactersStep
        draftId={draftId}
        concept={concept}
        storyboard={storyboard}
        meta={meta}
        initialCharacters={characters}
        initialArt={art}
      />
    );
  } else if (stage === "scenes") {
    const concept = await readConcept(draftId);
    const storyboard = await readStoryboard(draftId);
    if (!concept) redirect(`${base}/concept`);
    if (!storyboard) redirect(`${base}/storyboard`);
    const scenes = await readDraftScenes(draftId);
    // Only treat as "assembled" when the scene keys match the storyboard beats.
    // Scene keys come from the SAME raw-beat-id → key mapping assembly uses
    // (slugify + scene-N fallback + dedupe), so an empty-slug or collided beat
    // id is still detected — otherwise a re-assemble would wipe authored
    // narration by passing initialScenes=null.
    const keyMap = buildBeatKeyMap(storyboard.beats);
    const assembled =
      scenes &&
      storyboard.beats.every((b) => scenes.scenes[keyMap.get(b.id) ?? ""]) &&
      Object.keys(scenes.scenes).length >= storyboard.beats.length
        ? scenes
        : null;
    body = (
      <ScenesStep
        draftId={draftId}
        concept={concept}
        storyboard={storyboard}
        meta={meta}
        initialScenes={assembled}
      />
    );
  } else if (stage === "narration") {
    const concept = await readConcept(draftId);
    const characters = await readDraftCharacters(draftId);
    const scenes = await readDraftScenes(draftId);
    const storyboard = await readStoryboard(draftId);
    if (!concept) redirect(`${base}/concept`);
    if (!characters) redirect(`${base}/characters`);
    if (!scenes) redirect(`${base}/scenes`);
    body = (
      <NarrationStep
        draftId={draftId}
        concept={concept}
        characters={characters}
        meta={meta}
        initialScenes={scenes}
        storyboard={storyboard}
      />
    );
  } else if (stage === "images") {
    const characters = await readDraftCharacters(draftId);
    const scenes = await readDraftScenes(draftId);
    if (!characters) redirect(`${base}/characters`);
    if (!scenes) redirect(`${base}/scenes`);
    const [cover, characterStems, dialogueStems, sceneStems] = await Promise.all([
      coverPresent(draftId),
      listPresentImageStems(draftId, "characters"),
      listPresentImageStems(draftId, "dialogue"),
      listPresentImageStems(draftId, "scenes"),
    ]);
    body = (
      <ImagesStep
        draftId={draftId}
        characters={characters}
        meta={meta}
        scenes={scenes}
        presence={{ cover, characterStems, dialogueStems, sceneStems }}
      />
    );
  } else {
    // review
    const validation = await validateStory(draftId);
    body = (
      <ReviewStep
        draftId={draftId}
        meta={meta}
        initialValidation={{
          errors: validation.errors,
          warnings: validation.warnings,
        }}
      />
    );
  }

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <header className="flex shrink-0 flex-col gap-2 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p className="font-handwritten text-base text-accent-deep">✨ Generate</p>
          <code className="rounded-pill bg-paper-deep/60 px-2 py-0.5 text-xs text-ink-soft">
            {draftId}
          </code>
        </div>
        <StepRail draftId={draftId} current={stage} />
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto max-w-3xl">{body}</div>
      </div>
    </div>
  );
}
