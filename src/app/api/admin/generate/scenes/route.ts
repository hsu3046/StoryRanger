import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { chat, hasLLMKey } from "@/lib/llm";
import {
  CharactersFileSchema,
  ConceptSchema,
  StoryboardSchema,
  type DraftSceneMetaT,
} from "@/data/schemas";
import type { Branch, Scene, Story } from "@/types/story";

export const runtime = "nodejs";

const RequestSchema = z.object({
  storyId: z.string(),
  concept: ConceptSchema,
  storyboard: StoryboardSchema,
  characters: CharactersFileSchema,
  /** Target number of pages (scenes). Clamped to [beats, PAGE_MAX]. */
  sceneCount: z.number().int().optional(),
});

export const PAGE_MIN = 12;
export const PAGE_MAX = 40;

/** One paginated page the LLM emits (id/branches are assigned server-side). */
const PageSchema = z.object({
  /** The beat this page expands (must be one of the storyboard beat ids). */
  parentBeatId: z.string(),
  /** "narrator" or a character id carrying this page. */
  speaker: z.string(),
  /** Location + time of day — drives the page illustration. */
  setting: z.string(),
  /** One line: what this page shows. */
  synopsis: z.string(),
  /** The storybook prose the child reads on this page. */
  narration: z.string(),
});
const LLMSchema = z.object({ pages: z.array(PageSchema) });

function continueLabel(lang: string): string {
  const l = lang.toLowerCase();
  if (l.startsWith("ko") || l.includes("korean") || l.includes("한")) return "다음";
  if (l.startsWith("ja") || l.includes("japanese") || l.includes("日")) return "つぎへ";
  return "Continue";
}

