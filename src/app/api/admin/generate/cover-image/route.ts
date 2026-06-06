import { NextResponse } from "next/server";
import { z } from "zod";

import { generateImageResilient, hasImageKey } from "@/lib/image-gen";
import { processFullBleed } from "@/lib/image-post";
import { coverPrompt } from "@/lib/image-prompts";
import { readConcept } from "@/app/admin/_lib/draftStore";
import { loadReferenceImage, saveStoryImage } from "@/app/admin/_lib/saveImage";

export const runtime = "nodejs";

const RequestSchema = z.object({
  storyId: z.string(),
  /** Optional author description steering what the cover shows. */
  description: z.string().max(4000).optional(),
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

  // Feature the hero on the cover when their sprite exists.
  const refs = [];
  const heroRef = await loadReferenceImage(body.storyId, "characters", "hero");
  if (heroRef) refs.push(heroRef);

  try {
    const png = await generateImageResilient({
      prompt: coverPrompt(concept, body.description),
      referenceImages: refs.length ? refs : undefined,
      aspectRatio: "16:9",
      size: "2K",
    });
    const out = await processFullBleed(png);
    const saved = await saveStoryImage({
      storyId: body.storyId,
      folder: "",
      name: "cover",
      webp: out.webp,
      png: out.png,
    });
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: 500 });
    }
    return NextResponse.json({ imagePath: saved.path });
  } catch (err) {
    console.error("[generate/cover-image] error", err);
    return NextResponse.json({ error: "image_failed" }, { status: 502 });
  }
}
