import { NextResponse } from "next/server";
import { z } from "zod";

import { getStory } from "@/lib/stories";
import { chat, hasLLMKey } from "@/lib/llm";
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
  "aunt-em",
  "toto",
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
  /** Hero's typed utterance. Empty string ONLY when isFirstTurn === true,
   *  in which case the LLM should greet the hero proactively. */
  utterance: z.string().max(500),
  /** True on the FIRST turn — LLM greets / acts without waiting for input. */
  isFirstTurn: z.boolean().optional(),
});

const ResponseLLMSchema = z.object({
  reply: z.string(),
  /** Optional one-line action / body language: "leans against tree, sighing". */
  action: z.string().nullable(),
  moodDelta: z.number(),
  hiddenHint: z.string().nullable(),
  itemGift: z.string().nullable(),
  endsConversation: z.boolean(),
  /** 3 short follow-up replies the HERO might say next (3-8 words each). */
  suggestions: z.array(z.string()).length(3),
});

const SAFE_FALLBACK: DialogueResponse = {
  reply: "They smile gently, but the words won't come right now.",
  action: null,
  moodDelta: 0,
  hiddenHint: null,
  itemGift: null,
  endsConversation: false,
  suggestions: ["Are you okay?", "Tell me more.", "Goodbye for now."],
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

  if (!hasLLMKey()) {
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

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const turn of history) {
    messages.push({
      role: turn.role === "hero" ? "user" : "assistant",
      content: turn.text,
    });
  }
  const userText =
    body.isFirstTurn && body.utterance.length === 0
      ? `(${body.hero.name} approaches you and looks at you. Greet them in your voice — either with a short line of dialogue, an action (in *asterisks*), or both. Reflect the current scene + your mood.)`
      : body.utterance;
  messages.push({ role: "user", content: userText });

  try {
    const parsed = await chat({
      system,
      messages,
      schema: ResponseLLMSchema,
      schemaName: "dialogue",
    });

    const result: DialogueResponse = {
      reply: parsed.reply,
      action: parsed.action,
      moodDelta: Math.max(-3, Math.min(3, Math.round(parsed.moodDelta))),
      hiddenHint: parsed.hiddenHint,
      itemGift: parsed.itemGift,
      endsConversation: parsed.endsConversation,
      suggestions: parsed.suggestions.slice(0, 3),
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[dialogue] LLM error", err);
    return NextResponse.json(SAFE_FALLBACK);
  }
}
