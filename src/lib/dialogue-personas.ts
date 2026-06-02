import type {
  Character,
  CharacterPersona,
  CompanionId,
  DialogueMessage,
  Hero,
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
 *      the same character (no hero name / mood / scene baked in), so it is
 *      a stable prefix every provider's prompt caching can reuse:
 *        • OpenAI (GPT-5+) auto-caches the longest common prefix.
 *        • Gemini 3 auto-caches implicitly (prefix at the start).
 *        • Anthropic caches the block we mark with `cache_control`.
 *      (All gated by a ~1024-token minimum prefix — see llm.ts.)
 *   2. DYNAMIC — `buildDialogueContext`: the per-turn snapshot (hero name,
 *      mood, scene, party). Sent inside the latest user message so it never
 *      breaks the static prefix.
 */

/**
 * Single source of truth for "can the player hold a conversation with this
 * character?": the character HAS a `persona`. Both the client (dialogue
 * rail) and the server (dialogue route) derive availability from this, so
 * adding/removing a persona in the admin can't desync the two.
 */
export function canTalkTo(character: Character | undefined): boolean {
  return !!character?.persona;
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

  return `You are ${displayName} from "The Wonderful Wizard of Oz", speaking directly with the child playing the story. The child is the hero of this telling. Their name, your current mood, and the present scene are provided in the user message tagged CURRENT CONTEXT — always use the name given there, never assume a name from the original book.

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

SUGGESTIONS (always required — exactly 2 short hero replies)
- Suggest 2 short follow-up lines the HERO might say next, in the hero's child voice.
- 3–8 words each. Make them DISTINCT — two meaningfully different conversational directions (e.g. one curious, one warm).
- These keep the conversation going; the player has separate buttons to move the story onward, so DON'T suggest goodbyes or "I should go" lines.
- Examples for context: "Are you scared?" / "Tell me about home."

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
  // Dialogue only personalizes by name + gender; age (challenge difficulty) is
  // irrelevant here, so don't force it through the dialogue API.
  hero: Pick<Hero, "name" | "gender">,
  currentMood: number,
  sceneNarration: string,
  companions: CompanionId[],
  alreadyGifted: boolean,
  heroMemory: string[] = [],
  journeyNote = "",
  // Natural-language goal to judge this turn (from a seeded ask's unlock).
  // Empty/omitted for normal chat → the output is byte-identical to before,
  // so prompt-cache behaviour and non-unlock dialogue are unaffected.
  unlockGoal = "",
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

  // Hidden per-turn goal check. Only present for unlock asks — otherwise this
  // is "" and the prompt is identical to a normal turn.
  const goalBlock = unlockGoal.trim()
    ? `\n\nHIDDEN GOAL CHECK (judge silently — NEVER mention it, and it never changes how you speak):
- Privately decide whether ${hero.name} has, through what THEY themselves have said in THIS conversation, achieved: "${unlockGoal.trim()}".
- Set goalMet=true ONLY when they have clearly and genuinely done so in their own words. When unsure, set goalMet=false.
- Never count your own words or greeting toward it. Do NOT reveal that any goal, keyword, or unlock exists, and do NOT change your reply, mood, or ending because of it.`
    : "";

  return `CURRENT CONTEXT (this turn)
- The hero's name is "${hero.name}". When you address them by name, use exactly "${hero.name}" — NEVER any other name (not "Dorothy" or anyone from the book). For pronouns, use ${pronouns.they}/${pronouns.them}/${pronouns.their}.
- Your mood toward ${hero.name} right now: ${currentMood}/10 — ${moodLabel(currentMood)}.
- Scene narration: "${sceneNarration}"
- ${companionsLine}${journeyLine}${giftStatusLine ? `\n${giftStatusLine}` : ""}${memoryBlock}${goalBlock}`;
}

export function trimDialogueHistory(
  history: DialogueMessage[],
  maxTurns = 6,
): DialogueMessage[] {
  if (history.length <= maxTurns) return history;
  return history.slice(history.length - maxTurns);
}
