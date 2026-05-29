import type { CharactersFile, Hero, HeroGender, SpeakerId } from "@/types/story";

/**
 * Template tokens used in scenes.json narration + branch labels + hints.
 *
 * Use lowercase mid-sentence (e.g. `{{they}}`) and capitalised at sentence
 * starts (e.g. `{{They}}`). Possessive uses `{{their}}` / `{{Their}}`.
 * Use `{{name}}` for the hero's display name.
 *
 * Example:
 *   "{{name}} crouched in the grass. {{They}} scooped up Toto."
 *   girl → "Anna crouched in the grass. She scooped up Toto."
 *   boy  → "Min crouched in the grass.  He scooped up Toto."
 */

type PronounSet = {
  they: string; // subject
  them: string; // object
  their: string; // possessive determiner
  theirs: string; // possessive pronoun
  themself: string; // reflexive
};

const PRONOUNS: Record<HeroGender, PronounSet> = {
  girl: {
    they: "she",
    them: "her",
    their: "her",
    theirs: "hers",
    themself: "herself",
  },
  boy: {
    they: "he",
    them: "him",
    their: "his",
    theirs: "his",
    themself: "himself",
  },
};

const TOKEN_RE = /\{\{\s*(\w+)\s*\}\}/g;

export function formatNarration(text: string, hero: Hero): string {
  return text.replace(TOKEN_RE, (raw, rawKey: string) => {
    if (rawKey === "name") return hero.name;

    const lower = rawKey.toLowerCase();
    const isCapitalised = rawKey[0] !== lower[0];
    const set = PRONOUNS[hero.gender];

    const value = (set as Record<string, string>)[lower];
    if (!value) return raw; // unknown token — leave as-is for safety

    return isCapitalised ? value[0].toUpperCase() + value.slice(1) : value;
  });
}

export const DEFAULT_HERO: Hero = {
  name: "Dorothy",
  gender: "girl",
};

/**
 * The story's protagonist is the character flagged `isHero`. Resolving it
 * from data (rather than a hardcoded "dorothy" id) lets every story name its
 * hero whatever it likes. Falls back to "dorothy" for legacy content that
 * predates the flag.
 */
export function resolveHeroId(characters: CharactersFile): SpeakerId {
  return characters.characters.find((c) => c.isHero)?.id ?? "dorothy";
}

/**
 * Asset filename slug for a character. The hero's art lives at
 * `…/hero.{ext}` (a generic-protagonist convention reused across stories),
 * so the hero id maps to "hero"; everyone else maps to their own id.
 */
export function characterAssetSlug(
  id: SpeakerId,
  heroId: SpeakerId,
): string {
  return id === heroId ? "hero" : id;
}
