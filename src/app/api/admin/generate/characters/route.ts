import { NextResponse } from "next/server";
import { z } from "zod";

import { chat, hasLLMKey } from "@/lib/llm";
import {
  CharacterArtFileSchema,
  CharactersFileSchema,
  ConceptSchema,
  GeneratedCharactersSchema,
  StoryboardSchema,
  type GeneratedCharacterT,
} from "@/data/schemas";
import type { Character } from "@/types/story";
import { slugify } from "@/app/admin/_lib/slugify";

export const runtime = "nodejs";

const RequestSchema = z.object({
  concept: ConceptSchema,
  storyboard: StoryboardSchema,
  authorRequest: z.string().max(4000).optional(),
});

const DEFAULT_NARRATOR_VOICE = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_HERO_VOICE = "EXAVITQu4vr4xnSDxMaL";
// NPC voice + colour palettes (cycled deterministically by order).
const NPC_VOICES = [
  "ErXwobaYiN019PkySvjV",
  "pNInz6obpgDQGcFmaJgB",
  "VR6AewLTigWG4xSOukaG",
  "AZnzlk1XvdvUeBnXmlld",
  "MF3mGyEYCl7XYWbV9V6O",
  "TxGEqnHWrfWFTfGW9XjX",
  "RILOU7YmBhvwJGDGjNmP",
  "yoZ06aMxZJJ28mfd3POQ",
];
const COLORS = [
  "#3a7ca5",
  "#8a5a44",
  "#5a8a44",
  "#a5446b",
  "#6b5aa5",
  "#a56b3a",
  "#447c8a",
];

const SYSTEM_PROMPT = `You are a children's picture-book character designer. Given the concept and storyboard, design the CAST.

Rules:
- Include exactly ONE protagonist with role "hero" and id "hero". The hero is player-named, so give a neutral default name; the hero has no persona fields (leave speechStyle/voiceTraits "" and dos/donts []).
- Include a "narrator" (role "narrator", id "narrator") — leave persona fields empty like the hero.
- Create an NPC (role "npc") for every distinct character the storyboard refers to as a "speaker" (other than narrator/hero), plus any clearly-named characters in the synopses. Use the SAME lowercase kebab-case id the storyboard used.
- Do NOT create companions/party members (role "companion") — battles are added later by hand.
- For each NPC give a persona: bio (1-3 sentences), speechStyle, voiceTraits, dos (2-4), donts (1-3).
- For EVERY character give a vivid one-line visualDescription (face, hair, outfit, palette, proportions) the illustrator will follow.

LANGUAGE: write name/bio/speechStyle/voiceTraits/dos/donts in the language named under "WRITE IN". The visualDescription stays in English (illustrator brief). ids stay ASCII kebab-case.

Output JSON only matching the schema. No markdown.`;

