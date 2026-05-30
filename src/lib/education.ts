/**
 * Age-driven educational challenge generator — the single source of problems
 * for BOTH the branch-gating challenge and battle challenges.
 *
 * Math-first, fully procedural (offline, free, instant, correct-by-construction).
 * Difficulty is age-tiered and pitched at the Singapore / Korean primary-maths
 * level (a notch above US Common Core): the higher tiers favour THINKING
 * problems (word problems, multiplicative patterns, fractions, percentages,
 * measurement geometry) over big mental arithmetic, so they stay solvable
 * within a battle's short timer via multiple choice. No external API.
 */

import type { z } from "zod";
import type { ChallengeCategorySchema } from "@/data/schemas/primitives";

export type ChallengeCategory = z.infer<typeof ChallengeCategorySchema>;

/** Visual payload. Counting uses emoji glyphs; geometry uses SVG shapes;
 *  fractions use a divided bar. Rendered by ChallengeVisualView. */
export type ChallengeVisual =
  | { kind: "glyphs"; glyphs: string[]; layout: "row" | "single" }
  | { kind: "polygon"; sides: number }
  | { kind: "rect"; w: number; h: number; showDims: boolean }
  | { kind: "triangle"; base: number; height: number }
  | { kind: "bar"; den: number; shaded: number };

export interface Challenge {
  category: ChallengeCategory;
  /** Display prompt, e.g. "34 + 25 = ?" or "How many sides?" */
  prompt: string;
  /** 3–4 answer strings (numbers, fractions, shape names…). */
  choices: string[];
  correctIndex: number;
  visual?: ChallengeVisual;
}

// ─────────────────────────────────────────────────────────────
// Age tiers — Singapore / Korea primary levels (US kindergarten ≈ age 5).
// Level 1..5 drives the per-generator number ranges.
// ─────────────────────────────────────────────────────────────

export type AgeTier = "tier1" | "tier2" | "tier3" | "tier4" | "tier5";

export function tierForAge(age: number): AgeTier {
  if (age <= 5) return "tier1";
  if (age <= 7) return "tier2";
  if (age <= 9) return "tier3";
  if (age <= 11) return "tier4";
  return "tier5";
}

type Level = 1 | 2 | 3 | 4 | 5;

interface TierConfig {
  level: Level;
  /** Categories eligible when the author leaves the category on "auto". */
  categories: ChallengeCategory[];
}

const TIERS: Record<AgeTier, TierConfig> = {
  // 4–5 · Pre-K/K: counting, shape sense, sums within 10.
  tier1: {
    level: 1,
    categories: ["counting", "geometry", "compare", "add", "odd-one-out"],
  },
  // 6–7 · Singapore P1 / Korea 1학년: ±within 100, ×(2,5,10), patterns, shapes.
  tier2: {
    level: 2,
    categories: ["add", "sub", "multiply", "missing", "compare", "pattern", "geometry", "word"],
  },
  // 8–9 · P2–P3 / 2–3학년: tables & division, ±within 1000, fractions, area.
  tier3: {
    level: 3,
    categories: ["multiply", "divide", "add", "sub", "missing", "pattern", "geometry", "fraction", "word", "odd-one-out"],
  },
  // 10–11 · P4–P5 / 4–5학년: 2-digit ×/÷, fraction ops, area/triangle, 2-step.
  tier4: {
    level: 4,
    categories: ["multiply", "divide", "fraction", "pattern", "geometry", "word", "missing", "odd-one-out"],
  },
  // 12 · P6 / 6학년: percentages (inside `word`), fraction ops, multi-step
  // word problems, harder patterns.
  tier5: {
    level: 5,
    categories: ["word", "fraction", "multiply", "divide", "pattern", "geometry"],
  },
};

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function generateChallenge(opts: {
  age: number;
  category?: ChallengeCategory | "auto";
}): Challenge {
  const cfg = TIERS[tierForAge(opts.age)];
  const level = cfg.level;
  const category =
    !opts.category || opts.category === "auto"
      ? pick(cfg.categories) ?? "add"
      : opts.category;

  switch (category) {
    case "add":
      return makeAdd(level);
    case "sub":
      return makeSub(level);
    case "multiply":
      return makeMultiply(level);
    case "divide":
      return makeDivide(level);
    case "missing":
      return makeMissing(level);
    case "compare":
      return makeCompare(level);
    case "counting":
      return makeCounting(level);
    case "pattern":
      return makePattern(level);
    case "geometry":
      return makeGeometry(level);
    case "fraction":
      return makeFraction(level);
    case "word":
      return makeWord(level);
    case "odd-one-out":
      return makeOddOneOut(level);
  }
}

