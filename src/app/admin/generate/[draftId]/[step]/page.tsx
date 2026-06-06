import { notFound, redirect } from "next/navigation";

import type { DraftStageT } from "@/data/schemas";
import {
  coverPresent,
  listBgmKeys,
  listPresentImageStems,
  readCharacterArt,
  readConcept,
  readDraftCharacters,
  readDraftMeta,
  readDraftSceneMeta,
  readDraftScenes,
  readStoryboard,
} from "../../../_lib/draftStore";
import { validateStory } from "../../../_lib/validateStory";
import { StepRail } from "../../../_components/generate/shared";
import { ConceptStep } from "../../../_components/generate/ConceptStep";
import { StoryboardStep } from "../../../_components/generate/StoryboardStep";
import { CharactersStep } from "../../../_components/generate/CharactersStep";
import { ScenesStep } from "../../../_components/generate/ScenesStep";
import { ReviewStep } from "../../../_components/generate/ReviewStep";

const STAGE_IDS: DraftStageT[] = [
  "concept",
  "storyboard",
  "characters",
  "scene",
  "review",
];

export default async function WizardStepPage({
  params,
}: {
  params: Promise<{ draftId: string; step: string }>;
}) {
  const { draftId, step } = await params;
  const base = `/admin/generate/${draftId}`;

  // Legacy URLs (pre-merge): scenes/narration/images all fold into the Scene
  // tab (which now owns image generation).
  if (step === "scenes" || step === "narration" || step === "images") {
    redirect(`${base}/scene`);
  }
  if (!STAGE_IDS.includes(step as DraftStageT)) notFound();
  const stage = step as DraftStageT;

  const meta = await readDraftMeta(draftId);
  if (!meta) notFound();
  const headerConcept = await readConcept(draftId);
  const headerTitle = headerConcept?.title?.trim() || draftId;

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
    if (!concept || !concept.title.trim()) redirect(`${base}/concept`);
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
    if (!concept || !concept.title.trim()) redirect(`${base}/concept`);
    if (!storyboard) redirect(`${base}/storyboard`);
    const [characters, art, characterStems] = await Promise.all([
      readDraftCharacters(draftId),
      readCharacterArt(draftId),
      listPresentImageStems(draftId, "characters"),
    ]);
    body = (
      <CharactersStep
        draftId={draftId}
        concept={concept}
        storyboard={storyboard}
        meta={meta}
        initialCharacters={characters}
        initialArt={art}
        presence={{ characterStems }}
      />
    );
  } else if (stage === "scene") {
    const concept = await readConcept(draftId);
    const storyboard = await readStoryboard(draftId);
    const characters = await readDraftCharacters(draftId);
    if (!concept || !concept.title.trim()) redirect(`${base}/concept`);
    if (!storyboard) redirect(`${base}/storyboard`);
    if (!characters) redirect(`${base}/characters`);
    const [scenes, sceneMeta, bgmOptions, sceneStems, cover] = await Promise.all([
      readDraftScenes(draftId),
      readDraftSceneMeta(draftId),
      listBgmKeys(draftId),
      listPresentImageStems(draftId, "scenes"),
      coverPresent(draftId),
    ]);
    // A draft has real pages when the pagination ran (sceneMeta written) OR when
    // an older draft already has assembled/narrated scenes (legacy, no sceneMeta)
    // — anything beyond the single empty placeholder scene seeded at creation.
    // Otherwise legacy work would be hidden behind "Generate pages" and lost.
    const sceneVals = scenes ? Object.values(scenes.scenes) : [];
    const hasPages =
      (!!sceneMeta && Object.keys(sceneMeta.scenes).length > 0) ||
      sceneVals.length > 1 ||
      sceneVals.some((s) => (s.narration ?? "").trim().length > 0);
    body = (
      <ScenesStep
        draftId={draftId}
        concept={concept}
        storyboard={storyboard}
        characters={characters}
        meta={meta}
        initialScenes={hasPages ? scenes : null}
        initialSceneMeta={sceneMeta}
        bgmOptions={bgmOptions}
        presence={{ sceneStems, cover }}
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
          <p className="shrink-0 font-handwritten text-base text-accent-deep">
            Create Story
          </p>
          <span className="truncate text-sm font-semibold text-ink">
            {headerTitle}
          </span>
        </div>
        <StepRail draftId={draftId} current={stage} />
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3">{body}</div>
    </div>
  );
}
