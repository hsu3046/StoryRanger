import { NextResponse } from "next/server";
import { z } from "zod";

import { chat, hasLLMKey } from "@/lib/llm";
import { ConceptSchema, StoryboardSchema, type StoryboardT } from "@/data/schemas";

export const runtime = "nodejs";

const RequestSchema = z.object({
  concept: ConceptSchema,
  authorRequest: z.string().max(4000).optional(),
});

const SYSTEM_PROMPT = `You are a children's picture-book editor laying out the STORYBOARD (the beat-by-beat skeleton) for an interactive storybook. No prose yet — just structure.

Produce an ordered list of BEATS. Each beat is one page/scene:
- id: a short unique lowercase kebab-case slug (e.g. "kitchen-morning"). Stable — it becomes the scene key.
- title: a brief editor label (not shown to the child).
- synopsis: 1-2 lines on what happens here.
- speaker: "narrator" for most beats, or a character id (lowercase kebab-case) when a specific character carries the moment. The protagonist is the player-named hero with id "hero".
- setting: location + time of day (drives the illustration).
- isEnding: true only for terminal beats; set endingLabel (e.g. "A Happy Homecoming") when true, else "".
- branches: the choices leading onward. Each: id (kebab slug, unique within the beat), label (what the child taps), next (the id of an EXISTING beat), outcomeHint ("" or a 1-line bridge).

STRUCTURE RULES:
- 8-16 beats. Start with a single opening beat.
- It is a DAG: branches may CONVERGE (multiple beats point to the same next), but every "next" MUST reference a real beat id in this list.
- Non-ending beats have 1-3 branches. Ending beats have NO branches.
- At least one reachable ending. Offer real choices (2-3 branches) on a few key beats so the story branches and reconverges; keep the rest mostly linear (single branch).
- Pick a startSceneId equal to the opening beat's id.

LANGUAGE: write title/synopsis/labels/setting/endingLabel/outcomeHint in the language named under "WRITE IN" — but ids stay ASCII kebab-case.

Output JSON only matching the schema. No markdown.`;

/** Deterministic referential-integrity lint over the storyboard graph. */
function lintStoryboard(sb: StoryboardT): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = sb.beats.map((b) => b.id);
  const idSet = new Set(ids);

  // Duplicate ids.
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`duplicate beat id "${id}"`);
    seen.add(id);
  }

  if (!idSet.has(sb.startSceneId)) {
    errors.push(`startSceneId "${sb.startSceneId}" is not a beat id`);
  }

  for (const beat of sb.beats) {
    for (const br of beat.branches) {
      if (!idSet.has(br.next)) {
        errors.push(`beat "${beat.id}" → branch "${br.id}".next "${br.next}" is not a beat id`);
      }
    }
    if (beat.isEnding && beat.branches.length > 0) {
      warnings.push(`ending beat "${beat.id}" still has branches`);
    }
    if (!beat.isEnding && beat.branches.length === 0) {
      warnings.push(`beat "${beat.id}" is a dead end (no branches, not an ending)`);
    }
  }

  // Reachability from start (warn on orphans).
  const reachable = new Set<string>();
  const stack = [sb.startSceneId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (reachable.has(cur) || !idSet.has(cur)) continue;
    reachable.add(cur);
    const beat = sb.beats.find((b) => b.id === cur);
    for (const br of beat?.branches ?? []) stack.push(br.next);
  }
  for (const id of ids) {
    if (!reachable.has(id)) warnings.push(`beat "${id}" is unreachable from the start`);
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
  const userLines: string[] = [
    `WRITE IN: ${c.language}`,
    "",
    `TITLE: ${c.title}`,
    c.subtitle ? `SUBTITLE: ${c.subtitle}` : "",
    `PREMISE / TONE: ${c.premise}`,
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
  userLines.push(`Lay out the storyboard now, in ${c.language}.`);

  try {
    const storyboard = await chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userLines.join("\n") }],
      schema: StoryboardSchema,
      schemaName: "storyboard",
    });
    const lint = lintStoryboard(storyboard);
    return NextResponse.json({ storyboard, lint });
  } catch (err) {
    console.error("[generate/storyboard] LLM error", err);
    return NextResponse.json({ error: "llm_failed" }, { status: 502 });
  }
}
