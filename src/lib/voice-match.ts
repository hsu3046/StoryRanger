/**
 * Fuzzy matching between a child's STT transcript and the on-screen choice
 * labels. Pure functions only (no React/browser deps) so the scoring is unit
 * testable with `npx tsx`.
 *
 * Children's speech transcribes poorly ("cave" → "kave", dropped articles,
 * partial phrases), so a strict equality check would reject most honest
 * attempts. Instead each label gets a similarity score from two angles —
 * content-token overlap (with per-token typo tolerance) and whole-string
 * edit distance — and the best label wins only when it clears an absolute
 * floor AND a margin over the runner-up. Anything weaker is reported as
 * ambiguous/no-match so the UI can ask the child to try again (or tap).
 */

export type MatchResult =
  | { kind: "match"; index: number; score: number }
  | { kind: "ambiguous"; candidates: number[] }
  | { kind: "no-match" };

/** Minimum best-label score to accept at all. */
const MATCH_MIN = 0.55;
/** Required gap to the second-best label — below this it's ambiguous. */
const MARGIN_MIN = 0.15;

/** Function words carry no signal for 2–6 word labels ("Go to the cave" vs
 *  "Go to the village" differ only by their content tokens). */
const STOP_WORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "at", "and", "or", "for",
  "with", "let", "lets", "go", "is", "it", "its", "i", "im", "me", "my",
  "we", "you", "your", "do", "did", "will", "would", "please", "um", "uh",
  "okay", "ok",
]);

/** Spoken digits fold to numerals so "two" and "2" compare equal. */
const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
};

/** Casual variants fold to the canonical word a label would use — a child's
 *  "yeah!" must land on a "Yes, let's help him" label. */
const SYNONYM_WORDS: Record<string, string> = {
  yeah: "yes", yep: "yes", yup: "yes",
  nope: "no", nah: "no",
};

/** Ordinal/meta phrases → choice index ("the first one", "number two", a
 *  transcriber's bare "2"). Only consulted when the utterance shares nothing
 *  with any label, so a label that legitimately contains "first" can never
 *  be shadowed. */
const ORDINAL_WORDS: Record<string, number> = {
  first: 0, "1st": 0, one: 0, "1": 0,
  second: 1, "2nd": 1, two: 1, "2": 1,
  third: 2, "3rd": 2, three: 2, "3": 2,
  fourth: 3, "4th": 3, four: 3, "4": 3,
};

/** Lowercase, strip diacritics + punctuation, collapse whitespace. */
export function normalizeUtterance(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // combining diacritics left by NFD
    .toLowerCase()
    .replace(/['’]/g, "") // "don't" → "dont" (one token, not "don t")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenize(normalized: string): string[] {
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((t) => SYNONYM_WORDS[t] ?? NUMBER_WORDS[t] ?? t);
}

function contentTokens(normalized: string): string[] {
  return tokenize(normalized).filter((t) => !STOP_WORDS.has(t));
}

/** Classic Levenshtein distance (two-row DP). Inputs are short (a spoken
 *  phrase / a button label), so O(n·m) is fine. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Tokens count as equal on an exact match, or within 1 edit for tokens long
 *  enough (≥4 chars) that a single edit is clearly a typo/mistranscription
 *  rather than a different word ("cave"/"kave" yes, "cat"/"bat" no). */
function tokensEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  return levenshtein(a, b) <= 1;
}

/** Token-overlap score with fuzzy token equality (greedy one-to-one pairing
 *  — fine at these sizes). Returns the better of:
 *  - Dice: symmetric overlap — rewards saying most of the label;
 *  - precision (matches / utterance tokens): a SHORT utterance fully
 *    contained in one label ("yes" → "Yes, let's help him") scores 1.0,
 *    where Dice alone dies on the length asymmetry (2·1/(1+3)=0.5 < floor).
 *  Precision can tie across labels sharing a token — the caller's margin
 *  rule turns that into a safe "ambiguous → try again". */
function tokenScore(utterTokens: string[], labelTokens: string[]): number {
  if (!utterTokens.length || !labelTokens.length) return 0;
  const used = new Array<boolean>(labelTokens.length).fill(false);
  let matches = 0;
  for (const ut of utterTokens) {
    for (let j = 0; j < labelTokens.length; j++) {
      if (!used[j] && tokensEqual(ut, labelTokens[j])) {
        used[j] = true;
        matches++;
        break;
      }
    }
  }
  const dice = (2 * matches) / (utterTokens.length + labelTokens.length);
  const precision = matches / utterTokens.length;
  return Math.max(dice, precision);
}

/** Whole-string similarity in [0,1] from normalized edit distance. */
function stringSimilarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const max = Math.max(a.length, b.length);
  return max === 0 ? 0 : 1 - levenshtein(a, b) / max;
}

/** Score one utterance against one label, both already normalized. */
function scoreLabel(utterNorm: string, labelNorm: string): number {
  const tokens = tokenScore(contentTokens(utterNorm), contentTokens(labelNorm));
  const sim = stringSimilarity(utterNorm, labelNorm);
  return Math.max(tokens, sim);
}

/** "the first one" / "number two" / bare "two" → index, when the child says
 *  the position instead of the words (they may not be able to read at all).
 *  Strips filler ("the", "number", trailing "one") and requires exactly one
 *  ordinal word to remain — anything longer is a real utterance, not a pick. */
function ordinalIndex(utterNorm: string, choiceCount: number): number | null {
  const tokens = utterNorm
    .split(" ")
    .filter((t) => t && t !== "the" && t !== "number");
  if (tokens.length === 0 || tokens.length > 2) return null;
  // Two tokens only as "<ordinal> one" ("first one", "last one") — the
  // trailing "one" is filler there, while a LONE "one" means choice #1.
  if (tokens.length === 2 && (tokens[1] !== "one" || tokens[0] === "one")) {
    return null;
  }
  const word = tokens[0];
  if (word === "last") return choiceCount - 1;
  const idx = ORDINAL_WORDS[word];
  return idx !== undefined && idx < choiceCount ? idx : null;
}

/**
 * Match a transcript against the visible choice labels.
 *
 * Ordinal fallback ("the first one") only fires when no label scored even a
 * weak content overlap — a label containing "first" wins the normal scoring
 * path before the ordinal interpretation is ever consulted.
 */
export function matchUtterance(
  transcript: string,
  labels: string[],
): MatchResult {
  const utterNorm = normalizeUtterance(transcript);
  if (!utterNorm || labels.length === 0) return { kind: "no-match" };

  const scores = labels.map((label) => scoreLabel(utterNorm, normalizeUtterance(label)));

  let bestIdx = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > scores[bestIdx]) bestIdx = i;
  }
  const best = scores[bestIdx];
  const second = scores.reduce(
    (acc, s, i) => (i === bestIdx ? acc : Math.max(acc, s)),
    0,
  );

  if (best >= MATCH_MIN && best - second >= MARGIN_MIN) {
    return { kind: "match", index: bestIdx, score: best };
  }

  // Nothing scored a real word overlap → maybe the child said a position.
  if (best < 0.3) {
    const ord = ordinalIndex(utterNorm, labels.length);
    if (ord !== null) return { kind: "match", index: ord, score: 1 };
  }

  if (best >= MATCH_MIN) {
    // Two labels both fit ("go there" against two "Go to…" labels).
    const candidates = scores
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => best - s < MARGIN_MIN)
      .map(({ i }) => i);
    return { kind: "ambiguous", candidates };
  }

  return { kind: "no-match" };
}