// ─────────────────────────────────────────────────────────────
// Arithmetic
// ─────────────────────────────────────────────────────────────

/** Sum cap per level (kept mental-math + multiple-choice feasible). */
const ADD_MAX: Record<Level, number> = { 1: 10, 2: 100, 3: 200, 4: 500, 5: 1000 };

function makeAdd(level: Level): Challenge {
  const cap = ADD_MAX[level];
  const a = randInt(1, Math.max(1, cap - 1));
  const b = randInt(1, Math.max(1, cap - a));
  return numericChallenge("add", `${a} + ${b} = ?`, a + b, spreadFor(a + b));
}

function makeSub(level: Level): Challenge {
  const cap = ADD_MAX[level];
  const a = randInt(2, cap);
  const b = randInt(1, a - 1);
  return numericChallenge("sub", `${a} − ${b} = ?`, a - b, spreadFor(a));
}

/** [multiplicand range, multiplier range] per level. */
const MUL: Record<Level, [[number, number], [number, number]]> = {
  1: [[2, 5], [2, 5]],
  2: [[2, 9], [2, 5]], // intro tables
  3: [[2, 12], [2, 9]], // full tables
  4: [[11, 29], [2, 9]], // 2-digit × 1-digit
  5: [[12, 49], [3, 9]], // bigger 2-digit × 1-digit
};

function makeMultiply(level: Level): Challenge {
  const [[aMin, aMax], [bMin, bMax]] = MUL[level];
  const a = randInt(aMin, aMax);
  const b = randInt(bMin, bMax);
  return numericChallenge("multiply", `${a} × ${b} = ?`, a * b, spreadFor(a * b));
}

function makeDivide(level: Level): Challenge {
  // Build from a known product so the quotient is always whole.
  const [, [bMin, bMax]] = MUL[Math.max(3, level) as Level];
  const divisor = randInt(Math.max(2, bMin), bMax);
  const quotient = randInt(2, level >= 4 ? 12 : 9);
  const dividend = divisor * quotient;
  return numericChallenge("divide", `${dividend} ÷ ${divisor} = ?`, quotient, spreadFor(quotient));
}

function makeMissing(level: Level): Challenge {
  const cap = ADD_MAX[level];
  const total = randInt(3, cap);
  const known = randInt(1, total - 1);
  return numericChallenge("missing", `${known} + ? = ${total}`, total - known, spreadFor(total));
}

const COMPARE_MAX: Record<Level, number> = { 1: 20, 2: 100, 3: 1000, 4: 10000, 5: 100000 };

function makeCompare(level: Level): Challenge {
  const cap = COMPARE_MAX[level];
  const a = randInt(1, cap);
  let b = a;
  for (let t = 0; b === a && t < 200; t++) b = randInt(1, cap);
  const bigger = Math.max(a, b);
  const distractors: number[] = [];
  for (let t = 0; distractors.length < 2 && t < 200; t++) {
    const d = randInt(1, cap);
    if (d !== a && d !== b && !distractors.includes(d)) distractors.push(d);
  }
  const choices = shuffle([a, b, ...distractors]);
  return {
    category: "compare",
    prompt: `Which is bigger: ${a} or ${b}?`,
    choices: choices.map(String),
    correctIndex: choices.indexOf(bigger),
  };
}

// ─────────────────────────────────────────────────────────────
// Patterns — additive at low levels, multiplicative / two-rule higher up.
// ─────────────────────────────────────────────────────────────

