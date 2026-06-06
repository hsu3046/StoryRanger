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
import { VOICES } from "@/data/voices";
import { slugify } from "@/app/admin/_lib/slugify";

export const runtime = "nodejs";

const RequestSchema = z.object({
  concept: ConceptSchema,
  storyboard: StoryboardSchema,
  authorRequest: z.string().max(4000).optional(),
  /** Soft target for how many main characters (hero + key NPCs) to design. */
  castCount: z.number().int().min(1).max(10).optional(),
  /** Author-locked cast members the model must NOT recreate — they already
   *  exist and the client keeps them. Design only the rest of the cast. */
  lockedCharacters: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        isHero: z.boolean(),
        bio: z.string(),
      }),
    )
    .optional(),
});

// Auto-cast a voice by matching the LLM's classified profile against the
// voices.json tag vocabulary (age/tone/gender/feature). Deterministic; the
// author can still change the pick in the editor. `used` spreads distinct
// voices across the cast so siblings don't all share one voice.
const FALLBACK_VOICE = VOICES[0]?.id ?? "";
function pickVoiceByTags(
  want: { gender: string; age: string; tone: string; feature: string },
  used: Set<string>,
): string {
  let bestId = FALLBACK_VOICE;
  let bestScore = -Infinity;
  for (const v of VOICES) {
    let s = 0;
    if (want.gender && v.tags.includes(want.gender)) s += 3;
    if (want.age && v.tags.includes(want.age)) s += 2;
    if (want.tone && v.tags.includes(want.tone)) s += 1;
    if (want.feature && v.tags.includes(want.feature)) s += 3;
    if (!used.has(v.id)) s += 0.5; // prefer an as-yet-unused voice
    if (s > bestScore) {
      bestScore = s;
      bestId = v.id;
    }
  }
  used.add(bestId);
  return bestId;
}

// NPC colour palette (cycled deterministically by order).
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
- Create an NPC (role "npc") for every named character the beat synopses imply (other than the hero) — the recurring or important figures the story needs. Give each a stable lowercase kebab-case id derived from their name.
- Do NOT create companions/party members (role "companion") — battles are added later by hand.
- For each NPC give a persona: bio (1-3 sentences), speechStyle, voiceTraits, dos (2-4), donts (1-3).
- For EVERY character (including hero + narrator) set the voice-casting hints so the right voice is auto-picked: voiceGender (male/female/neutral), voiceAge (young/adult/elder), voiceTone (warm/bright/calm/dark), and voiceFeature ("" or a special tag like "evil"/"funny"/"robot"/"fairy"/"monster" when it fits the character).
- For EVERY character give a vivid one-line visualDescription (face, hair, outfit, palette, proportions) the illustrator will follow.

LANGUAGE: write name/bio/speechStyle/voiceTraits/dos/donts in the language named under "WRITE IN". The visualDescription stays in English (illustrator brief). ids and the voiceGender/voiceAge/voiceTone/voiceFeature tag tokens stay as the fixed English values above — never translate them.

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
  const usedVoices = new Set<string>();

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

    const voice = pickVoiceByTags(
      {
        gender: g.voiceGender,
        age: g.voiceAge,
        tone: g.voiceTone,
        feature: g.voiceFeature,
      },
      usedVoices,
    );
    const color = isHero ? "#c9a23a" : isNarrator ? "#6b7280" : COLORS[npcIdx % COLORS.length];
    if (givesPersona) npcIdx += 1;

    characters.push({
      id,
      name: g.name,
      ...(isHero ? { isHero: true } : {}),
      gender: g.voiceGender,
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
      gender: "neutral",
      voice: pickVoiceByTags(
        { gender: "", age: "adult", tone: "calm", feature: "" },
        usedVoices,
      ),
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
      gender: "neutral",
      voice: pickVoiceByTags(
        { gender: "", age: "adult", tone: "warm", feature: "" },
        usedVoices,
      ),
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
  const userLines: string[] = [
    `WRITE IN: ${c.language}`,
    "",
    `TITLE: ${c.title}`,
    `PREMISE: ${c.premise}`,
    ...(c.tone ? [`TONE (shape voices/speech to this): ${c.tone}`] : []),
    `THEMES: ${c.themes.join(", ")}`,
    `ART STYLE: ${c.artStylePrompt}`,
    "",
    "STORYBOARD (beat synopses — invent the NPCs these imply, plus hero + narrator):",
    sb.beats.map((b) => `- [${b.id}] ${b.synopsis}`).join("\n"),
    "",
  ];
  if (body.castCount) {
    userLines.push(
      `CAST SIZE: aim for about ${body.castCount} main character${body.castCount === 1 ? "" : "s"} (the hero + the key NPCs the story needs, plus the narrator). Don't pad with extras.`,
      "",
    );
  }
  if (body.lockedCharacters && body.lockedCharacters.length > 0) {
    userLines.push(
      "ALREADY EXIST — these cast members are FIXED. Do NOT recreate them, reuse their ids, or add another character with the same role (if the hero is listed, do NOT create a hero). Design ONLY the rest of the cast the story needs, and keep them distinct from these:",
      ...body.lockedCharacters.map(
        (lc) =>
          `- ${lc.name}${lc.isHero ? " (hero)" : ""}${lc.bio ? ` — ${lc.bio}` : ""}`,
      ),
      "",
    );
  }
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
