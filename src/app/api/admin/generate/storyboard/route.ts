import { NextResponse } from "next/server";
import { z } from "zod";

import { chat, hasLLMKey } from "@/lib/llm";
import {
  ConceptSchema,
  StoryboardBeatSchema,
  StoryboardSchema,
  type StoryboardT,
} from "@/data/schemas";

// Art-style is author-picked, importance steers pagination — force the LLM to
// emit `importance` (its schema default would otherwise make it optional and the
// model could skip it, flattening every beat to 3).
const LLMStoryboardSchema = StoryboardSchema.extend({
  beats: z.array(
    StoryboardBeatSchema.omit({ importance: true }).extend({
      importance: z.number().int().min(1).max(5),
    }),
  ),
});

export const runtime = "nodejs";

const RequestSchema = z.object({
  concept: ConceptSchema,
  /** Desired number of storyboard beats (the arc's resolution). Clamped 5–12. */
  beatCount: z.number().int().optional(),
  authorRequest: z.string().max(4000).optional(),
});

export const BEAT_MIN = 5;
export const BEAT_MAX = 12;
const clampBeats = (n: number | undefined): number =>
  Math.max(BEAT_MIN, Math.min(BEAT_MAX, Math.round(n ?? 8)));

/**
 * Linear arc prompt — the storyboard is now the high-level FLOW only (a small
 * ordered set of beats), NOT the page-level scene graph. Branching, choices,
 * and battles are authored later in the story graph, so beats carry no
 * branches; the page expansion + narration happens in the scene stage.
 */
function systemPrompt(beatCount: number): string {
  return `You are a children's picture-book editor laying out the STORYBOARD — the high-level beat skeleton (the story's overall flow) for an interactive storybook. No prose yet — just the arc.

Produce an ordered, LINEAR list of BEATS — the major story moments from opening to ending, in reading order. Each beat:
- id: a short unique lowercase kebab-case slug (e.g. "kitchen-morning"). Stable.
- title: a brief editor label (not shown to the child).
- synopsis: 1-2 lines on what happens in this beat. This is the only content — who speaks and where it's set are decided later, when the beat is expanded into pages.
- importance: an integer 1-5 for how pivotal this beat is — 5 = the climax / most emotionally important moment, 3 = a normal story beat, 1 = a quick transition. The scene stage gives higher-importance beats MORE pages. Shape the arc honestly: usually one (occasionally two) 5s around the climax, lower numbers for setup/transition beats.
- isEnding: true ONLY for the final beat; set endingLabel (e.g. "A Happy Homecoming") when true, else "".
- branches: ALWAYS an empty array []. Do NOT create choices — this storyboard is a straight, linear flow. (Branching, choices, and battles are authored LATER in the story graph, not here.)

STRUCTURE RULES:
- EXACTLY ${beatCount} beats, in order. The first beat opens the story; the LAST beat is the ending (isEnding=true, endingLabel set).
- Shape the arc well: setup → rising action → climax → resolution — a satisfying beginning, middle, and end. Each beat moves the story forward.
- Every beat except the last has isEnding=false and endingLabel "".
- branches is [] for EVERY beat.
- startSceneId = the first beat's id.

LANGUAGE: write title/synopsis/endingLabel in the language named under "WRITE IN" — but ids stay ASCII kebab-case.

Output JSON only matching the schema. No markdown.`;
}

/** Deterministic lint over the (now linear) storyboard. */
function lintStoryboard(sb: StoryboardT): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = sb.beats.map((b) => b.id);
  const idSet = new Set(ids);

  // Duplicate ids collapse to one scene key in expansion — block.
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`duplicate beat id "${id}"`);
    seen.add(id);
  }

  if (!idSet.has(sb.startSceneId)) {
    errors.push(`startSceneId "${sb.startSceneId}" is not a beat id`);
  }
  if (!sb.beats.some((b) => b.isEnding)) {
    warnings.push("no ending beat — the last beat should be an ending");
  }

  return { errors, warnings };
}

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

  const c = body.concept;
  const beatCount = clampBeats(body.beatCount);
  const userLines: string[] = [
    `WRITE IN: ${c.language}`,
    "",
    `TITLE: ${c.title}`,
    c.subtitle ? `SUBTITLE: ${c.subtitle}` : "",
    `PREMISE: ${c.premise}`,
    c.lesson
      ? `LESSON (the arc must build toward this; the final beat resolves it): ${c.lesson}`
      : "",
    c.tone ? `TONE: ${c.tone}` : "",
    `THEMES: ${c.themes.join(", ")}`,
    `TARGET AGE: ${c.targetAge.min}-${c.targetAge.max}`,
    "",
  ].filter(Boolean);
  if (body.authorRequest && body.authorRequest.trim()) {
    userLines.push(
      "REVISION REQUEST (incorporate):",
      body.authorRequest.trim(),
      "",
    );
  }
  userLines.push(
    `Lay out the storyboard now as EXACTLY ${beatCount} linear beats, in ${c.language}.`,
  );

  try {
    const storyboard = await chat({
      system: systemPrompt(beatCount),
      messages: [{ role: "user", content: userLines.join("\n") }],
      schema: LLMStoryboardSchema,
      schemaName: "storyboard",
    });
    const lint = lintStoryboard(storyboard);
    return NextResponse.json({ storyboard, lint });
  } catch (err) {
    console.error("[generate/storyboard] LLM error", err);
    return NextResponse.json({ error: "llm_failed" }, { status: 502 });
  }
}