function makePattern(level: Level): Challenge {
  // Higher tiers mix in multiplicative + accelerating patterns ("thinking").
  const kinds =
    level <= 2
      ? (["add"] as const)
      : level === 3
        ? (["add", "mul"] as const)
        : (["add", "mul", "accel"] as const);
  const kind = pick(kinds as readonly string[]) ?? "add";

  if (kind === "mul") {
    const start = randInt(1, 3);
    const factor = pick([2, 3, 4, 5]) ?? 2;
    const seq = [start, start * factor, start * factor ** 2, start * factor ** 3];
    return numericChallenge("pattern", `${seq[0]}, ${seq[1]}, ${seq[2]}, ?`, seq[3], spreadFor(seq[3]));
  }
  if (kind === "accel") {
    // +1, +2, +3, … (triangular-style) — needs spotting the changing step.
    const start = randInt(1, 5);
    let step = randInt(1, 3);
    const seq = [start];
    for (let i = 0; i < 3; i++) {
      seq.push(seq[seq.length - 1] + step);
      step += 1;
    }
    return numericChallenge("pattern", `${seq[0]}, ${seq[1]}, ${seq[2]}, ?`, seq[3], 3);
  }
  const start = randInt(1, level >= 3 ? 12 : 6);
  const step = pick(level <= 1 ? [1, 2] : level === 2 ? [2, 5, 10] : [3, 4, 6, 7]) ?? 2;
  const seq = [start, start + step, start + step * 2, start + step * 3];
  return numericChallenge("pattern", `${seq[0]}, ${seq[1]}, ${seq[2]}, ?`, seq[3], spreadFor(seq[3]));
}

function makeOddOneOut(level: Level): Challenge {
  const cap = Math.max(4, Math.floor(COMPARE_MAX[level] / 2));
  const odd = randInt(0, cap) * 2 + 1;
  const evens: number[] = [];
  for (let t = 0; evens.length < 3 && t < 200; t++) {
    const e = randInt(1, cap) * 2;
    if (!evens.includes(e) && e !== odd) evens.push(e);
  }
  const all = shuffle([odd, ...evens]);
  return {
    category: "odd-one-out",
    prompt: "Pick the odd number:",
    choices: all.map(String),
    correctIndex: all.indexOf(odd),
  };
}

// ─────────────────────────────────────────────────────────────
// Counting (visual)
// ─────────────────────────────────────────────────────────────

const COUNT_EMOJI = ["🍎", "🐤", "⭐", "🌸", "🍓", "🐢", "🎈", "🐞"];

function makeCounting(level: Level): Challenge {
  const n = randInt(1, level >= 2 ? 20 : 10);
  const glyph = pick(COUNT_EMOJI) ?? "⭐";
  const base = numericChallenge("counting", "How many?", n, 2);
  return { ...base, visual: { kind: "glyphs", glyphs: Array(n).fill(glyph), layout: "row" } };
}

// ─────────────────────────────────────────────────────────────
// Geometry — SVG shapes (polygons up to a dodecagon, plus rectangle /
// triangle measurement). Far richer than emoji shape-naming.
// ─────────────────────────────────────────────────────────────

const POLY_NAMES: Record<number, string> = {
  3: "triangle",
  4: "square",
  5: "pentagon",
  6: "hexagon",
  7: "heptagon",
  8: "octagon",
  9: "nonagon",
  10: "decagon",
  12: "dodecagon",
};

