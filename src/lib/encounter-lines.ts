/**
 * Short storybook narration lines shown as a bookend around an encounter
 * (battle or educational challenge): one INTRO line as the player enters
 * ("Suddenly, the Wolf Pack appears!") and one OUTRO line on the way out
 * ("The way is clear again."). 4–5 patterns each, picked by a stable seed so a
 * given encounter always reads the same line (but consecutive ones vary).
 *
 * English to match the bundled story's narration. To localise later, branch on
 * `story.language` and add per-language pattern tables here.
 */

/** Battle intro — `{name}` is replaced with the lead monster's name. */
const BATTLE_INTRO = [
  "Suddenly, {name} appears!",
  "{name} blocks the path ahead.",
  "{name} springs out of nowhere!",
  "{name} stands in the way, growling.",
  "No way around — {name} is here!",
];

/** Challenge intro — an abstract puzzle gate, so no creature name. */
const CHALLENGE_INTRO = [
  "A riddle blocks the path.",
  "A puzzle bars the way ahead.",
  "Solve this to go on.",
  "The path is sealed — answer to pass!",
  "A challenge appears!",
];

/** Outro — shared, shown after a win / a solved gate. */
const OUTRO = [
  "The way is clear again.",
  "You can go on now.",
  "The path ahead opens up.",
  "Nothing stands in your way now.",
  "Onward — the road is yours again.",
];

function pick(arr: readonly string[], seed: number): string {
  const i = Math.abs(Math.trunc(seed)) % arr.length;
  return arr[i] ?? arr[0];
}

export function encounterIntroLine(opts: {
  kind: "battle" | "challenge";
  /** Lead monster name (battle only). */
  name?: string;
  /** Stable per-encounter seed so the line doesn't re-roll every render. */
  seed: number;
}): string {
  if (opts.kind === "battle") {
    return pick(BATTLE_INTRO, opts.seed).replace(
      "{name}",
      opts.name?.trim() || "something",
    );
  }
  return pick(CHALLENGE_INTRO, opts.seed);
}

export function encounterOutroLine(seed: number): string {
  return pick(OUTRO, seed);
}
