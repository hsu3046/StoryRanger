import { NextResponse } from "next/server";
import { z } from "zod";

import { chat, hasLLMKey } from "@/lib/llm";

export const runtime = "nodejs";

const RequestSchema = z.object({
  storyId: z.string(),
  /** Story language code (e.g. "en", "ko", "ja") or free-text. The outcome
   *  must be written in THIS language regardless of the request's language. */
  language: z.string().max(40).optional(),
  /** Story title + premise/tagline — give the model the overall tone. */
  storyTitle: z.string().max(200).optional(),
  storyPremise: z.string().max(600).optional(),
  branchLabel: z.string().min(1).max(200),
  sourceNarration: z.string().max(2000),
  nextNarration: z.string().max(2000),
  /** Labels of the choices available on the NEXT scene (where this leads). */
  nextChoices: z.array(z.string().max(200)).max(6).default([]),
  /** Scenes that branch INTO the source scene — the lead-up, each with the
   *  label of the choice that arrived here. */
  incoming: z
    .array(
      z.object({
        label: z.string().max(200),
        narration: z.string().max(2000),
      }),
    )
    .max(3)
    .default([]),
  /** The author's own text in the field when they hit "Ask AI" — a rough
   *  draft to polish or an instruction to follow. Empty → generate fresh. */
  authorRequest: z.string().max(1000).optional(),
});

const ResponseSchema = z.object({
  outcome: z.string(),
});

/** Map a story language code to a human name the model handles reliably.
 *  Falls back to the raw value (custom locales) so nothing is lost. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ko: "Korean (한국어)",
  ja: "Japanese (日本語)",
};
function languageName(code: string | undefined): string {
  if (!code) return "English";
  return LANGUAGE_NAMES[code] ?? code;
}

// Static (story-agnostic) so it stays cache-friendly — all per-story context
// is folded into the user message. The model learns the tone from the premise
// + surrounding scenes rather than a hardcoded setting.
const SYSTEM_PROMPT = `You are helping an author draft narration for an interactive storybook for children.

You write the ONE short "outcome" line for a branch: the immediate result of the choice the child just made. It plays on the page as a bridge AFTER the current scene and BEFORE the next scene appears, so it must be very short.

Use the context you're given — the story's title and premise (for overall tone), what led up to this moment, the choice the child picked, and the scene that comes next — so the line fits the story's voice and flows naturally into what follows.

If the author included a request or a rough draft, follow it: honour their intent and wording where you can, while still obeying the rules below.

RULES:
- LANGUAGE: write the outcome STRICTLY in the language named under "WRITE IN" in the context — even when the author's request below is written in a different language. The request tells you WHAT to write; "WRITE IN" tells you which language to write it in.
- LENGTH: prefer 1 sentence; at most 2 short sentences. As a soft guide aim for ~250 characters or fewer (guidance, not a hard cap) — shorter is better for a bridge line.
- POINT OF VIEW: 2nd person — the player IS the hero. Use "you" as the subject (the rest of the storybook is also written in 2nd person, so this must match).
- TENSE: past tense.
- TONE: match the story's tone (gentle, adventurous, spooky, hopeful…) inferred from the premise and surrounding scenes — don't fall back to a generic voice.
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

  const lines: string[] = [];
  lines.push(`WRITE IN: ${languageName(body.language)}`, "");
  if (body.storyTitle) lines.push(`STORY: ${body.storyTitle}`);
  if (body.storyPremise) lines.push(`PREMISE / TONE: ${body.storyPremise}`);
  if (lines.length > 0) lines.push("");

  if (body.incoming.length > 0) {
    lines.push("WHAT LED HERE (earlier scene + the choice taken to arrive):");
    for (const inc of body.incoming) {
      lines.push(`- After "${inc.label}": ${inc.narration}`);
    }
    lines.push("");
  }

  lines.push("CURRENT SCENE", body.sourceNarration, "");
  lines.push(`THE CHILD PICKED: "${body.branchLabel}"`, "");
  lines.push("NEXT SCENE", body.nextNarration || "(continuation)");
  if (body.nextChoices.length > 0) {
    lines.push(
      `Choices that follow there: ${body.nextChoices
        .map((c) => `"${c}"`)
        .join(", ")}`,
    );
  }
  lines.push("");

  if (body.authorRequest && body.authorRequest.trim().length > 0) {
    lines.push(
      "AUTHOR'S REQUEST (incorporate this — it may be a rough draft to polish or an instruction to follow):",
      body.authorRequest.trim(),
      "",
    );
  }
  lines.push(`Write the outcome line in ${languageName(body.language)}.`);
  const userText = lines.join("\n");

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