function makeGeometry(level: Level): Challenge {
  const options =
    level <= 1
      ? (["sides"] as const)
      : level === 2
        ? (["sides", "name"] as const)
        : level === 3
          ? (["sides", "name", "area", "perimeter"] as const)
          : (["sides", "area", "perimeter", "triangle"] as const);
  const kind = pick(options as readonly string[]) ?? "sides";

  if (kind === "area") {
    const w = randInt(2, level >= 4 ? 20 : 10);
    const h = randInt(2, level >= 4 ? 12 : 8);
    return {
      ...numericChallenge("geometry", `Area of this rectangle? (${w} × ${h})`, w * h, spreadFor(w * h)),
      visual: { kind: "rect", w, h, showDims: true },
    };
  }
  if (kind === "perimeter") {
    const w = randInt(2, level >= 4 ? 20 : 10);
    const h = randInt(2, level >= 4 ? 12 : 8);
    return {
      ...numericChallenge("geometry", "Perimeter of this rectangle?", 2 * (w + h), spreadFor(2 * (w + h))),
      visual: { kind: "rect", w, h, showDims: true },
    };
  }
  if (kind === "triangle") {
    let base = randInt(2, 12);
    const height = randInt(2, 10);
    // Keep base × height even so the half-area is a whole number.
    if ((base * height) % 2 !== 0) base += 1;
    const area = (base * height) / 2;
    return {
      ...numericChallenge("geometry", "Area of this triangle? (½ × base × height)", area, spreadFor(area)),
      visual: { kind: "triangle", base, height },
    };
  }
  // sides / name → regular polygon
  const sideChoices =
    level <= 1 ? [3, 4] : level === 2 ? [3, 4, 5, 6] : level === 3 ? [3, 4, 5, 6, 7, 8] : [5, 6, 7, 8, 9, 10, 12];
  const sides = pick(sideChoices) ?? 4;

  if (kind === "name") {
    const target = POLY_NAMES[sides] ?? "shape";
    const pool = Object.values(POLY_NAMES);
    const names = new Set<string>([target]);
    for (let t = 0; names.size < 4 && t < 200; t++) names.add(pick(pool)!);
    const choices = shuffle([...names]);
    return {
      category: "geometry",
      prompt: "What is this shape called?",
      choices,
      correctIndex: choices.indexOf(target),
      visual: { kind: "polygon", sides },
    };
  }
  return {
    ...numericChallenge("geometry", "How many sides?", sides, 2),
    visual: { kind: "polygon", sides },
  };
}

// ─────────────────────────────────────────────────────────────
// Fractions
// ─────────────────────────────────────────────────────────────

function makeFraction(level: Level): Challenge {
  if (level <= 3) {
    // Mix: "what fraction is shaded?" (visual) and compare unit fractions.
    if (pick([true, false])) {
      const den = pick([2, 3, 4, 5, 6]) ?? 4;
      const shaded = randInt(1, den - 1);
      const correct = `${shaded}/${den}`;
      const wrong = new Set<string>([correct]);
      for (let t = 0; wrong.size < 4 && t < 200; t++) {
        const d2 = pick([2, 3, 4, 5, 6]) ?? 4;
        const n2 = randInt(1, d2 - 1);
        wrong.add(`${n2}/${d2}`);
      }
      const choices = shuffle([...wrong]);
      return {
        category: "fraction",
        prompt: "What fraction is shaded?",
        choices,
        correctIndex: choices.indexOf(correct),
        visual: { kind: "bar", den, shaded },
      };
    }
    // Compare two unit fractions (smaller denominator = bigger fraction).
    const dens = shuffle([2, 3, 4, 5, 6, 8]).slice(0, 3);
    const bigger = `1/${Math.min(...dens)}`;
    const choices = shuffle(dens.map((d) => `1/${d}`));
    return {
      category: "fraction",
      prompt: "Which fraction is the biggest?",
      choices,
      correctIndex: choices.indexOf(bigger),
    };
  }
  // Level 4–5: add fractions with the same denominator.
  const den = pick([4, 5, 6, 8, 10]) ?? 5;
  const a = randInt(1, den - 2);
  const b = randInt(1, den - a - 1);
  const correct = `${a + b}/${den}`;
  const wrong = new Set<string>([correct]);
  for (let t = 0; wrong.size < 4 && t < 200; t++) {
    const n2 = randInt(1, den);
    wrong.add(`${n2}/${den}`);
  }
  const choices = shuffle([...wrong]);
  return {
    category: "fraction",
    prompt: `${a}/${den} + ${b}/${den} = ?`,
    choices,
    correctIndex: choices.indexOf(correct),
  };
}

// ─────────────────────────────────────────────────────────────
// Word problems + percentages — the "thinking" layer for older kids.
// ─────────────────────────────────────────────────────────────

const NAMES = ["Mia", "Leo", "Ava", "Noah", "Emma", "Kai", "Zoe", "Sam"];
const ITEMS = ["apples", "stickers", "marbles", "coins", "cookies", "shells", "stars", "crayons"];

