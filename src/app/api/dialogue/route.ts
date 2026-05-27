import { NextResponse } from "next/server";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

import { getStory } from "@/lib/stories";
import { getOpenAI, hasOpenAIKey, NARRATION_MODEL } from "@/lib/openai-client";
import {
  DIALOGUE_PERSONAS,
  buildDialogueSystemPrompt,
  trimDialogueHistory,
} from "@/lib/dialogue-personas";
import type { DialogueResponse, SpeakerId } from "@/types/story";

export const runtime = "nodejs";

const SPEAKER_IDS = [
  "scarecrow",
  "tinman",
  "lion",
  "glinda",
  "wicked-witch",
  "wizard",
] as const satisfies readonly SpeakerId[];

const RequestSchema = z.object({
  storyId: z.string(),
  characterId: z.enum(SPEAKER_IDS),
  hero: z.object({
    name: z.string().min(1).max(40),
    gender: z.enum(["girl", "boy"]),
  }),
  sceneId: z.string(),
  sceneNarration: z.string().max(2000),
  companions: z.array(z.enum(["scarecrow", "tinman", "lion"])).default([]),
  currentMood: z.number().min(0).max(10),
  history: z
    .array(
      z.object({
        role: z.enum(["hero", "character"]),
        text: z.string().max(2000),
      }),
    )
    .default([]),
  utterance: z.string().min(1).max(500),
});

const ResponseLLMSchema = z.object({
  reply: z.string(),
  moodDelta: z.number(),
  hiddenHint: z.string().nullable(),
  itemGift: z.string().nullable(),
  endsConversation: z.boolean(),
});

const SAFE_FALLBACK: DialogueResponse = {
  reply: "They smile gently, but the words won't come right now.",
  moodDelta: 0,
  hiddenHint: null,
  itemGift: null,
  endsConversation: false,
};

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

  const persona = DIALOGUE_PERSONAS[body.characterId];
  if (!persona) {
    return NextResponse.json(
      { error: "character_not_dialogue_able" },
      { status: 400 },
    );
  }

  if (!hasOpenAIKey()) {
    return NextResponse.json(SAFE_FALLBACK);
  }

  const system = buildDialogueSystemPrompt(
    persona,
    body.hero,
    body.sceneNarration,
    body.companions,
    body.currentMood,
  );

  const history = trimDialogueHistory(body.history);

  // Construct chat-style messages: system + alternating turns + current user
  const messages: Array<
    { role: "system" | "user" | "assistant"; content: string }
  > = [{ role: "system", content: system }];

  for (const turn of history) {
    messages.push({
      role: turn.role === "hero" ? "user" : "assistant",
      content: turn.text,
    });
  }
  messages.push({ role: "user", content: body.utterance });

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.parse({
      model: NARRATION_MODEL,
      messages,
      response_format: zodResponseFormat(ResponseLLMSchema, "dialogue"),
    });

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) throw new Error("no parsed message");

    const result: DialogueResponse = {
      reply: parsed.reply,
      moodDelta: Math.max(-3, Math.min(3, Math.round(parsed.moodDelta))),
      hiddenHint: parsed.hiddenHint,
      itemGift: parsed.itemGift,
      endsConversation: parsed.endsConversation,
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[dialogue] LLM error", err);
    return NextResponse.json(SAFE_FALLBACK);
  }
}
