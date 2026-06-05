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

  // Legacy URLs (pre-merge): scenes/narration → scene; the retired cover step → review.
  if (step === "scenes" || step === "narration") redirect(`${base}/scene`);
  if (step === "images") redirect(`${base}/review`);
  if (!STAGE_IDS.includes(step as DraftStageT)) notFound();
  const stage = step as DraftStageT;

  const meta = await readDraftMeta(draftId);
  if (!meta) notFound();

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
    if (!concept) redirect(`${base}/concept`);
    if (!storyboard) redirect(`${base}/storyboard`);
    if (!characters) redirect(`${base}/characters`);
    const [scenes, sceneMeta, bgmOptions, sceneStems, cover] = await Promise.all([
      readDraftScenes(draftId),
      readDraftSceneMeta(draftId),
      listBgmKeys(draftId),
      listPresentImageStems(draftId, "scenes"),
      coverPresent(draftId),
    ]);
    // Pages exist only once the pagination has run (it writes the sidecar).
    const hasPages = !!sceneMeta && Object.keys(sceneMeta.scenes).length > 0;
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
          <p className="font-handwritten text-base text-accent-deep">✨ Generate</p>
          <code className="rounded-pill bg-paper-deep/60 px-2 py-0.5 text-xs text-ink-soft">
            {draftId}
          </code>
        </div>
        <StepRail draftId={draftId} current={stage} />
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3">{body}</div>
    </div>
  );
}