function makeWord(level: Level): Challenge {
  const name = pick(NAMES) ?? "Mia";
  const name2 = pick(NAMES.filter((n) => n !== name)) ?? "Leo";
  const item = pick(ITEMS) ?? "apples";

  // Level 5 sometimes asks a percentage problem (still a word/thinking task).
  if (level >= 5 && pick([true, false])) {
    const base = pick([20, 40, 50, 60, 80, 100]) ?? 40;
    const pct = pick([10, 25, 50]) ?? 50;
    const ans = (base * pct) / 100;
    return numericChallenge("word", `What is ${pct}% of ${base}?`, ans, spreadFor(ans));
  }

  const steps = level <= 2 ? 1 : level <= 4 ? 2 : pick([2, 3]) ?? 2;
  const small = level <= 2 ? 20 : level <= 3 ? 50 : 99;

  if (steps === 1) {
    if (pick([true, false])) {
      const a = randInt(2, small);
      const b = randInt(1, small);
      return numericChallenge("word", `${name} has ${a} ${item}. ${name2} gives ${b} more. How many now?`, a + b, spreadFor(a + b));
    }
    const a = randInt(3, small);
    const b = randInt(1, a - 1);
    return numericChallenge("word", `${name} had ${a} ${item} and gave away ${b}. How many are left?`, a - b, spreadFor(a));
  }

  if (steps === 2) {
    // multiply then add/subtract (groups + change)
    const groups = randInt(2, level >= 4 ? 9 : 5);
    const per = randInt(2, level >= 4 ? 9 : 5);
    const change = randInt(1, Math.max(2, groups * per - 1));
    if (pick([true, false])) {
      const ans = groups * per + change;
      return numericChallenge("word", `${name} has ${groups} boxes of ${per} ${item}, then finds ${change} more. How many ${item} in total?`, ans, spreadFor(ans));
    }
    const ans = groups * per - change;
    return numericChallenge("word", `${groups} bags hold ${per} ${item} each. ${change} are lost. How many ${item} are left?`, ans, spreadFor(ans));
  }

  // 3-step: groups × per, shared between friends after losing some
  const groups = randInt(2, 6);
  const per = randInt(2, 6);
  const total = groups * per;
  const friends = pick([2, 3, 4].filter((f) => total % f === 0)) ?? 2;
  const ans = total / friends;
  return numericChallenge("word", `${groups} baskets hold ${per} ${item} each. They are shared equally among ${friends} friends. How many does each friend get?`, ans, spreadFor(ans));
}

// ─────────────────────────────────────────────────────────────
// Utilities (bounded — never throw / hang)
// ─────────────────────────────────────────────────────────────

/** Distractor spread scales with the answer's magnitude so big answers don't
 *  get giveaway ±1 options only. */
function spreadFor(answer: number): number {
  if (answer <= 10) return 3;
  if (answer <= 30) return 5;
  if (answer <= 100) return 10;
  return Math.max(12, Math.round(answer * 0.15));
}

function numericChallenge(
  category: ChallengeCategory,
  prompt: string,
  answer: number,
  spread: number,
): Challenge {
  const distractors = new Set<number>();
  const offsets = [-spread, -2, -1, 1, 2, spread, Math.round(spread / 2), -Math.round(spread / 2)];
  for (let t = 0; distractors.size < 3 && t < 400; t++) {
    const d = answer + (pick(offsets) ?? 1);
    if (d !== answer && d >= 0) distractors.add(d);
  }
  const choices = shuffle([answer, ...distractors]).map(String);
  return { category, prompt, choices, correctIndex: choices.indexOf(String(answer)) };
}

function randInt(min: number, max: number): number {
  if (max < min) max = min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: readonly T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Resolve a story's age range to the single target age used for tiering. */
export function ageFromRange(range: readonly [number, number]): number {
  return Math.round((range[0] + range[1]) / 2);
}

/** Human label per tier (for admin preview). */
export const TIER_LABELS: Record<AgeTier, string> = {
  tier1: "Tier 1 · ages 4–5 · counting & shapes",
  tier2: "Tier 2 · ages 6–7 · ± within 100, ×, patterns",
  tier3: "Tier 3 · ages 8–9 · tables, ÷, fractions, area",
  tier4: "Tier 4 · ages 10–11 · 2-digit ×÷, fraction ops, geometry",
  tier5: "Tier 5 · age 12 · %, fractions, multi-step thinking",
};
