import { NextResponse } from "next/server";
import { z } from "zod";

import { getStory } from "@/lib/stories";
import { getItem } from "@/data/items";
import { chat, hasLLMKey } from "@/lib/llm";
import {
  buildDialogueContext,
  buildPersonaSystemPrompt,
  trimDialogueHistory,
} from "@/lib/dialogue-personas";
import { SpeakerIdSchema } from "@/data/schemas";
import { requireSessionOr401 } from "@/lib/supabase/guard";
import type { DialogueResponse } from "@/types/story";

export const runtime = "nodejs";

const RequestSchema = z.object({
  storyId: z.string(),
  // Accept any known speaker id; dialogue-ability is decided downstream by
  // whether the resolved character has a persona (single source of truth).
  characterId: SpeakerIdSchema,
  hero: z.object({
    name: z.string().min(1).max(40),
    gender: z.enum(["girl", "boy"]),
  }),
  sceneId: z.string(),
  sceneNarration: z.string().max(2000),
  companions: z.array(z.enum(["scarecrow", "tinman", "lion"])).default([]),
  currentMood: z.number().min(0).max(10),
  history: z
    .array(
      z.object({
        role: z.enum(["hero", "character"]),
        text: z.string().max(2000),
      }),
    )
    .default([]),
  /** Hero's typed utterance. Empty string ONLY when isFirstTurn === true,
   *  in which case the LLM should greet the hero proactively. */
  utterance: z.string().max(500),
  /** True on the FIRST turn — LLM greets / acts without waiting for input. */
  isFirstTurn: z.boolean().optional(),
  /** True when this character has already gifted the hero — the gate then
   *  refuses any further gift regardless of mood. */
  alreadyGifted: z.boolean().default(false),
  /** Cross-character memory of things the hero has shared (global). */
  heroMemory: z.array(z.string().max(500)).max(40).default([]),
  /** Deterministic "adventures so far" one-liner. */
  journeyNote: z.string().max(600).default(""),
  /** Natural-language goal to judge THIS turn (from a seeded ask's unlock).
   *  Present only for unlock asks. The server only ever sees this goal — never
   *  the keyword it would unlock. */
  unlockGoal: z.string().max(500).optional(),
});

/** How many recent turns of THIS dialogue to replay to the LLM. */
const HISTORY_WINDOW = 8;

/** Mood (0..10) the character must reach before a gift is honoured. */
const GIFT_MOOD_THRESHOLD = 8;

const ResponseLLMSchema = z.object({
  reply: z.string(),
  /** Optional one-line action / body language: "leans against tree, sighing". */
  action: z.string().nullable(),
  moodDelta: z.number(),
  itemGift: z.string().nullable(),
  endsConversation: z.boolean(),
  /** Short follow-up replies the HERO might say next (3-8 words each). The
   *  prompt asks for exactly 2; we accept a loose range so an off-count
   *  response doesn't discard an otherwise-valid turn, then normalise to
   *  exactly 2 below. (Story-advancing choices are the scene branches, shown
   *  by the client alongside these.) */
  suggestions: z.array(z.string()).min(1).max(6),
  /** Silent per-turn judgment: did the child meet the supplied unlock goal?
   *  Only meaningful when a goal was sent; defaults false (an omitted field is
   *  a non-pass). Server hard-gates it on unlockGoal being present. */
  goalMet: z.boolean().default(false),
});

/** Generic suggestions used to pad up to 2 when the LLM returns fewer. */
const FALLBACK_SUGGESTIONS = ["Tell me more.", "Are you okay?"];

/** Force the suggestion list to exactly 2: drop blanks, cap at 2, then pad
 *  from the generic pool (avoiding duplicates). */
function normalizeSuggestions(raw: string[]): string[] {
  const out = raw.map((s) => s.trim()).filter(Boolean).slice(0, 2);
  for (const f of FALLBACK_SUGGESTIONS) {
    if (out.length >= 2) break;
    if (!out.includes(f)) out.push(f);
  }
  return out.slice(0, 2);
}

