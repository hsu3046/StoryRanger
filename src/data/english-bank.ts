/**
 * Offline English-literacy content bank for the educational-challenge engine.
 * Pure data (no logic) — consumed by the `makeX` generators in
 * `src/lib/education.ts`. Difficulty climbs by age via a 4-tier system mapped
 * to a Khan-Academy-style literacy ladder (phonics/phonological awareness for
 * the young → orthography → meaning/vocabulary for older). All words are
 * lowercase, kid-safe, concrete nouns with a clear emoji.
 *
 * Tiers (used by `englishWordsForAge` to give each age a narrow, climbing band):
 *   1 — 1-syllable CVC / very common     (ages ~4-6)
 *   2 — common 1-syllable + easy 2-syll  (ages ~6-8)
 *   3 — 2-syllable common                (ages ~8-10)
 *   4 — 3+ syllable / rare / long        (ages ~10-12)
 */

export interface WordEntry {
  /** Lowercase word. */
  word: string;
  /** Single emoji depicting it (the picture prompt). */
  emoji: string;
  /** Difficulty tier 1–4 (see file header). */
  tier: 1 | 2 | 3 | 4;
  /** Syllable count — drives the "syllables" (clap-the-beats) drill. */
  syll: number;
}

/** Tiered pair — `a`/`b` are antonyms or synonyms; `tier` 1 (easy) … 3 (hard). */
export interface WordPair {
  a: string;
  b: string;
  tier: 1 | 2 | 3;
}

/** The spine — drives vocab-picture, first-letter, spelling, missing-letter,
 *  syllables. */
