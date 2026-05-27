import { NextResponse } from "next/server";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

import { getStory } from "@/lib/stories";
import { getOpenAI, hasOpenAIKey, NARRATION_MODEL } from "@/lib/openai-client";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompt-builder";
import type { NarrateResponse } from "@/types/story";

export const runtime = "nodejs";

const RequestSchema = z.object({
  storyId: z.string(),
  sceneId: z.string(),
  freeInput: z.string().min(1).max(500),
  hero: z
    .object({
      name: z.string().min(1).max(40),
      gender: z.enum(["girl", "boy"]),
    })
    .default({ name: "Dorothy", gender: "girl" }),
  companions: z.array(z.enum(["scarecrow", "tinman", "lion"])).default([]),
});

const NarrateLLMSchema = z.object({
  narration: z.string(),
  speaker: z.enum([
    "narrator",
    "dorothy",
    "scarecrow",
    "tinman",
    "lion",
    "wicked-witch",
    "glinda",
  ]),
  nextSceneId: z.string(),
  medalTrigger: z.string().nullable(),
});

const FALLBACK_NARRATION =
  "Dorothy hesitates for a moment, then looks back at you, as if waiting for a different idea.";

export async function POST(req: Request) {
  let body;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const loaded = getStory(body.storyId);
  if (!loaded) {
    return NextResponse.json({ error: "unknown_story" }, { status: 404 });
  }

  const scene = loaded.story.scenes[body.sceneId];
  if (!scene) {
    return NextResponse.json({ error: "unknown_scene" }, { status: 404 });
  }

  const branchCandidates = scene.branches;
  if (branchCandidates.length === 0) {
    // Ending scene — no further branches. Just acknowledge the input.
    return NextResponse.json(buildFallback(body.sceneId, scene.speaker));
  }

  if (!hasOpenAIKey()) {
    return NextResponse.json(buildFallback(body.sceneId, scene.speaker));
  }

  const system = buildSystemPrompt(body.hero);
  const user = buildUserPrompt({
    scene,
    freeInput: body.freeInput,
    branchCandidates,
    companions: body.companions,
    hero: body.hero,
  });

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.parse({
      model: NARRATION_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: zodResponseFormat(NarrateLLMSchema, "narrate"),
    });

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) throw new Error("no parsed message");

    const validNextIds = new Set(branchCandidates.map((b) => b.next));
    const safeNextId = validNextIds.has(parsed.nextSceneId)
      ? parsed.nextSceneId
      : branchCandidates[0].next;

    const result: NarrateResponse = {
      narration: parsed.narration,
      speaker: parsed.speaker,
      nextSceneId: safeNextId,
      medalTrigger: parsed.medalTrigger,
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[narrate] LLM error", err);
    return NextResponse.json(buildFallback(body.sceneId, scene.speaker));
  }
}

function buildFallback(
  sceneId: string,
  speaker: NarrateResponse["speaker"],
): NarrateResponse {
  return {
    narration: FALLBACK_NARRATION,
    speaker,
    nextSceneId: sceneId,
    medalTrigger: null,
  };
}