const SAFE_FALLBACK: DialogueResponse = {
  reply: "They smile gently, but the words won't come right now.",
  action: null,
  moodDelta: 0,
  itemGift: null,
  endsConversation: false,
  suggestions: ["Are you okay?", "Tell me more."],
  goalMet: false,
};

export async function POST(req: Request) {
  // Paid LLM — gate behind login (the proxy can't, it excludes /api).
  const gate = await requireSessionOr401();
  if (gate) return gate;

  let body;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const loaded = getStory(body.storyId);
  if (!loaded) {
    return NextResponse.json({ error: "unknown_story" }, { status: 404 });
  }

  // Persona content now lives on the character (admin-editable). Look it
  // up from the story's character list.
  const character = loaded.characters.characters.find(
    (c) => c.id === body.characterId,
  );
  const persona = character?.persona;
  if (!character || !persona) {
    return NextResponse.json(
      { error: "character_not_dialogue_able" },
      { status: 400 },
    );
  }

  if (!hasLLMKey()) {
    return NextResponse.json(SAFE_FALLBACK);
  }

  // STATIC system prompt — identical for every request to this character,
  // so it stays a cacheable prefix.
  const system = buildPersonaSystemPrompt(character.name, persona);

  // DYNAMIC per-turn context (hero name, mood, scene, party) — folded into
  // the latest user message so it never disturbs the cached system prefix.
  const context = buildDialogueContext(
    body.hero,
    body.currentMood,
    body.sceneNarration,
    body.companions,
    body.alreadyGifted,
    body.heroMemory,
    body.journeyNote,
    body.unlockGoal,
  );

  const history = trimDialogueHistory(body.history, HISTORY_WINDOW);

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const turn of history) {
    messages.push({
      role: turn.role === "hero" ? "user" : "assistant",
      content: turn.text,
    });
  }
  const turnText =
    body.isFirstTurn && body.utterance.length === 0
      ? `(${body.hero.name} approaches you and looks at you. Greet them in your voice — either with a short line of dialogue, an action (in *asterisks*), or both. Reflect the current scene + your mood.)`
      : body.utterance;
  // Dynamic context rides on the final user turn (after any history).
  messages.push({ role: "user", content: `${context}\n\n${turnText}` });

  try {
    const parsed = await chat({
      system,
      messages,
      schema: ResponseLLMSchema,
      schemaName: "dialogue",
    });

    const moodDelta = Math.max(-3, Math.min(3, Math.round(parsed.moodDelta)));

    // ── Item gift hard gate ──────────────────────────────────────────
    // The LLM only *proposes* a gift. The server enforces three of the
    // four conditions authoritatively:
    //   1. resulting mood ≥ threshold (earned through good conversation)
    //   3. the id is on the character's authored whitelist
    //   4. the id is a real item in the catalogue
    // Condition 2 (once per character) is asserted by the CLIENT via
    // `alreadyGifted`, since the only record of past gifts lives in the
    // player's local PlayState. A tampered client could re-farm gifts;
    // acceptable for the offline MVP. TODO: move the "once" record
    // server-side when player state lands in Supabase.
    // `giftableItems` is defaulted defensively — the character JSON is
    // loaded via a cast (no Zod parse), so a hand-edited persona could
    // omit it.
    const nextMood = Math.max(0, Math.min(10, body.currentMood + moodDelta));
    const proposed = parsed.itemGift;
    const giftable = persona.giftableItems ?? [];
    const itemGift =
      proposed &&
      !body.alreadyGifted &&
      nextMood >= GIFT_MOOD_THRESHOLD &&
      giftable.includes(proposed) &&
      getItem(body.storyId, proposed)
        ? proposed
        : null;

    const result: DialogueResponse = {
      reply: parsed.reply,
      action: parsed.action,
      moodDelta,
      itemGift,
      endsConversation: parsed.endsConversation,
      suggestions: normalizeSuggestions(parsed.suggestions),
      // Hard-gate: a goal verdict only counts when a goal was actually sent —
      // it can never be true for a normal chat / no-unlock ask.
      goalMet: !!body.unlockGoal && parsed.goalMet === true,
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[dialogue] LLM error", err);
    return NextResponse.json(SAFE_FALLBACK);
  }
}