/** Map an LLM-generated cast onto the real Character schema + an art map. */
function mapCharacters(generated: GeneratedCharacterT[]): {
  characters: Character[];
  art: { id: string; visualDescription: string }[];
} {
  const characters: Character[] = [];
  const art: { id: string; visualDescription: string }[] = [];
  let heroAssigned = false;
  let npcIdx = 0;
  let fallbackIdx = 0;
  const usedIds = new Set<string>();

  for (const g of generated) {
    // Force a single hero with the conventional id "hero". Otherwise normalise
    // the LLM id to a NAME_RE-safe slug so it can be used as an image filename
    // (characters/<id>, dialogue/<id>) and a scene speaker reference. A
    // non-ASCII id (e.g. Korean/Japanese) slugifies to "" — fall back to a
    // deterministic safe id, NOT the raw string (saveStoryImage's NAME_RE would
    // reject it and the sprite/portrait generation would fail).
    let id = slugify(g.id) || `character-${++fallbackIdx}`;
    let isHero = false;
    if (g.role === "hero" && !heroAssigned) {
      id = "hero";
      isHero = true;
      heroAssigned = true;
    } else if (id === "hero") {
      // Reserve the "hero" id for the protagonist — otherwise an NPC whose name
      // slugifies to "hero" collides with the fallback hero appended below
      // (two characters with id "hero" → mis-bound art/persona).
      id = "hero-npc";
    }
    if (usedIds.has(id)) continue; // dedupe
    usedIds.add(id);

    const isNarrator = g.role === "narrator" || id === "narrator";
    const givesPersona = !isHero && !isNarrator;

    const voice = isHero
      ? DEFAULT_HERO_VOICE
      : isNarrator
        ? DEFAULT_NARRATOR_VOICE
        : NPC_VOICES[npcIdx % NPC_VOICES.length];
    const color = isHero ? "#c9a23a" : isNarrator ? "#6b7280" : COLORS[npcIdx % COLORS.length];
    if (givesPersona) npcIdx += 1;

    characters.push({
      id,
      name: g.name,
      ...(isHero ? { isHero: true } : {}),
      voice,
      voiceSpeed: 1,
      color,
      size: "medium",
      ...(givesPersona
        ? {
            persona: {
              shortBio: g.bio,
              speechStyle: g.speechStyle,
              voiceTraits: g.voiceTraits,
              dos: g.dos,
              donts: g.donts,
              giftableItems: [],
            },
          }
        : {}),
    });
    if (g.visualDescription.trim()) {
      art.push({ id, visualDescription: g.visualDescription.trim() });
    }
  }

  // Guarantee a narrator + a hero exist (engine relies on isHero).
  if (!characters.some((c) => c.id === "narrator")) {
    characters.unshift({
      id: "narrator",
      name: "Narrator",
      voice: DEFAULT_NARRATOR_VOICE,
      voiceSpeed: 1,
      color: "#6b7280",
      size: "medium",
    });
  }
  if (!characters.some((c) => c.isHero)) {
    characters.push({
      id: "hero",
      name: "Hero",
      isHero: true,
      voice: DEFAULT_HERO_VOICE,
      voiceSpeed: 1,
      color: "#c9a23a",
      size: "medium",
    });
  }

  return { characters, art };
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

  const { concept: c, storyboard: sb } = body;
  // Distinct speaker ids the storyboard references (excluding narrator/hero).
  const speakers = Array.from(
    new Set(sb.beats.map((b) => b.speaker).filter((s) => s && s !== "narrator" && s !== "hero")),
  );
  const userLines: string[] = [
    `WRITE IN: ${c.language}`,
    "",
    `TITLE: ${c.title}`,
    `PREMISE / TONE: ${c.premise}`,
    `THEMES: ${c.themes.join(", ")}`,
    `ART STYLE: ${c.artStyleBible.medium}; ${c.artStyleBible.palette}; ${c.artStyleBible.mood}`,
    "",
    "STORYBOARD SPEAKER IDS that need a character (besides narrator/hero):",
    speakers.length ? speakers.map((s) => `- ${s}`).join("\n") : "- (none — invent NPCs as the synopses imply)",
    "",
    "BEAT SYNOPSES (for context):",
    sb.beats.map((b) => `- [${b.id}] ${b.synopsis}`).join("\n"),
    "",
  ];
  if (body.authorRequest && body.authorRequest.trim()) {
    userLines.push("REVISION REQUEST (incorporate):", body.authorRequest.trim(), "");
  }
  userLines.push(`Design the cast now, in ${c.language}.`);

  try {
    const generated = await chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userLines.join("\n") }],
      schema: GeneratedCharactersSchema,
      schemaName: "characters",
    });

    const { characters, art } = mapCharacters(generated.characters);
    // Validate the mapped output against the REAL schemas before returning.
    const charactersFile = CharactersFileSchema.parse({ characters });
    const characterArt = CharacterArtFileSchema.parse({ entries: art });

    return NextResponse.json({ characters: charactersFile, characterArt });
  } catch (err) {
    console.error("[generate/characters] LLM error", err);
    return NextResponse.json({ error: "llm_failed" }, { status: 502 });
  }
}