export const WORD_BANK: WordEntry[] = [
  // ── tier 1: 1-syllable CVC / very common (ages ~4-6) ─────────
  { word: "cat", emoji: "🐱", tier: 1, syll: 1 },
  { word: "dog", emoji: "🐶", tier: 1, syll: 1 },
  { word: "sun", emoji: "☀️", tier: 1, syll: 1 },
  { word: "bee", emoji: "🐝", tier: 1, syll: 1 },
  { word: "cow", emoji: "🐮", tier: 1, syll: 1 },
  { word: "pig", emoji: "🐷", tier: 1, syll: 1 },
  { word: "hat", emoji: "🎩", tier: 1, syll: 1 },
  { word: "bus", emoji: "🚌", tier: 1, syll: 1 },
  { word: "cup", emoji: "☕", tier: 1, syll: 1 },
  { word: "egg", emoji: "🥚", tier: 1, syll: 1 },
  { word: "ant", emoji: "🐜", tier: 1, syll: 1 },
  { word: "owl", emoji: "🦉", tier: 1, syll: 1 },
  { word: "fox", emoji: "🦊", tier: 1, syll: 1 },
  { word: "bat", emoji: "🦇", tier: 1, syll: 1 },
  { word: "car", emoji: "🚗", tier: 1, syll: 1 },
  { word: "bug", emoji: "🐛", tier: 1, syll: 1 },
  { word: "hen", emoji: "🐔", tier: 1, syll: 1 },
  { word: "key", emoji: "🔑", tier: 1, syll: 1 },
  { word: "box", emoji: "📦", tier: 1, syll: 1 },
  { word: "pen", emoji: "🖊️", tier: 1, syll: 1 },
  { word: "bed", emoji: "🛏️", tier: 1, syll: 1 },
  { word: "pot", emoji: "🍲", tier: 1, syll: 1 },
  { word: "log", emoji: "🪵", tier: 1, syll: 1 },
  { word: "cap", emoji: "🧢", tier: 1, syll: 1 },
  { word: "map", emoji: "🗺️", tier: 1, syll: 1 },
  { word: "van", emoji: "🚐", tier: 1, syll: 1 },
  { word: "jar", emoji: "🫙", tier: 1, syll: 1 },
  { word: "sock", emoji: "🧦", tier: 1, syll: 1 },

  // ── tier 2: common 1-syll + easy 2-syll (ages ~6-8) ──────────
  { word: "frog", emoji: "🐸", tier: 2, syll: 1 },
  { word: "fish", emoji: "🐟", tier: 2, syll: 1 },
  { word: "star", emoji: "⭐", tier: 2, syll: 1 },
  { word: "tree", emoji: "🌳", tier: 2, syll: 1 },
  { word: "cake", emoji: "🍰", tier: 2, syll: 1 },
  { word: "book", emoji: "📚", tier: 2, syll: 1 },
  { word: "duck", emoji: "🦆", tier: 2, syll: 1 },
  { word: "bear", emoji: "🐻", tier: 2, syll: 1 },
  { word: "boat", emoji: "⛵", tier: 2, syll: 1 },
  { word: "moon", emoji: "🌙", tier: 2, syll: 1 },
  { word: "leaf", emoji: "🍃", tier: 2, syll: 1 },
  { word: "milk", emoji: "🥛", tier: 2, syll: 1 },
  { word: "corn", emoji: "🌽", tier: 2, syll: 1 },
  { word: "ball", emoji: "⚽", tier: 2, syll: 1 },
  { word: "shoe", emoji: "👟", tier: 2, syll: 1 },
  { word: "drum", emoji: "🥁", tier: 2, syll: 1 },
  { word: "kite", emoji: "🪁", tier: 2, syll: 1 },
  { word: "crab", emoji: "🦀", tier: 2, syll: 1 },
  { word: "goat", emoji: "🐐", tier: 2, syll: 1 },
  { word: "wolf", emoji: "🐺", tier: 2, syll: 1 },
  { word: "snail", emoji: "🐌", tier: 2, syll: 1 },
  { word: "horse", emoji: "🐴", tier: 2, syll: 1 },
  { word: "grape", emoji: "🍇", tier: 2, syll: 1 },
  { word: "bread", emoji: "🍞", tier: 2, syll: 1 },
  { word: "spoon", emoji: "🥄", tier: 2, syll: 1 },
  { word: "clock", emoji: "🕐", tier: 2, syll: 1 },
  { word: "train", emoji: "🚆", tier: 2, syll: 1 },
  { word: "house", emoji: "🏠", tier: 2, syll: 1 },
  { word: "heart", emoji: "❤️", tier: 2, syll: 1 },
  { word: "apple", emoji: "🍎", tier: 2, syll: 2 },
  { word: "lemon", emoji: "🍋", tier: 2, syll: 2 },
  { word: "lion", emoji: "🦁", tier: 2, syll: 2 },

  // ── tier 3: 2-syllable common (ages ~8-10) ───────────────────
  { word: "rabbit", emoji: "🐰", tier: 3, syll: 2 },
  { word: "monkey", emoji: "🐵", tier: 3, syll: 2 },
  { word: "turtle", emoji: "🐢", tier: 3, syll: 2 },
  { word: "pencil", emoji: "✏️", tier: 3, syll: 2 },
  { word: "flower", emoji: "🌻", tier: 3, syll: 2 },
  { word: "rocket", emoji: "🚀", tier: 3, syll: 2 },
  { word: "carrot", emoji: "🥕", tier: 3, syll: 2 },
  { word: "cherry", emoji: "🍒", tier: 3, syll: 2 },
  { word: "castle", emoji: "🏰", tier: 3, syll: 2 },
  { word: "dragon", emoji: "🐉", tier: 3, syll: 2 },
  { word: "spider", emoji: "🕷️", tier: 3, syll: 2 },
  { word: "rainbow", emoji: "🌈", tier: 3, syll: 2 },
  { word: "pumpkin", emoji: "🎃", tier: 3, syll: 2 },
  { word: "guitar", emoji: "🎸", tier: 3, syll: 2 },
  { word: "panda", emoji: "🐼", tier: 3, syll: 2 },
  { word: "tiger", emoji: "🐯", tier: 3, syll: 2 },
  { word: "zebra", emoji: "🦓", tier: 3, syll: 2 },
  { word: "penguin", emoji: "🐧", tier: 3, syll: 2 },
  { word: "dolphin", emoji: "🐬", tier: 3, syll: 2 },
  { word: "mountain", emoji: "⛰️", tier: 3, syll: 2 },

  // ── tier 4: 3+ syllable / rare / long (ages ~10-12) ──────────
  { word: "octopus", emoji: "🐙", tier: 4, syll: 3 },
  { word: "banana", emoji: "🍌", tier: 4, syll: 3 },
  { word: "elephant", emoji: "🐘", tier: 4, syll: 3 },
  { word: "umbrella", emoji: "☂️", tier: 4, syll: 3 },
  { word: "butterfly", emoji: "🦋", tier: 4, syll: 3 },
  { word: "dinosaur", emoji: "🦕", tier: 4, syll: 3 },
  { word: "strawberry", emoji: "🍓", tier: 4, syll: 3 },
  { word: "telescope", emoji: "🔭", tier: 4, syll: 3 },
  { word: "kangaroo", emoji: "🦘", tier: 4, syll: 3 },
  { word: "computer", emoji: "💻", tier: 4, syll: 3 },
  { word: "hamburger", emoji: "🍔", tier: 4, syll: 3 },
  { word: "crocodile", emoji: "🐊", tier: 4, syll: 3 },
  { word: "giraffe", emoji: "🦒", tier: 4, syll: 2 },
  { word: "helicopter", emoji: "🚁", tier: 4, syll: 4 },
];

