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
  /** Author-locked fields the model must HONOR exactly (and write the rest to
   *  fit). The client keeps these values regardless; passing them here keeps the
   *  generated fields consistent with the author's intent. */
  constraints: z
    .object({
      title: z.string(),
      subtitle: z.string(),
      premise: z.string(),
      lesson: z.string(),
      tone: z.string(),
      themes: z.array(z.string()),
      targetAge: z.object({ min: z.number().int(), max: z.number().int() }),
    })
    .partial()
    .optional(),
});

const SYSTEM_PROMPT = `You are a children's picture-book editor. Turn the author's brief into a tight, production-ready CONCEPT for an interactive storybook for young children (roughly ages 4-9).

Produce:
- title + a short subtitle (tagline; "" if none fits)
- premise: 1-2 sentences — the SETUP/hook: who the hero is and the situation or problem that starts the story. Describe WHAT happens, NOT the message or the mood.
- lesson: ONE warm sentence — the heart of the book: what you want a child to learn or feel by the end (e.g. "asking for help is brave too"). The story's ending should land this.
- tone: a few mood words for how the book FEELS (e.g. "cozy, gentle, a little mysterious").
- targetAge: a sensible {min,max} year band.
- themes: 2-5 short topic themes (e.g. courage, friendship).
- language: echo back the language you are told to WRITE IN.
- estimatedMinutes: a realistic read/play time (typically 8-20).

(The visual art style is chosen separately by the author from a template gallery — do NOT invent one.)

RULES:
- LANGUAGE: write title/subtitle/premise/lesson/tone/themes STRICTLY in the language named under "WRITE IN", even if the brief is in another language.
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
  // Author-locked fields: the model must keep these EXACTLY and shape the rest
  // around them (the client re-applies them too, so they never drift).
  const k = body.constraints;
  if (k) {
    const fixed: string[] = [];
    if (k.targetAge) fixed.push(`- target age: ${k.targetAge.min}-${k.targetAge.max}`);
    if (k.themes?.length) fixed.push(`- themes: ${k.themes.join(", ")}`);
    if (k.lesson?.trim()) fixed.push(`- lesson (the heart): ${k.lesson.trim()}`);
    if (k.title?.trim()) fixed.push(`- title: ${k.title.trim()}`);
    if (k.subtitle?.trim()) fixed.push(`- subtitle: ${k.subtitle.trim()}`);
    if (k.premise?.trim()) fixed.push(`- premise: ${k.premise.trim()}`);
    if (k.tone?.trim()) fixed.push(`- tone: ${k.tone.trim()}`);
    if (fixed.length) {
      lines.push(
        "",
        "FIXED (the author set these — keep them EXACTLY, echo them back unchanged, and write every other field to fit them):",
        ...fixed,
      );
    }
  }
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
      // those fields. lesson/tone carry .default("") on the schema (for reading
      // older drafts) but we DO want the model to generate them, so re-add them
      // as required (no default) for the structured-output call.
      schema: ConceptSchema.omit({
        artStyleId: true,
        artStylePrompt: true,
        lesson: true,
        tone: true,
      }).extend({ lesson: z.string(), tone: z.string() }),
      schemaName: "concept",
    });
    return NextResponse.json({ concept });
  } catch (err) {
    console.error("[generate/concept] LLM error", err);
    return NextResponse.json({ error: "llm_failed" }, { status: 502 });
  }
}
