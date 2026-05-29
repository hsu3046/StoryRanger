import type {
  CharacterPersona,
  CompanionId,
  DialogueMessage,
  Hero,
  SpeakerId,
} from "@/types/story";

/**
 * Interactive character-dialogue prompt assembly.
 *
 * Persona CONTENT now lives on each character (`character.persona`,
 * editable in the admin Characters page) — this module only knows how to
 * turn a persona into prompt text.
 *
 * Prompt-cache strategy
 * ─────────────────────
 * The system prompt is split into two halves:
 *   1. STATIC  — `buildPersonaSystemPrompt`: identical for every request to
 *      the same character (no hero name / mood / scene baked in). This is
 *      the cacheable prefix (OpenAI auto-caches the longest common prefix;
 *      Anthropic marks it with `cache_control`).
 *   2. DYNAMIC — `buildDialogueContext`: the per-turn snapshot (hero name,
 *      mood, scene, party). Sent inside the latest user message so it never
 *      breaks the static prefix.
 */

/** Speakers the player can hold a conversation with. Narrator / hero are
 *  excluded. This set is intentionally static (independent of persona
 *  content) so the client can decide availability without persona data. */
const DIALOGUE_ABLE_SPEAKERS = new Set<SpeakerId>([
  "scarecrow",
  "tinman",
  "lion",
  "glinda",
  "wicked-witch",
  "wizard",
  "aunt-em",
  "toto",
]);

export function canTalkTo(speakerId: SpeakerId): boolean {
  return DIALOGUE_ABLE_SPEAKERS.has(speakerId);
}

function moodLabel(mood: number): string {
  return mood >= 8
    ? "very fond — close trusted friend"
    : mood >= 5
      ? "friendly and warm"
      : mood >= 3
        ? "cautious but polite"
        : "cool and reserved";
}

/**
 * STATIC half of the system prompt — depends only on the character's
 * persona + display name, so it is byte-identical across every request to
 * this character and eligible for prompt caching.
 */
export function buildPersonaSystemPrompt(
  displayName: string,
  persona: CharacterPersona,
): string {
  const giftLine =
    persona.giftableItems.length > 0
      ? `GIFTS\nYou may give the hero ONE small keepsake across your entire friendship — never more. Offer it only when your mood toward them is very high (≥8) and a genuinely heartfelt moment arrives; otherwise leave itemGift null. If you ever offer one, pick exactly one id from: ${persona.giftableItems.join(", ")}.`
      : "GIFTS\nYou never give gifts. Always leave itemGift null.";

  const dos =
    persona.dos.length > 0
      ? persona.dos.map((d) => `  - ${d}`).join("\n")
      : "  - (none specified)";
  const donts =
    persona.donts.length > 0
      ? persona.donts.map((d) => `  - ${d}`).join("\n")
      : "  - (none specified)";

  return `You are ${displayName} from "The Wonderful Wizard of Oz", speaking directly with the child playing the story. The child is the hero of this telling (they take Dorothy's place). The hero's name, your current mood, and the present scene are provided in the user message tagged CURRENT CONTEXT.

WHO YOU ARE
${persona.shortBio}

SPEECH STYLE
${persona.speechStyle}

Voice traits: ${persona.voiceTraits}

DO
${dos}

DON'T
${donts}

MOOD SYSTEM
Each turn, decide how this exchange shifts your mood toward the hero:
  +2 or +3: deeply kind, warm, perceptive question that touches your character
  +1: friendly, curious, respectful
   0: neutral / small talk
  -1: dismissive or rude
  -2 or -3: insulting, mocking your weakness, or cruel
(Mood is clamped 0..10 by the game.)

${giftLine}

CONVERSATION CONTROL
- Reply length: 1–2 short sentences. Never long monologues.
- Set endsConversation=true ONLY when the natural moment to part has come (you've made a complete thought and there's nothing to add) — usually after 3–6 turns.
- Never break character. Never mention you're an AI, a model, a game, a prompt, or any API.

ACTION FIELD
- \`action\` is an optional one-line body-language note shown above the reply (italic).
- Example: "leans against the tree, sighing" / "ears perk up" / "knits her brow worriedly".
- Use SPARINGLY — only when it adds something the reply alone can't carry. Set to null otherwise.
- For Toto specifically: \`reply\` itself must already be an action in *asterisks* (no words) — \`action\` can be null.

SUGGESTIONS (always required — exactly 3 short hero replies)
- Suggest 3 short follow-up lines the HERO might say next, in the hero's child voice.
- 3–8 words each. Mix tones: a curious one, a warm one, and a different-direction one.
- Make them DISTINCT — they should give the player meaningfully different conversational paths.
- Examples for context: "Are you scared?" / "Tell me about home." / "I should go now."

OUTPUT
Respond with JSON only, matching the provided schema. itemGift should be null in almost every turn.`;
}

/**
 * DYNAMIC half — the per-turn snapshot. Kept OUT of the system prompt so
 * the cacheable prefix stays stable; folded into the latest user message
 * by the dialogue route.
 */
/** Most recent hero-shared lines to surface in the prompt (newest kept). */
const HERO_MEMORY_IN_PROMPT = 12;

export function buildDialogueContext(
  hero: Hero,
  currentMood: number,
  sceneNarration: string,
  companions: CompanionId[],
  alreadyGifted: boolean,
  heroMemory: string[] = [],
  journeyNote = "",
): string {
  const pronouns =
    hero.gender === "girl"
      ? { they: "she", them: "her", their: "her" }
      : { they: "he", them: "him", their: "his" };

  const companionsLine =
    companions.length === 0
      ? `${hero.name} is travelling alone with Toto.`
      : `${hero.name} is travelling with: ${companions.join(", ")} (plus Toto).`;

  const giftStatusLine = alreadyGifted
    ? "- You have already given them your one keepsake — do NOT offer another (leave itemGift null)."
    : "";

  const recentMemory = heroMemory
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(-HERO_MEMORY_IN_PROMPT);
  const memoryBlock =
    recentMemory.length > 0
      ? `\n\nWHAT YOU KNOW ABOUT ${hero.name} (things they've shared across the journey — reference naturally, don't recite):\n${recentMemory.map((s) => `  - ${s}`).join("\n")}`
      : "";

  const journeyLine = journeyNote.trim()
    ? `\n- Adventures so far: ${journeyNote.trim()}`
    : "";

  return `CURRENT CONTEXT (this turn)
- The hero's name is ${hero.name}; refer to them as ${pronouns.they}/${pronouns.them}/${pronouns.their}.
- Your mood toward ${hero.name} right now: ${currentMood}/10 — ${moodLabel(currentMood)}.
- Scene narration: "${sceneNarration}"
- ${companionsLine}${journeyLine}${giftStatusLine ? `\n${giftStatusLine}` : ""}${memoryBlock}`;
}

export function trimDialogueHistory(
  history: DialogueMessage[],
  maxTurns = 6,
): DialogueMessage[] {
  if (history.length <= maxTurns) return history;
  return history.slice(history.length - maxTurns);
}