const SYSTEM_PROMPT = `You are a children's picture-book editor. You are PAGINATING a finished, linear story arc into the actual book pages and writing the narration prose for each page.

You are given the STORYBOARD — an ordered list of BEATS (the high-level story moments). Expand it into EXACTLY the requested number of ordered PAGES (scenes).

PAGINATION RULES:
- Follow the beats IN ORDER. Each page belongs to exactly ONE beat — set parentBeatId to that beat's id. All pages of a beat come before any page of a later beat. Never reorder, skip, or merge beats.
- Distribute the pages across the beats by importance: give the climax and emotionally rich beats MORE pages so the moment breathes across spreads; give quick transitions ONE page. EVERY beat gets at least one page.
- Each page is a single page-turn's worth — advance the story a little. Don't cram a multi-page beat onto one page.
- The FIRST page opens the story; the LAST page is the ending (its parentBeatId is the ending beat).
- For each page output: parentBeatId, speaker ("narrator" or a cast id), setting (location + time — for the illustration), synopsis (one line, what this page shows), and narration.

NARRATION RULES (the book's storybook voice):
- HERO NAME / PRONOUNS: never invent a name or gender for the hero. Use templates {{name}}, {{they}}/{{They}}, {{their}}/{{Their}} — the app fills them per player. Example: "{{name}} crouched low. {{They}} held {{their}} breath."
- POINT OF VIEW: third-person storybook narration about the hero — do NOT address the hero as "you".
- If the speaker is a named character, feature their spoken lines (in quotes) with light framing; otherwise write descriptive narration.
- LENGTH: 2-4 short sentences per page (~250 characters or fewer, soft guide).
- Match the story's tone from the premise. No emojis, no markdown.

LANGUAGE: write setting/synopsis/narration STRICTLY in the language named under "WRITE IN". Beat ids stay ASCII.

Output JSON only matching the schema: { pages: [ ... ] } with the pages in reading order.`;

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

  const { concept: c, storyboard: sb, characters: chars } = body;
  const beatIds = sb.beats.map((b) => b.id);
  if (beatIds.length === 0) {
    return NextResponse.json({ error: "no_beats" }, { status: 400 });
  }
  const beatById = new Map(sb.beats.map((b) => [b.id, b]));
  const sceneCount = Math.max(
    beatIds.length,
    Math.min(PAGE_MAX, Math.round(body.sceneCount ?? PAGE_MIN)),
  );

  // Allowed speakers = cast ids + narrator (so we can clamp a hallucinated id).
  const allowedSpeakers = new Set<string>(["narrator", ...chars.characters.map((ch) => ch.id)]);

  const userLines: string[] = [
    `WRITE IN: ${c.language}`,
    "",
    `STORY: ${c.title}`,
    c.subtitle ? `SUBTITLE: ${c.subtitle}` : "",
    `PREMISE: ${c.premise}`,
    c.lesson ? `LESSON (the final pages should land this): ${c.lesson}` : "",
    c.tone ? `TONE (match the narration voice to this): ${c.tone}` : "",
    "",
    `CAST: ${chars.characters.map((ch) => `${ch.id} (${ch.name})`).join(", ")}`,
    "",
    "STORYBOARD BEATS (in order):",
  ].filter(Boolean);
  sb.beats.forEach((b, i) => {
    userLines.push(
      `${i + 1}. id=${b.id}${b.isEnding ? " [ENDING]" : ""}: ${b.synopsis}`,
    );
  });
  userLines.push(
    "",
    `Paginate into EXACTLY ${sceneCount} ordered pages and write each page's narration, in ${c.language}.`,
  );

  let llm: z.infer<typeof LLMSchema>;
  try {
    llm = await chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userLines.join("\n") }],
      schema: LLMSchema,
      schemaName: "scene_pages",
    });
  } catch (err) {
    console.error("[generate/scenes] LLM error", err);
    return NextResponse.json({ error: "llm_failed" }, { status: 502 });
  }

  const pages = llm.pages.filter((p) => p && typeof p.narration === "string");
  if (pages.length === 0) {
    return NextResponse.json({ error: "empty_pagination" }, { status: 502 });
  }

  // Assemble the linear Story. Scene ids are random + stable (never shown to
  // the user, used only as scene keys / image filenames / branch targets) — a
  // sequential 1..N would wrongly imply a fixed order once pages are reordered.
  // "s" prefix guarantees a non-digit first char: an all-hex-digit id (e.g.
  // "12345678") would be an array-index-like key that Object.keys() hoists to
  // the front, breaking the insertion-order the page list / relink rely on.
  const usedIds = new Set<string>();
  const freshId = (): string => {
    let id = `s${randomUUID().slice(0, 8)}`;
    while (usedIds.has(id)) id = `s${randomUUID().slice(0, 8)}`;
    usedIds.add(id);
    return id;
  };
  const ids = pages.map(() => freshId());
  const label = continueLabel(c.language);
  let lastValidBeat = beatIds[0];

  const scenes: Record<string, Scene> = {};
  const sceneMeta: DraftSceneMetaT = { scenes: {} };

  pages.forEach((p, i) => {
    const id = ids[i];
    const parentBeatId = beatById.has(p.parentBeatId) ? p.parentBeatId : lastValidBeat;
    lastValidBeat = parentBeatId;
    const beat = beatById.get(parentBeatId);
    const speaker = allowedSpeakers.has(p.speaker) ? p.speaker : "narrator";
    const isLast = i === pages.length - 1;
    const branches: Branch[] = isLast
      ? []
      : [{ id: "continue", label, next: ids[i + 1] }];

    scenes[id] = {
      image: `/stories/${body.storyId}/scenes/${id}`,
      bgm: "",
      speaker,
      narration: p.narration.trim(),
      branches,
      ...(isLast
        ? { ending: { id, label: beat?.endingLabel || "The End" } }
        : {}),
    };
    sceneMeta.scenes[id] = {
      setting: p.setting ?? "",
      synopsis: p.synopsis ?? beat?.synopsis ?? "",
      parentBeatId,
    };
  });

  const story: Story = {
    id: body.storyId,
    title: c.title,
    ...(c.subtitle.trim() ? { subtitle: c.subtitle.trim() } : {}),
    language: c.language,
    estimatedMinutes: c.estimatedMinutes,
    coverImage: `/stories/${body.storyId}/cover`,
    startScene: ids[0],
    scenes,
  };

  return NextResponse.json({ story, sceneMeta });
}
