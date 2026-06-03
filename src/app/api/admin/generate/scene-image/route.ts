import { NextResponse } from "next/server";
import { z } from "zod";

import { generateImageResilient, hasImageKey, type ReferenceImage } from "@/lib/image-gen";
import { processFullBleed } from "@/lib/image-post";
import { scenePrompt } from "@/lib/image-prompts";
import { characterAssetSlug } from "@/lib/narrative";
import { slugify } from "@/app/admin/_lib/slugify";
import {
  readConcept,
  readDraftCharacters,
  readDraftScenes,
  readStoryboard,
} from "@/app/admin/_lib/draftStore";
import { loadReferenceImage, saveStoryImage } from "@/app/admin/_lib/saveImage";

export const runtime = "nodejs";

const RequestSchema = z.object({
  storyId: z.string(),
  sceneId: z.string(),
});

const MAX_REFS = 4;

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled_in_production" }, { status: 403 });
  }

  let body;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!hasImageKey()) {
    return NextResponse.json({ error: "no_api_key" }, { status: 503 });
  }

  const concept = await readConcept(body.storyId);
  if (!concept) {
    return NextResponse.json({ error: "no_concept" }, { status: 400 });
  }

  const [storyboard, scenesFile, charsFile] = await Promise.all([
    readStoryboard(body.storyId),
    readDraftScenes(body.storyId),
    readDraftCharacters(body.storyId),
  ]);

  // Scene keys are slugified beat ids (see ScenesStep.assemble), so match the
  // beat by its slug — a raw-id compare misses any beat whose id wasn't already
  // a clean slug, losing the setting/synopsis for the image prompt.
  const beat = storyboard?.beats.find(
    (b) => slugify(b.id) === body.sceneId || b.id === body.sceneId,
  );
  const scene = scenesFile?.scenes[body.sceneId];
  const setting = beat?.setting ?? "";
  const synopsis = beat?.synopsis ?? "";
  const narration = scene?.narration ?? "";

  const heroId =
    charsFile?.characters.find((c) => c.isHero)?.id ?? "hero";
  const nameForSlug = (slug: string): string => {
    if (slug === "hero") {
      return charsFile?.characters.find((c) => c.isHero)?.name ?? "the hero";
    }
    return charsFile?.characters.find((c) => c.id === slug)?.name ?? slug;
  };

  // Characters present: always the hero, plus a named speaker + dialogue cast.
  const slugs = new Set<string>(["hero"]);
  if (scene && scene.speaker && scene.speaker !== "narrator") {
    slugs.add(characterAssetSlug(scene.speaker, heroId));
  }
  for (const dc of scene?.dialogueCharacters ?? []) {
    slugs.add(characterAssetSlug(dc, heroId));
  }

  const present = [...slugs].slice(0, MAX_REFS);
  const refs: ReferenceImage[] = [];
  const notes: string[] = [];
  for (const slug of present) {
    const ref = await loadReferenceImage(body.storyId, "characters", slug);
    if (ref) {
      refs.push(ref);
      notes.push(`the ${nameForSlug(slug)}`);
    }
  }

  const prompt = scenePrompt({
    concept,
    setting,
    synopsis,
    narration,
    characterNotes: notes.join("; "),
    hasReferences: refs.length > 0,
  });

  try {
    const png = await generateImageResilient({
      prompt,
      referenceImages: refs.length ? refs : undefined,
      aspectRatio: "16:9",
      size: "2K",
    });
    const out = await processFullBleed(png);
    const saved = await saveStoryImage({
      storyId: body.storyId,
      folder: "scenes",
      name: body.sceneId,
      webp: out.webp,
      png: out.png,
    });
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: 500 });
    }
    return NextResponse.json({ imagePath: saved.path });
  } catch (err) {
    console.error("[generate/scene-image] error", err);
    return NextResponse.json({ error: "image_failed" }, { status: 502 });
  }
}
