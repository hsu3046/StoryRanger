import { NextResponse } from "next/server";
import { z } from "zod";

import { chat, hasLLMKey } from "@/lib/llm";

export const runtime = "nodejs";

const RequestSchema = z.object({
  storyId: z.string(),
  branchLabel: z.string().min(1).max(200),
  sourceNarration: z.string().max(2000),
  nextNarration: z.string().max(2000),
});

const ResponseSchema = z.object({
  outcome: z.string(),
});

const SYSTEM_PROMPT = `You are helping draft a Wonderful Wizard of Oz storybook for kids.

Given the current scene narration, the branch label the child picked, and the next scene's narration, write ONE short outcome line that bridges them — describing the immediate result of the choice. This plays on the page BEFORE the next scene appears. Because it's a bridge between two scenes, it MUST be very short.

RULES:
- LENGTH: prefer 1 sentence. Maximum 2 short sentences. Never longer.
- POINT OF VIEW: 2nd person — the player IS the hero. Use "you" as the subject (the rest of the storybook is also written in 2nd person, so this must match).
- TENSE: past tense.
- Don't repeat the next scene's first line verbatim — bridge into it.
- No emojis, no markdown.
- Output JSON only matching the schema.

Examples (good — short, 2nd person, past tense):
- "You sprinted across the dry grass as the wind began to roar."
- "You picked up the shimmering silver shoes."
- "You stepped onto the golden path through the cornfield."

Bad (too long / 3rd person / present tense):
- "Dorothy carefully and slowly walks across the field, looking left and right, until she finally arrives at the door of the farmhouse." (too long, wrong POV)
- "She sprints through the grass." (wrong POV, wrong tense)`;

export async function POST(req: Request) {
  let body;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!hasLLMKey()) {
    return NextResponse.json({ error: "no_api_key" }, { status: 503 });
  }

  const userText = [
    `CURRENT SCENE`,
    body.sourceNarration,
    ``,
    `THE CHILD PICKED: "${body.branchLabel}"`,
    ``,
    `NEXT SCENE`,
    body.nextNarration || "(continuation)",
    ``,
    `Write the outcome line.`,
  ].join("\n");

  try {
    const parsed = await chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
      schema: ResponseSchema,
      schemaName: "branch_outcome",
    });
    return NextResponse.json({ outcome: parsed.outcome.trim() });
  } catch (err) {
    console.error("[branch-outcome] LLM error", err);
    return NextResponse.json({ error: "llm_failed" }, { status: 502 });
  }
}