/** Antonym pairs, tiered. Easy (1) opposites for G1-2 → abstract (3) for upper. */
export const ANTONYMS: WordPair[] = [
  // tier 1 — everyday opposites
  { a: "big", b: "small", tier: 1 },
  { a: "hot", b: "cold", tier: 1 },
  { a: "up", b: "down", tier: 1 },
  { a: "day", b: "night", tier: 1 },
  { a: "fast", b: "slow", tier: 1 },
  { a: "happy", b: "sad", tier: 1 },
  { a: "open", b: "shut", tier: 1 },
  { a: "wet", b: "dry", tier: 1 },
  { a: "in", b: "out", tier: 1 },
  { a: "yes", b: "no", tier: 1 },
  { a: "good", b: "bad", tier: 1 },
  { a: "on", b: "off", tier: 1 },
  { a: "hard", b: "soft", tier: 1 },
  { a: "old", b: "new", tier: 1 },
  { a: "high", b: "low", tier: 1 },
  // tier 2 — school-age opposites
  { a: "full", b: "empty", tier: 2 },
  { a: "loud", b: "quiet", tier: 2 },
  { a: "push", b: "pull", tier: 2 },
  { a: "near", b: "far", tier: 2 },
  { a: "clean", b: "dirty", tier: 2 },
  { a: "long", b: "short", tier: 2 },
  { a: "first", b: "last", tier: 2 },
  { a: "over", b: "under", tier: 2 },
  { a: "win", b: "lose", tier: 2 },
  { a: "buy", b: "sell", tier: 2 },
  { a: "begin", b: "end", tier: 2 },
  { a: "thick", b: "thin", tier: 2 },
  { a: "sweet", b: "sour", tier: 2 },
  { a: "light", b: "dark", tier: 2 },
  { a: "rich", b: "poor", tier: 2 },
  { a: "brave", b: "afraid", tier: 2 },
  // tier 3 — abstract / advanced opposites
  { a: "ancient", b: "modern", tier: 3 },
  { a: "generous", b: "selfish", tier: 3 },
  { a: "arrive", b: "depart", tier: 3 },
  { a: "accept", b: "reject", tier: 3 },
  { a: "increase", b: "decrease", tier: 3 },
  { a: "visible", b: "hidden", tier: 3 },
  { a: "temporary", b: "permanent", tier: 3 },
  { a: "victory", b: "defeat", tier: 3 },
  { a: "wild", b: "tame", tier: 3 },
  { a: "polite", b: "rude", tier: 3 },
  { a: "gather", b: "scatter", tier: 3 },
  { a: "expand", b: "shrink", tier: 3 },
];

/** Synonym pairs, tiered. Used by the upper-grade "synonym" drill. */
export const SYNONYMS: WordPair[] = [
  // tier 1
  { a: "big", b: "large", tier: 1 },
  { a: "happy", b: "glad", tier: 1 },
  { a: "fast", b: "quick", tier: 1 },
  { a: "small", b: "little", tier: 1 },
  { a: "sad", b: "unhappy", tier: 1 },
  { a: "cold", b: "chilly", tier: 1 },
  { a: "scared", b: "afraid", tier: 1 },
  { a: "smart", b: "clever", tier: 1 },
  { a: "pretty", b: "lovely", tier: 1 },
  { a: "begin", b: "start", tier: 1 },
  // tier 2
  { a: "angry", b: "mad", tier: 2 },
  { a: "tired", b: "sleepy", tier: 2 },
  { a: "tiny", b: "small", tier: 2 },
  { a: "shout", b: "yell", tier: 2 },
  { a: "story", b: "tale", tier: 2 },
  { a: "gift", b: "present", tier: 2 },
  { a: "quiet", b: "silent", tier: 2 },
  { a: "brave", b: "bold", tier: 2 },
  { a: "funny", b: "silly", tier: 2 },
  { a: "fix", b: "repair", tier: 2 },
  // tier 3
  { a: "enormous", b: "gigantic", tier: 3 },
  { a: "furious", b: "angry", tier: 3 },
  { a: "exhausted", b: "tired", tier: 3 },
  { a: "brilliant", b: "clever", tier: 3 },
  { a: "delicious", b: "tasty", tier: 3 },
  { a: "courageous", b: "brave", tier: 3 },
  { a: "rapid", b: "fast", tier: 3 },
  { a: "marvelous", b: "wonderful", tier: 3 },
  { a: "fragile", b: "delicate", tier: 3 },
  { a: "ancient", b: "old", tier: 3 },
];

/** Rhyme groups — within a group all words rhyme; words from OTHER groups are
 *  the non-rhyme distractors. Each group has ≥2 members. */
