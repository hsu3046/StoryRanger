import { NextResponse } from "next/server";
import { z } from "zod";

import { chat, hasLLMKey } from "@/lib/llm";
import { ConceptSchema } from "@/data/schemas";

export const runtime = "nodejs";

const RequestSchema = z.object({
  /** The author's free-text brief for the story. */
  brief: z.string().min(1).max(4000),
  /** Language name or code to write in (e.g. "English", "ko"). */
  language: z.string().max(40).default("English"),
  /** Optional steering hints. */
  targetAgeHint: z.string().max(80).optional(),
  lengthHint: z.string().max(80).optional(),
  /** On regenerate: the admin's edited concept (as JSON text) or instructions
   *  to steer the re-roll. */
  authorRequest: z.string().max(4000).optional(),
});

const SYSTEM_PROMPT = `You are a children's picture-book editor. Turn the author's brief into a tight, production-ready CONCEPT for an interactive storybook for young children (roughly ages 4-9).

Produce:
- title + a short subtitle (tagline; "" if none fits)
- premise: 2-4 sentences capturing the setup, the central emotional arc, and the tone. This is the anchor every later stage is bound by.
- targetAge: a sensible {min,max} year band.
- themes: 2-5 short themes.
- language: echo back the language you are told to WRITE IN.
- estimatedMinutes: a realistic read/play time (typically 8-20).

(The visual art style is chosen separately by the author from a template gallery — do NOT invent one.)

RULES:
- LANGUAGE: write title/subtitle/premise/themes STRICTLY in the language named under "WRITE IN", even if the brief is in another language.
- Keep it warm, gentle, and age-appropriate. No violence, no scary realism.
- Output JSON only, matching the schema. No markdown, no commentary.`;

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

  if (!hasLLMKey()) {
    return NextResponse.json({ error: "no_api_key" }, { status: 503 });
  }

  const lines: string[] = [];
  lines.push(`WRITE IN: ${body.language}`, "");
  lines.push("AUTHOR BRIEF:", body.brief.trim(), "");
  if (body.targetAgeHint) lines.push(`TARGET AGE HINT: ${body.targetAgeHint}`);
  if (body.lengthHint) lines.push(`LENGTH HINT: ${body.lengthHint}`);
  if (body.authorRequest && body.authorRequest.trim()) {
    lines.push(
      "",
      "REVISION REQUEST (incorporate — may be an edited concept to refine or an instruction):",
      body.authorRequest.trim(),
    );
  }
  lines.push("", `Write the concept in ${body.language}.`);

  try {
    const concept = await chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: lines.join("\n") }],
      // Art style is author-picked from the gallery, not LLM-generated — omit
      // those fields so the model isn't asked to invent them.
      schema: ConceptSchema.omit({ artStyleId: true, artStylePrompt: true }),
      schemaName: "concept",
    });
    return NextResponse.json({ concept });
  } catch (err) {
    console.error("[generate/concept] LLM error", err);
    return NextResponse.json({ error: "llm_failed" }, { status: 502 });
  }
}
