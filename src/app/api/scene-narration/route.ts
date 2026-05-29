import { NextResponse } from "next/server";
import { z } from "zod";

import { chat, hasLLMKey } from "@/lib/llm";

export const runtime = "nodejs";

const RequestSchema = z.object({
  storyId: z.string(),
  /** Story language code (e.g. "en", "ko", "ja") or free-text. The narration
   *  must be written in THIS language regardless of the request's language. */
  language: z.string().max(40).optional(),
  storyTitle: z.string().max(200).optional(),
  storyPremise: z.string().max(600).optional(),
  /** Scene speaker id ("narrator" or a character id) + friendly name. */
  speaker: z.string().max(40),
  speakerName: z.string().max(60).optional(),
  /** Labels of the choices the child will see on THIS scene. */
  choices: z.array(z.string().max(200)).max(6).default([]),
  /** Scenes that branch INTO this scene — the lead-up, each with the label of
   *  the choice that arrived here. */
  incoming: z
    .array(
      z.object({
        label: z.string().max(200),
        narration: z.string().max(2000),
      }),
    )
    .max(3)
    .default([]),
  /** The author's own text in the field when they hit Generate — a rough
   *  draft to polish or an instruction to follow. Empty → generate fresh. */
  authorRequest: z.string().max(2000).optional(),
});

const ResponseSchema = z.object({
  narration: z.string(),
});

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ko: "Korean (한국어)",
  ja: "Japanese (日本語)",
};
function languageName(code: string | undefined): string {
  if (!code) return "English";
  return LANGUAGE_NAMES[code] ?? code;
}

// Static (story-agnostic) so it stays cache-friendly — per-story context is
// folded into the user message. Unlike the branch outcome (a short 2nd-person
// bridge line), scene narration is the scene's main storybook prose.
const SYSTEM_PROMPT = `You are helping an author draft narration for an interactive storybook for children.

You write the NARRATION for ONE scene: the storybook prose the child reads when they arrive. It sets the scene, advances the moment, and leads naturally toward the choices the child will see on this scene — without spoiling where each choice leads or deciding for them.

Use the context you're given — the story's title and premise (for tone), what led up to this moment, who is speaking, and the upcoming choices — so the scene fits the story's voice and sets those choices up.

SPEAKER:
- If the speaker is the narrator, write descriptive narration. You may include other characters' lines in quotation marks.
- If the speaker is a named character, center the prose on THAT character — feature their spoken lines (in quotes) and actions, with light framing narration around them.

If the author included a request or a rough draft, follow it: honour their intent and wording where you can, while obeying the rules below.

RULES:
- LANGUAGE: write STRICTLY in the language named under "WRITE IN" — even when the author's request is written in a different language. The request tells you WHAT to write; "WRITE IN" tells you which language.
- HERO NAME / PRONOUNS: never invent a fixed name or gender for the hero. Use the templates {{name}} (the hero's display name), {{they}}/{{They}}, and {{their}}/{{Their}} — the app fills these in per player. Example: "{{name}} crouched low. {{They}} held {{their}} breath."
- POINT OF VIEW: third-person storybook narration about the hero (this matches the rest of the book) — do NOT address the hero as "you".
- LENGTH: 2-4 short sentences. As a soft guide aim for ~250 characters or fewer (guidance, not a hard cap).
- TONE: match the story's tone (gentle, adventurous, spooky, hopeful…) from the premise and surrounding scenes.
- Lead toward the choices, but don't list them verbatim or pick one for the child.
- No emojis, no markdown.
- Output JSON only matching the schema.`;

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
  if (body.storyTitle || body.storyPremise) lines.push("");

  if (body.incoming.length > 0) {
    lines.push("WHAT LED HERE (earlier scene + the choice taken to arrive):");
    for (const inc of body.incoming) {
      lines.push(`- After "${inc.label}": ${inc.narration}`);
    }
    lines.push("");
  }

  lines.push("THIS SCENE");
  const who =
    body.speaker === "narrator"
      ? "narrator (write descriptive narration)"
      : `${body.speakerName ?? body.speaker} (this character is speaking — feature their lines)`;
  lines.push(`Speaker: ${who}`);
  if (body.choices.length > 0) {
    lines.push(
      `Choices the child will see here: ${body.choices
        .map((c) => `"${c}"`)
        .join(", ")}`,
    );
  } else {
    lines.push("(No choices — this may be an ending scene.)");
  }
  lines.push("");

  if (body.authorRequest && body.authorRequest.trim().length > 0) {
    lines.push(
      "AUTHOR'S REQUEST (incorporate this — it may be a rough draft to polish or an instruction to follow):",
      body.authorRequest.trim(),
      "",
    );
  }
  lines.push(`Write the scene narration in ${languageName(body.language)}.`);
  const userText = lines.join("\n");

  try {
    const parsed = await chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
      schema: ResponseSchema,
      schemaName: "scene_narration",
    });
    return NextResponse.json({ narration: parsed.narration.trim() });
  } catch (err) {
    console.error("[scene-narration] LLM error", err);
    return NextResponse.json({ error: "llm_failed" }, { status: 502 });
  }
}
