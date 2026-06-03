import { NextResponse } from "next/server";
import { z } from "zod";

import { generateImageResilient, hasImageKey } from "@/lib/image-gen";
import { processSprite } from "@/lib/image-post";
import {
  characterPortraitPrompt,
  characterSpritePrompt,
} from "@/lib/image-prompts";
import {
  readCharacterArt,
  readConcept,
  readDraftCharacters,
} from "@/app/admin/_lib/draftStore";
import { loadReferenceImage, saveStoryImage } from "@/app/admin/_lib/saveImage";

export const runtime = "nodejs";

const RequestSchema = z.object({
  storyId: z.string(),
  /** Asset slug — "hero" for the protagonist, else the character id. */
  characterId: z.string(),
  /** "sprite" → characters/<id>, "portrait" → dialogue/<id>. */
  kind: z.enum(["sprite", "portrait"]),
});

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

  const art = await readCharacterArt(body.storyId);
  const chars = await readDraftCharacters(body.storyId);
  const visualDescription =
    art?.entries.find((e) => e.id === body.characterId)?.visualDescription ?? "";
  const name =
    chars?.characters.find((c) => c.id === body.characterId)?.name ??
    body.characterId;

  // Anchor non-hero art to the hero sprite (one illustrator's hand).
  const refs = [];
  if (body.characterId !== "hero") {
    const heroRef = await loadReferenceImage(body.storyId, "characters", "hero");
    if (heroRef) refs.push(heroRef);
  }

  const prompt =
    body.kind === "portrait"
      ? characterPortraitPrompt({
          concept,
          name,
          visualDescription,
          hasReferences: refs.length > 0,
          // The hero ref is a STYLE anchor only — never copy the hero's identity
          // onto another character.
          referenceMode: "style",
        })
      : characterSpritePrompt({
          concept,
          name,
          visualDescription,
          hasReferences: refs.length > 0,
          referenceMode: "style",
        });

  try {
    const png = await generateImageResilient({
      prompt,
      referenceImages: refs.length ? refs : undefined,
      aspectRatio: "1:1",
      size: "1K",
    });
    const out = await processSprite(png);
    const folder = body.kind === "portrait" ? "dialogue" : "characters";
    const saved = await saveStoryImage({
      storyId: body.storyId,
      folder,
      name: body.characterId,
      webp: out.webp,
      png: out.png,
    });
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: 500 });
    }
    return NextResponse.json({ imagePath: saved.path });
  } catch (err) {
    console.error("[generate/character-image] error", err);
    return NextResponse.json({ error: "image_failed" }, { status: 502 });
  }
}