export const RHYME_GROUPS: string[][] = [
  ["cat", "hat", "bat", "mat", "rat"],
  ["dog", "log", "frog", "hog"],
  ["cake", "lake", "snake", "rake"],
  ["bee", "tree", "key", "sea", "knee"],
  ["star", "car", "jar", "far"],
  ["sun", "run", "bun", "fun"],
  ["book", "look", "cook", "hook"],
  ["bug", "rug", "mug", "hug"],
  ["house", "mouse"],
  ["ball", "wall", "tall", "fall"],
  ["fish", "dish", "wish"],
  ["snow", "grow", "bow", "low"],
  ["night", "light", "bright", "kite"],
  ["boat", "coat", "goat", "float"],
  ["bell", "well", "shell", "tell"],
  ["ring", "king", "sing", "wing"],
  ["duck", "truck", "luck"],
  ["moon", "spoon", "soon", "balloon"],
];

/** Irregular plurals for the "plural" drill (regular plurals are derived from
 *  WORD_BANK procedurally). */
export const IRREGULAR_PLURALS: { singular: string; plural: string }[] = [
  { singular: "mouse", plural: "mice" },
  { singular: "child", plural: "children" },
  { singular: "foot", plural: "feet" },
  { singular: "tooth", plural: "teeth" },
  { singular: "man", plural: "men" },
  { singular: "woman", plural: "women" },
  { singular: "goose", plural: "geese" },
  { singular: "person", plural: "people" },
  { singular: "leaf", plural: "leaves" },
  { singular: "wolf", plural: "wolves" },
  { singular: "fish", plural: "fish" },
  { singular: "sheep", plural: "sheep" },
];

/** Compound words split into their two parts (for the "compound" drill). */
export const COMPOUND_WORDS: { whole: string; a: string; b: string }[] = [
  { whole: "rainbow", a: "rain", b: "bow" },
  { whole: "sunflower", a: "sun", b: "flower" },
  { whole: "snowman", a: "snow", b: "man" },
  { whole: "football", a: "foot", b: "ball" },
  { whole: "butterfly", a: "butter", b: "fly" },
  { whole: "cupcake", a: "cup", b: "cake" },
  { whole: "starfish", a: "star", b: "fish" },
  { whole: "ladybug", a: "lady", b: "bug" },
  { whole: "pancake", a: "pan", b: "cake" },
  { whole: "popcorn", a: "pop", b: "corn" },
  { whole: "toothbrush", a: "tooth", b: "brush" },
  { whole: "raincoat", a: "rain", b: "coat" },
  { whole: "bedroom", a: "bed", b: "room" },
  { whole: "seahorse", a: "sea", b: "horse" },
  { whole: "jellyfish", a: "jelly", b: "fish" },
  { whole: "snowball", a: "snow", b: "ball" },
  { whole: "doghouse", a: "dog", b: "house" },
  { whole: "sandcastle", a: "sand", b: "castle" },
  { whole: "fireman", a: "fire", b: "man" },
];

/** Homophone groups — words within a group SOUND the same; words from other
 *  groups are the (non-homophone) distractors. Tiered: tier 1 = simple,
 *  picture-able sounds (G2-4); tier 2 = spelling-aware / grammar homophones
 *  (G5-7), used to keep the drill age-appropriate for older players. */
export const HOMOPHONES: { words: string[]; tier: 1 | 2 }[] = [
  // tier 1 — common, concrete
  { words: ["see", "sea"], tier: 1 },
  { words: ["two", "too"], tier: 1 },
  { words: ["here", "hear"], tier: 1 },
  { words: ["sun", "son"], tier: 1 },
  { words: ["blue", "blew"], tier: 1 },
  { words: ["bee", "be"], tier: 1 },
  { words: ["deer", "dear"], tier: 1 },
  { words: ["bear", "bare"], tier: 1 },
  { words: ["pair", "pear"], tier: 1 },
  { words: ["sail", "sale"], tier: 1 },
  { words: ["tail", "tale"], tier: 1 },
  { words: ["meat", "meet"], tier: 1 },
  { words: ["plane", "plain"], tier: 1 },
  // tier 2 — spelling-aware / grammar (upper grades)
  { words: ["their", "there", "they're"], tier: 2 },
  { words: ["your", "you're"], tier: 2 },
  { words: ["its", "it's"], tier: 2 },
  { words: ["threw", "through"], tier: 2 },
  { words: ["peace", "piece"], tier: 2 },
  { words: ["hole", "whole"], tier: 2 },
  { words: ["right", "write"], tier: 2 },
  { words: ["wood", "would"], tier: 2 },
  { words: ["flour", "flower"], tier: 2 },
  { words: ["night", "knight"], tier: 2 },
  { words: ["hour", "our"], tier: 2 },
  { words: ["weather", "whether"], tier: 2 },
];
