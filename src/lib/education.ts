/**
 * Age-driven educational challenge generator — the single source of problems
 * for BOTH the branch-gating challenge and battle challenges.
 *
 * Topic coverage follows the Singapore MOE primary mathematics syllabus
 * (P1–P6 ≈ ages 7–12, plus pre-school 4–6). Each age gets a DISTINCT mix of
 * level-appropriate topics — trivial types (counting / compare / odd-one-out)
 * live only at the youngest ages; older ages get fractions, decimals,
 * percentage, ratio, measurement, average, factors, algebra and speed, not just
 * bigger numbers. Fully procedural (offline, free, instant, correct-by-
 * construction); answers stay mental-math + multiple-choice friendly.
 *
 * Refs: MOE 2021 Primary Mathematics Syllabus (P1–P6).
 */

import type { z } from "zod";
import type { ChallengeCategorySchema } from "@/data/schemas/primitives";
import {
  WORD_BANK,
  ANTONYMS,
  SYNONYMS,
  RHYME_GROUPS,
  IRREGULAR_PLURALS,
  COMPOUND_WORDS,
  HOMOPHONES,
  type WordEntry,
  type WordPair,
} from "@/data/english-bank";
import {
  STEP_SEQUENCES,
  CONDITIONAL_RULES,
  COMMAND_LANE,
  LOOP_GLYPHS,
  BOOLEAN_TOKENS,
  DIRECTIONS,
} from "@/data/logic-bank";

export type ChallengeCategory = z.infer<typeof ChallengeCategorySchema>;

export type ChallengeVisual =
  | { kind: "glyphs"; glyphs: string[]; layout: "row" | "single" }
  | { kind: "polygon"; sides: number }
  | { kind: "shape"; shape: "circle" | "oval" | "star" | "heart" }
  | { kind: "rect"; w: number; h: number; showDims: boolean }
  | { kind: "triangle"; base: number; height: number }
  | { kind: "bar"; den: number; shaded: number };

export interface Challenge {
  category: ChallengeCategory;
  prompt: string;
  choices: string[];
  correctIndex: number;
  visual?: ChallengeVisual;
}

// ─────────────────────────────────────────────────────────────
// Age → Singapore level → topic mix. P1 starts at age 7, so
// age N maps to level P(N−6); ages 4–6 are pre-school.
// ─────────────────────────────────────────────────────────────

const AGE_PLAN: Record<number, ChallengeCategory[]> = {
  // Pre-school (K1): counting, shapes, sums within 10.
  4: ["counting", "shape", "add", "compare", "odd-one-out"],
  // Pre-school (K2): + simple patterns.
  5: ["counting", "shape", "add", "sub", "compare", "pattern"],
  // P1: ± within 100, intro × & money & time, 2D shapes.
  6: ["add", "sub", "multiply", "money", "shape", "pattern"],
  // P1→P2: tables, division, money, time, 1-step word problems.
  7: ["add", "sub", "multiply", "divide", "money", "time", "geometry", "word"],
  // P2: ± within 1000, ×÷ tables, unit/like fractions, money, time.
  8: ["multiply", "divide", "fraction", "money", "time", "add", "sub", "word"],
  // P3: bigger ×÷, equivalent & like fractions, area/perimeter, time, money.
  9: ["multiply", "divide", "fraction", "measure", "money", "time", "geometry", "word"],
  // P4: factors/multiples, fraction of a set, decimals (±), area, 2-step word.
  10: ["factors", "fraction", "decimal", "multiply", "divide", "measure", "word", "pattern"],
  // P5: fraction ×÷, decimal ×÷, percentage, ratio, area of triangle, average.
  11: ["fraction", "decimal", "percentage", "ratio", "measure", "average", "geometry", "word"],
  // P6: fraction ÷, % increase/decrease, ratio, algebra, speed, average.
  12: ["percentage", "ratio", "algebra", "speed", "average", "fraction", "measure", "word"],
};

export type AgeBand = keyof typeof AGE_PLAN;

function planForAge(age: number): { age: number; categories: ChallengeCategory[] } {
  const a = Math.max(4, Math.min(12, Math.round(age)));
  return { age: a, categories: AGE_PLAN[a] };
}

/** The categories actually produced at this age (the "auto" pool). Used by the
 *  admin preview so it shows only level-appropriate types, not every category. */
export function categoriesForAge(age: number): ChallengeCategory[] {
  return planForAge(age).categories;
}

// ─────────────────────────────────────────────────────────────
// English literacy — a SEPARATE age plan following a Khan-Academy-style
// literacy ladder: phonological awareness + phonics for the young (rhyme,
// first-letter/beginning-sounds, syllables, picture words), then orthography
// (CVC → vowel-team spelling, missing-letter), then meaning/vocabulary for
// older (opposites → synonyms with rarer words). English is author-gated only:
// it is deliberately kept OUT of AGE_PLAN above so battles + math "auto" stay
// math. The "english" meta value (mirrors "auto") samples this plan.
// ─────────────────────────────────────────────────────────────
const ENGLISH_AGE_PLAN: Record<number, ChallengeCategory[]> = {
  // Pre-K / K — phonological awareness + letter sounds + picture words
  4: ["vocab-picture", "first-letter", "rhyme"],
  5: ["vocab-picture", "first-letter", "rhyme", "syllables"],
  // G1 / G2 — phonics → spelling + word-building (plural, compound)
  6: ["first-letter", "rhyme", "missing-letter", "plural"],
  7: ["missing-letter", "spelling", "compound", "plural"],
  // G3 / G4 — spelling + meaning + sound (homophone) + relationships (analogy)
  8: ["spelling", "opposite", "compound", "homophone"],
  9: ["opposite", "synonym", "homophone", "analogy"],
  // G5–G7 — vocabulary, word relationships, and spelling-aware homophones.
  // (Picture-based "spelling" is an early-literacy format, so it stays ≤ G3 —
  // upper grades get tier-2 homophones like their/there instead.)
  10: ["synonym", "opposite", "analogy", "homophone"],
  11: ["synonym", "opposite", "analogy", "homophone"],
  12: ["synonym", "opposite", "analogy", "homophone"],
};

/** Age-appropriate English drills (the "english" meta pool). Used by the admin
 *  preview so English shows per age, and to resolve category "english". */
export function englishCategoriesForAge(age: number): ChallengeCategory[] {
  const a = Math.max(4, Math.min(12, Math.round(age)));
  return ENGLISH_AGE_PLAN[a];
}

// ─────────────────────────────────────────────────────────────
// Logic / computational thinking — pseudo-programming + algorithm basics.
// Ladder: concrete control-flow for the young (sequence → run commands →
// loops) → branching + execution-tracing → abstract logic (debug, boolean
// gates) for older. All NON-numeric (no arithmetic) → distinct from Math.
// ─────────────────────────────────────────────────────────────
const LOGIC_AGE_PLAN: Record<number, ChallengeCategory[]> = {
  4: ["sequence", "commands"],
  5: ["sequence", "commands", "loop"],
  6: ["sequence", "commands", "loop", "conditional"],
  7: ["commands", "loop", "conditional", "trace"],
  8: ["loop", "conditional", "trace", "debug"],
  9: ["conditional", "trace", "debug", "boolean"],
  10: ["trace", "debug", "boolean", "conditional"],
  11: ["debug", "boolean", "conditional", "trace"],
  12: ["boolean", "debug", "conditional", "trace"],
};

/** Age-appropriate logic/coding drills (the "logic" meta pool). */
export function logicCategoriesForAge(age: number): ChallengeCategory[] {
  const a = Math.max(4, Math.min(12, Math.round(age)));
  return LOGIC_AGE_PLAN[a];
}

export function ageBandLabel(age: number): string {
  const a = Math.max(4, Math.min(12, Math.round(age)));
  if (a <= 5) return `Age ${a} · pre-school · counting & shapes`;
  const labels: Record<number, string> = {
    6: "Age 6 · P1 · ± within 100, intro ×, money",
    7: "Age 7 · P1 · tables, ÷, money, time, word",
    8: "Age 8 · P2 · ×÷ tables, fractions, money/time",
    9: "Age 9 · P3 · bigger ×÷, fractions, area",
    10: "Age 10 · P4 · factors, decimals, fraction-of-set",
    11: "Age 11 · P5 · fraction/decimal ×÷, %, ratio, average",
    12: "Age 12 · P6 · %, ratio, algebra, speed",
  };
  return labels[a] ?? `Age ${a}`;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/** Author-facing subject selector for branch / battle challenges. */
export type ChallengeSubject = "mixed" | "math" | "english" | "logic";

export function generateChallenge(opts: {
  age: number;
  category?: ChallengeCategory | "auto" | ChallengeSubject;
}): Challenge {
  const { age, categories } = planForAge(opts.age);
  // Subject metas (age-appropriate pools):
  //   "math"/"auto" → math · "english" → English · "logic" → logic/coding ·
  //   "mixed" → all three. A concrete ChallengeCategory is used as-is.
  const c = opts.category;
  // Missing category resolves to "mixed" to match the schema default — the
  // runtime story is a raw cast (no Zod), so the default isn't applied there.
  const category =
    !c || c === "mixed"
      ? pick([
          ...categories,
          ...englishCategoriesForAge(age),
          ...logicCategoriesForAge(age),
        ]) ?? "add"
      : c === "english"
        ? pick(englishCategoriesForAge(age)) ?? "vocab-picture"
        : c === "logic"
          ? pick(logicCategoriesForAge(age)) ?? "sequence"
          : c === "auto" || c === "math"
            ? pick(categories) ?? "add"
            : c;

  switch (category) {
    case "counting": return makeCounting(age);
    case "shape": return makeShape();
    case "compare": return makeCompare(age);
    case "odd-one-out": return makeOddOneOut(age);
    case "pattern": return makePattern(age);
    case "add": return makeAdd(age);
    case "sub": return makeSub(age);
    case "multiply": return makeMultiply(age);
    case "divide": return makeDivide(age);
    case "missing": return makeMissing(age);
    case "fraction": return makeFraction(age);
    case "decimal": return makeDecimal(age);
    case "percentage": return makePercentage(age);
    case "ratio": return makeRatio(age);
    case "money": return makeMoney(age);
    case "time": return makeTime(age);
    case "measure": return makeMeasure(age);
    case "geometry": return makeGeometry(age);
    case "average": return makeAverage(age);
    case "factors": return makeFactors(age);
    case "algebra": return makeAlgebra();
    case "speed": return makeSpeed();
    case "word": return makeWord(age);
    // English literacy
    case "vocab-picture": return makeVocabPicture(age);
    case "first-letter": return makeFirstLetter(age);
    case "rhyme": return makeRhyme();
    case "syllables": return makeSyllables(age);
    case "missing-letter": return makeMissingLetter(age);
    case "spelling": return makeSpelling(age);
    case "plural": return makePlural(age);
    case "compound": return makeCompound(age);
    case "homophone": return makeHomophone(age);
    case "opposite": return makeOpposite(age);
    case "synonym": return makeSynonym(age);
    case "analogy": return makeAnalogy(age);
    // Logic / computational thinking
    case "sequence": return makeSequence();
    case "commands": return makeCommands(age);
    case "loop": return makeLoop(age);
    case "conditional": return makeConditional();
    case "trace": return makeTrace(age);
    case "debug": return makeDebug(age);
    case "boolean": return makeBoolean(age);
  }
}

// ─────────────────────────────────────────────────────────────
// Arithmetic
// ─────────────────────────────────────────────────────────────

function addCap(age: number): number {
  if (age <= 5) return 10;
  if (age <= 7) return 100;
  if (age <= 9) return 1000;
  return 1000;
}

function makeAdd(age: number): Challenge {
  const cap = addCap(age);
  const a = randInt(1, Math.max(1, cap - 1));
  const b = randInt(1, Math.max(1, cap - a));
  return numericChallenge("add", `${a} + ${b} = ?`, a + b, spreadFor(a + b));
}

function makeSub(age: number): Challenge {
  const cap = addCap(age);
  const a = randInt(2, cap);
  const b = randInt(1, a - 1);
  return numericChallenge("sub", `${a} − ${b} = ?`, a - b, spreadFor(a));
}

function makeMultiply(age: number): Challenge {
  let a: number, b: number;
  if (age <= 6) {
    a = pick([2, 5, 10]) ?? 2;
    b = randInt(1, 5);
  } else if (age <= 8) {
    a = randInt(2, 5);
    b = randInt(2, 10);
  } else if (age <= 9) {
    a = randInt(6, 12);
    b = randInt(2, 9);
  } else {
    a = randInt(11, 29); // 2-digit × 1-digit
    b = randInt(2, 9);
  }
  return numericChallenge("multiply", `${a} × ${b} = ?`, a * b, spreadFor(a * b));
}

function makeDivide(age: number): Challenge {
  const divisor = randInt(2, age <= 8 ? 5 : 9);
  const quotient = randInt(2, age >= 10 ? 12 : 9);
  const dividend = divisor * quotient;
  return numericChallenge("divide", `${dividend} ÷ ${divisor} = ?`, quotient, spreadFor(quotient));
}

function makeMissing(age: number): Challenge {
  const cap = addCap(age);
  const total = randInt(3, cap);
  const known = randInt(1, total - 1);
  return numericChallenge("missing", `${known} + ? = ${total}`, total - known, spreadFor(total));
}

// ─────────────────────────────────────────────────────────────
// Early number sense (young ages only)
// ─────────────────────────────────────────────────────────────

const COUNT_EMOJI = ["🍎", "🐤", "⭐", "🌸", "🍓", "🐢", "🎈", "🐞"];

function makeCounting(age: number): Challenge {
  const n = randInt(1, age <= 4 ? 10 : 20);
  const glyph = pick(COUNT_EMOJI) ?? "⭐";
  const base = numericChallenge("counting", "How many?", n, 2);
  return { ...base, visual: { kind: "glyphs", glyphs: Array(n).fill(glyph), layout: "row" } };
}

function makeCompare(age: number): Challenge {
  const cap = age <= 5 ? 20 : 100;
  const a = randInt(1, cap);
  let b = a;
  for (let t = 0; b === a && t < 200; t++) b = randInt(1, cap);
  const bigger = Math.max(a, b);
  // Binary pick — the two named numbers ARE the only choices. Sampling extra
  // distractors from the range could surface a value larger than both, which
  // contradicts the "which is bigger: a or b?" prompt.
  const choices = shuffle([a, b]).map(String);
  return {
    category: "compare",
    prompt: `Which is bigger: ${a} or ${b}?`,
    choices,
    correctIndex: choices.indexOf(String(bigger)),
  };
}

function makeOddOneOut(age: number): Challenge {
  const cap = age <= 5 ? 10 : 20;
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

function makePattern(age: number): Challenge {
  const kind = age <= 6 ? "add" : age <= 9 ? pick(["add", "mul"]) : pick(["mul", "accel"]);
  if (kind === "mul") {
    const start = randInt(1, 3);
    const f = pick([2, 3, 4, 5]) ?? 2;
    const seq = [start, start * f, start * f * f, start * f * f * f];
    return numericChallenge("pattern", `${seq[0]}, ${seq[1]}, ${seq[2]}, ?`, seq[3], spreadFor(seq[3]));
  }
  if (kind === "accel") {
    const start = randInt(1, 5);
    let step = randInt(2, 4);
    const seq = [start];
    for (let i = 0; i < 3; i++) {
      seq.push(seq[seq.length - 1] + step);
      step += 1;
    }
    return numericChallenge("pattern", `${seq[0]}, ${seq[1]}, ${seq[2]}, ?`, seq[3], 3);
  }
  const start = randInt(1, 9);
  const step = pick(age <= 5 ? [1, 2] : [2, 3, 5, 10]) ?? 2;
  const seq = [start, start + step, start + step * 2, start + step * 3];
  return numericChallenge("pattern", `${seq[0]}, ${seq[1]}, ${seq[2]}, ?`, seq[3], spreadFor(seq[3]));
}

// ─────────────────────────────────────────────────────────────
// Geometry & measurement
// ─────────────────────────────────────────────────────────────

const POLY_NAMES: Record<number, string> = {
  3: "triangle", 4: "square", 5: "pentagon", 6: "hexagon",
  7: "heptagon", 8: "octagon", 9: "nonagon", 10: "decagon",
};

const SPECIAL_SHAPES = ["circle", "oval", "star", "heart"] as const;

function makeShape(): Challenge {
  // Distractor name pool mixes polygons + round/special shapes so a circle
  // question can offer "square"/"oval"/"triangle" etc.
  const pool = [...Object.values(POLY_NAMES), ...SPECIAL_SHAPES];
  const special = Math.random() < 0.45;
  const target = special
    ? (pick(SPECIAL_SHAPES) ?? "circle")
    : POLY_NAMES[pick([3, 4, 5, 6]) ?? 4];
  const names = new Set<string>([target]);
  for (let t = 0; names.size < 4 && t < 200; t++) names.add(pick(pool)!);
  const choices = shuffle([...names]);
  // Re-derive the polygon's side count from the chosen name when not special.
  const sides = special
    ? 0
    : Number(
        Object.keys(POLY_NAMES).find((k) => POLY_NAMES[Number(k)] === target),
      );
  return {
    category: "shape",
    prompt: "What shape is this?",
    choices,
    correctIndex: choices.indexOf(target),
    visual: special
      ? { kind: "shape", shape: target as (typeof SPECIAL_SHAPES)[number] }
      : { kind: "polygon", sides },
  };
}

function makeGeometry(age: number): Challenge {
  // P5+: angles on a straight line / at a point.
  if (age >= 11 && pick([true, false])) {
    const onLine = pick([true, false]);
    const whole = onLine ? 180 : 360;
    const known = randInt(2, (whole - 20) / 10) * 10;
    return numericChallenge(
      "geometry",
      onLine
        ? `Angles on a straight line: ${known}° + ? = 180°`
        : `Angles at a point: ${known}° + ? = 360°`,
      whole - known,
      10,
    );
  }
  const sides = pick(age <= 7 ? [3, 4, 5] : [3, 4, 5, 6, 7, 8]) ?? 4;
  return {
    ...numericChallenge("geometry", "How many sides?", sides, 2),
    visual: { kind: "polygon", sides },
  };
}

function makeMeasure(age: number): Challenge {
  const choice = age >= 11 ? pick(["area", "perim", "triangle", "volume"]) : pick(["area", "perim"]);
  if (choice === "triangle") {
    let base = randInt(2, 12);
    const height = randInt(2, 10);
    if ((base * height) % 2 !== 0) base += 1;
    return {
      ...numericChallenge(
        "measure",
        "Area of this triangle? (½ × base × height)",
        (base * height) / 2,
        spreadFor((base * height) / 2),
      ),
      visual: { kind: "triangle", base, height },
    };
  }
  if (choice === "volume") {
    const l = randInt(2, 6), w = randInt(2, 5), h = randInt(2, 5);
    return numericChallenge("measure", `Volume of a box ${l} × ${w} × ${h}? (length × width × height)`, l * w * h, spreadFor(l * w * h));
  }
  const w = randInt(2, age >= 10 ? 20 : 10);
  const h = randInt(2, age >= 10 ? 12 : 8);
  if (choice === "perim") {
    return {
      ...numericChallenge("measure", "Perimeter of this rectangle?", 2 * (w + h), spreadFor(2 * (w + h))),
      visual: { kind: "rect", w, h, showDims: true },
    };
  }
  return {
    // No "(w × h)" hint — the kid reads the two side lengths off the labeled
    // rectangle and works out the area from the shape alone.
    ...numericChallenge("measure", "Area of this rectangle?", w * h, spreadFor(w * h)),
    visual: { kind: "rect", w, h, showDims: true },
  };
}

// ─────────────────────────────────────────────────────────────
// Fractions (sub-type scales with age)
// ─────────────────────────────────────────────────────────────

function makeFraction(age: number): Challenge {
  if (age <= 8) {
    // P2: "what fraction is shaded?" + compare unit fractions.
    if (pick([true, false])) {
      const den = pick([2, 3, 4, 5, 6]) ?? 4;
      const shaded = randInt(1, den - 1);
      const correct = `${shaded}/${den}`;
      const opts = new Set<string>([correct]);
      for (let t = 0; opts.size < 4 && t < 200; t++) {
        const d2 = pick([2, 3, 4, 5, 6]) ?? 4;
        opts.add(`${randInt(1, d2 - 1)}/${d2}`);
      }
      const choices = shuffle([...opts]);
      return { category: "fraction", prompt: "What fraction is shaded?", choices, correctIndex: choices.indexOf(correct), visual: { kind: "bar", den, shaded } };
    }
    const dens = shuffle([2, 3, 4, 5, 6, 8]).slice(0, 3);
    const bigger = `1/${Math.min(...dens)}`;
    const choices = shuffle(dens.map((d) => `1/${d}`));
    return { category: "fraction", prompt: "Which fraction is the biggest?", choices, correctIndex: choices.indexOf(bigger) };
  }
  if (age === 9) {
    // P3: equivalent fractions + add/sub like fractions.
    if (pick([true, false])) {
      const den = pick([2, 3, 4, 5]) ?? 2;
      const num = randInt(1, den - 1);
      const f = pick([2, 3]) ?? 2;
      const correct = `${num * f}/${den * f}`;
      const opts = new Set<string>([correct]);
      for (let t = 0; opts.size < 4 && t < 200; t++) opts.add(`${randInt(1, den * f)}/${den * f}`);
      const choices = shuffle([...opts]);
      return { category: "fraction", prompt: `${num}/${den} = ?/${den * f}`, choices, correctIndex: choices.indexOf(correct) };
    }
    const den = pick([4, 5, 6, 8]) ?? 5;
    const a = randInt(1, den - 2), b = randInt(1, den - a - 1);
    return fractionAnswer("fraction", `${a}/${den} + ${b}/${den} = ?`, a + b, den);
  }
  if (age === 10) {
    // P4: fraction of a set (whole-number answer) + add/sub like.
    if (pick([true, false])) {
      const den = pick([2, 3, 4, 5]) ?? 4;
      const whole = den * randInt(2, 6);
      const num = randInt(1, den - 1);
      const ans = (whole / den) * num;
      return numericChallenge("fraction", `${num}/${den} of ${whole} = ?`, ans, spreadFor(ans));
    }
    const den = pick([5, 6, 8, 10]) ?? 6;
    const a = randInt(1, den - 2), b = randInt(1, den - a - 1);
    return fractionAnswer("fraction", `${a}/${den} + ${b}/${den} = ?`, a + b, den);
  }
  // P5/P6: fraction × whole, and ÷.
  if (pick([true, false])) {
    const den = pick([2, 3, 4, 5]) ?? 3;
    const whole = den * randInt(2, 6);
    const num = age >= 12 ? 1 : randInt(1, den - 1);
    const ans = (whole / den) * num;
    return numericChallenge("fraction", `${num}/${den} × ${whole} = ?`, ans, spreadFor(ans));
  }
  // ÷ whole by a unit fraction → whole × den (P6).
  const den = pick([2, 3, 4]) ?? 2;
  const whole = randInt(2, 6);
  return numericChallenge("fraction", `${whole} ÷ 1/${den} = ?`, whole * den, spreadFor(whole * den));
}

/** Build choices for a fraction answer `n/den` (+ fraction distractors). */
function fractionAnswer(category: ChallengeCategory, prompt: string, num: number, den: number): Challenge {
  const correct = `${num}/${den}`;
  const opts = new Set<string>([correct]);
  for (let t = 0; opts.size < 4 && t < 200; t++) {
    const n2 = clamp(num + pick([-2, -1, 1, 2])!, 1, den);
    opts.add(`${n2}/${den}`);
  }
  const choices = shuffle([...opts]);
  return { category, prompt, choices, correctIndex: choices.indexOf(correct) };
}

// ─────────────────────────────────────────────────────────────
// Decimals, percentage, ratio, money, time, average, factors, algebra, speed
// ─────────────────────────────────────────────────────────────

function makeDecimal(age: number): Challenge {
  if (age <= 10) {
    // P4: add/subtract one-decimal numbers.
    const a = randInt(2, 40) / 10;
    const b = randInt(1, 30) / 10;
    if (pick([true, false]) && a > b) return decimalAnswer(`${fmt1(a)} − ${fmt1(b)} = ?`, a - b);
    return decimalAnswer(`${fmt1(a)} + ${fmt1(b)} = ?`, a + b);
  }
  // P5: multiply/divide a decimal by a whole number.
  const d = randInt(2, 25) / 10;
  const n = randInt(2, 5);
  if (pick([true, false])) return decimalAnswer(`${fmt1(d)} × ${n} = ?`, d * n);
  const prod = (randInt(2, 12) * n) / 10; // ensure clean ÷
  return decimalAnswer(`${fmt1(prod)} ÷ ${n} = ?`, prod / n);
}

function decimalAnswer(prompt: string, answer: number): Challenge {
  const a = Math.round(answer * 10) / 10;
  const opts = new Set<string>([fmt1(a)]);
  for (let t = 0; opts.size < 4 && t < 200; t++) {
    const cand = Math.round((a + pick([-1, 1, 2, -2, 5, -5])! / 10) * 10) / 10;
    if (cand >= 0) opts.add(fmt1(cand));
  }
  const choices = shuffle([...opts]);
  return { category: "decimal", prompt, choices, correctIndex: choices.indexOf(fmt1(a)) };
}

function makePercentage(age: number): Challenge {
  const base = pick([20, 40, 50, 60, 80, 100, 200]) ?? 40;
  const pct = pick([10, 20, 25, 50, 75]) ?? 50;
  if (age >= 12 && pick([true, false])) {
    const inc = pick([true, false]);
    const delta = (base * pct) / 100;
    const ans = inc ? base + delta : base - delta;
    return numericChallenge("percentage", `${base} ${inc ? "increased" : "decreased"} by ${pct}% = ?`, ans, spreadFor(ans));
  }
  return numericChallenge("percentage", `${pct}% of ${base} = ?`, (base * pct) / 100, spreadFor((base * pct) / 100));
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function makeRatio(age: number): Challenge {
  if (pick([true, false])) {
    // Simplify a:b. x:y must be coprime or the "simplified" answer isn't
    // actually in lowest terms (4:8 → "2:4" while the real 1:2 could appear
    // as a distractor and mark a mathematically-right child wrong).
    const g = randInt(2, 6);
    let x = randInt(1, 5);
    let y = randInt(1, 5);
    if (x === y) y = y === 5 ? y - 1 : y + 1;
    const d = gcd(x, y);
    x /= d;
    y /= d;
    const correct = `${x}:${y}`;
    const opts = new Set<string>([correct]);
    for (let t = 0; opts.size < 4 && t < 200; t++) {
      const n1 = randInt(1, 6);
      const n2 = randInt(1, 6);
      if (n1 * y === n2 * x) continue; // equivalent ratio — a second right answer
      opts.add(`${n1}:${n2}`);
    }
    const choices = shuffle([...opts]);
    return { category: "ratio", prompt: `Simplify the ratio ${x * g} : ${y * g}`, choices, correctIndex: choices.indexOf(correct) };
  }
  // Find the missing term: a:b, first = a×k → second = b×k.
  const a = randInt(1, 4), b = randInt(1, 5), k = randInt(2, 5);
  void age;
  return numericChallenge("ratio", `The ratio is ${a} : ${b}. If the first is ${a * k}, the second is ?`, b * k, spreadFor(b * k));
}

function makeMoney(age: number): Challenge {
  // Difficulty ladder (Singapore money strand):
  //   P1 (≤6)  — whole dollars only ($5 + $3): the skill being tested is
  //              money-as-quantity, not decimal regrouping.
  //   P2 (7)   — 10¢ steps within $10 (no cent-level borrowing).
  //   P3+ (8+) — cent-precision sums + unit-price multiplication.
  if (age <= 6) {
    const mode = pick(["add", "sub"]);
    const a = randInt(3, 9) * 100;
    const b =
      mode === "sub" ? randInt(1, a / 100 - 1) * 100 : randInt(1, 9) * 100;
    // ±$3 reach: the smallest answer ($1.00) still yields 3 positive
    // distractors, keeping a full 4-choice set.
    const dollarSteps = [-300, -200, -100, 100, 200, 300];
    return mode === "sub"
      ? moneyAnswer(`${money(a)} − ${money(b)} = ?`, a - b, dollarSteps)
      : moneyAnswer(`${money(a)} + ${money(b)} = ?`, a + b, dollarSteps);
  }
  if (age <= 7) {
    const mode = pick(["add", "sub"]);
    const a = randInt(3, 90) * 10; // 30¢ .. $9.00 in 10¢ steps
    const b =
      mode === "sub" ? randInt(1, a / 10 - 1) * 10 : randInt(1, 60) * 10;
    return mode === "sub"
      ? moneyAnswer(`${money(a)} − ${money(b)} = ?`, a - b)
      : moneyAnswer(`${money(a)} + ${money(b)} = ?`, a + b);
  }
  const mode = pick(["add", "sub", "mul"]);
  if (mode === "mul") {
    const unit = randInt(2, 9) * 5; // cents, multiple of 5
    const qty = randInt(2, 6);
    return moneyAnswer(`${qty} items at ${money(unit)} each = ?`, unit * qty);
  }
  const a = randInt(20, 900); // cents
  const b = randInt(10, mode === "sub" ? a - 5 : 600);
  return mode === "sub"
    ? moneyAnswer(`${money(a)} − ${money(b)} = ?`, a - b)
    : moneyAnswer(`${money(a)} + ${money(b)} = ?`, a + b);
}

/** Distractor steps default to coin-sized nudges; whole-dollar drills pass
 *  dollar-sized steps so the wrong choices look like the answer's format
 *  (a lone "$7.10" among "$x.00" options would give itself away). */
function moneyAnswer(
  prompt: string,
  cents: number,
  steps: number[] = [-50, -20, -10, 10, 20, 50],
): Challenge {
  const opts = new Set<string>([money(cents)]);
  for (let t = 0; opts.size < 4 && t < 200; t++) {
    const cand = cents + pick(steps)!;
    if (cand > 0) opts.add(money(cand));
  }
  const choices = shuffle([...opts]);
  return { category: "money", prompt, choices, correctIndex: choices.indexOf(money(cents)) };
}

function makeTime(age: number): Challenge {
  const mode = pick(age <= 7 ? ["convert", "duration"] : ["convert", "duration", "later"]);
  if (mode === "convert") {
    const h = randInt(1, 4);
    return numericChallenge("time", `${h} ${h === 1 ? "hour" : "hours"} = ? minutes`, h * 60, 15);
  }
  if (mode === "later") {
    const startH = randInt(1, 9);
    const add = pick([30, 45, 60, 90]) ?? 60;
    const total = startH * 60 + add;
    const ans = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
    const opts = new Set<string>([ans]);
    for (let t = 0; opts.size < 4 && t < 200; t++) {
      const m = startH * 60 + add + pick([-60, -15, 15, 60])!;
      if (m > 0) opts.add(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);
    }
    const choices = shuffle([...opts]);
    return { category: "time", prompt: `It is ${startH}:00. What time is it ${add} minutes later?`, choices, correctIndex: choices.indexOf(ans) };
  }
  const dur = pick([15, 20, 25, 35, 40]) ?? 20;
  // Keep start + dur within the same hour so the end minute is valid (no
  // "3:70"). Pick the start AFTER the duration so end = start + dur ≤ 59.
  const startM = randInt(0, 59 - dur);
  const endM = startM + dur;
  return numericChallenge("time", `From 3:${String(startM).padStart(2, "0")} to 3:${String(endM).padStart(2, "0")} is ? minutes`, dur, 5);
}

function makeAverage(age: number): Challenge {
  void age;
  const n = pick([2, 3, 4]) ?? 3;
  const avg = randInt(3, 12);
  // Build n numbers averaging `avg` (keep small + whole).
  const nums: number[] = [];
  let sum = avg * n;
  for (let i = 0; i < n - 1; i++) {
    const v = clamp(randInt(1, 2 * avg - 1), 1, sum - (n - 1 - i));
    nums.push(v);
    sum -= v;
  }
  nums.push(sum);
  return numericChallenge("average", `Average of ${shuffle(nums).join(", ")} = ?`, avg, spreadFor(avg));
}

function makeFactors(age: number): Challenge {
  void age;
  if (pick([true, false])) {
    // "Which is a factor of N?"
    const n = pick([12, 16, 18, 20, 24, 30, 36]) ?? 24;
    const factors = factorsOf(n).filter((f) => f > 1 && f < n);
    const correct = pick(factors) ?? 2;
    const opts = new Set<number>([correct]);
    for (let t = 0; opts.size < 4 && t < 300; t++) {
      const cand = randInt(2, n - 1);
      if (n % cand !== 0) opts.add(cand);
    }
    const choices = shuffle([...opts]);
    return { category: "factors", prompt: `Which is a factor of ${n}?`, choices: choices.map(String), correctIndex: choices.indexOf(correct) };
  }
  // "Next multiple of m after k"
  const m = randInt(3, 9);
  const k = randInt(m + 1, m * 6);
  const ans = (Math.floor(k / m) + 1) * m;
  return numericChallenge("factors", `What is the next multiple of ${m} after ${k}?`, ans, m);
}

function makeAlgebra(): Challenge {
  if (pick([true, false])) {
    const x = randInt(2, 12);
    const b = randInt(1, 20);
    return numericChallenge("algebra", `If x + ${b} = ${x + b}, then x = ?`, x, spreadFor(x + b));
  }
  const y = randInt(2, 9);
  const k = randInt(2, 9);
  return numericChallenge("algebra", `If y = ${y}, what is ${k}y ?`, k * y, spreadFor(k * y));
}

function makeSpeed(): Challenge {
  const speed = pick([20, 30, 40, 50, 60]) ?? 40;
  const time = randInt(2, 4);
  if (pick([true, false])) {
    // distance from speed × time
    return numericChallenge("speed", `A car travels ${speed} km/h for ${time} h. Distance = ?`, speed * time, spreadFor(speed * time));
  }
  // speed from distance ÷ time
  const dist = speed * time;
  return numericChallenge("speed", `A car travels ${dist} km in ${time} h. Speed = ? km/h`, speed, spreadFor(speed));
}

// ─────────────────────────────────────────────────────────────
// Word / heuristic problems (1–3 step, scaled)
// ─────────────────────────────────────────────────────────────

const NAMES = ["Mia", "Leo", "Ava", "Noah", "Emma", "Kai", "Zoe", "Sam"];
const ITEMS = ["apples", "stickers", "marbles", "coins", "cookies", "shells", "stars", "crayons"];

function makeWord(age: number): Challenge {
  const name = pick(NAMES) ?? "Mia";
  const name2 = pick(NAMES.filter((n) => n !== name)) ?? "Leo";
  const item = pick(ITEMS) ?? "apples";
  const steps = age <= 7 ? 1 : age <= 10 ? 2 : pick([2, 3]) ?? 2;
  const small = age <= 7 ? 20 : age <= 9 ? 50 : 99;

  if (steps === 1) {
    if (pick([true, false])) {
      const a = randInt(2, small), b = randInt(1, small);
      return numericChallenge("word", `${name} has ${a} ${item}. ${name2} gives ${b} more. How many now?`, a + b, spreadFor(a + b));
    }
    const a = randInt(3, small), b = randInt(1, a - 1);
    return numericChallenge("word", `${name} had ${a} ${item} and gave away ${b}. How many are left?`, a - b, spreadFor(a));
  }
  if (steps === 2) {
    const groups = randInt(2, age >= 10 ? 9 : 5);
    const per = randInt(2, age >= 10 ? 9 : 5);
    const change = randInt(1, Math.max(2, groups * per - 1));
    if (pick([true, false])) {
      return numericChallenge("word", `${name} has ${groups} boxes of ${per} ${item}, then finds ${change} more. How many in total?`, groups * per + change, spreadFor(groups * per + change));
    }
    return numericChallenge("word", `${groups} bags hold ${per} ${item} each. ${change} are lost. How many are left?`, groups * per - change, spreadFor(groups * per));
  }
  // 3-step: groups × per shared among friends
  const groups = randInt(2, 6), per = randInt(2, 6);
  const total = groups * per;
  const friends = pick([2, 3, 4].filter((f) => total % f === 0)) ?? 2;
  return numericChallenge("word", `${groups} baskets hold ${per} ${item} each, shared equally among ${friends} friends. Each gets ?`, total / friends, spreadFor(total / friends));
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function spreadFor(answer: number): number {
  if (answer <= 10) return 3;
  if (answer <= 30) return 5;
  if (answer <= 100) return 10;
  return Math.max(12, Math.round(answer * 0.15));
}

function numericChallenge(category: ChallengeCategory, prompt: string, answer: number, spread: number): Challenge {
  const distractors = new Set<number>();
  const offsets = [-spread, -2, -1, 1, 2, spread, Math.round(spread / 2), -Math.round(spread / 2)];
  for (let t = 0; distractors.size < 3 && t < 400; t++) {
    const dd = answer + (pick(offsets) ?? 1);
    if (dd !== answer && dd >= 0) distractors.add(dd);
  }
  const choices = shuffle([answer, ...distractors]).map(String);
  return { category, prompt, choices, correctIndex: choices.indexOf(String(answer)) };
}

// ─────────────────────────────────────────────────────────────
// English literacy (offline word-bank). Author-gated only.
// ─────────────────────────────────────────────────────────────

const VOWELS = "aeiou";
const CONSONANTS = "bcdfghjklmnpqrstvwxyz";
const REAL_WORDS = new Set(WORD_BANK.map((w) => w.word));

/** Build a 4-choice string problem with the three correctness invariants:
 *  no duplicate choices (Set), correct never duplicated as a distractor, and
 *  correctIndex computed AFTER the shuffle. `distractor()` returns a candidate
 *  (or undefined to skip); the `t < 400` cap matches numericChallenge. */
function stringChallenge(
  category: ChallengeCategory,
  prompt: string,
  correct: string,
  distractor: () => string | undefined,
  visual?: ChallengeVisual,
): Challenge {
  const opts = new Set<string>([correct]);
  for (let t = 0; opts.size < 4 && t < 400; t++) {
    const d = distractor();
    if (d && d !== correct) opts.add(d);
  }
  const choices = shuffle([...opts]);
  return { category, prompt, choices, correctIndex: choices.indexOf(correct), visual };
}

/** Word-tier band per age — a NARROW, climbing window so word difficulty rises
 *  every year (not in 3 big buckets). [lo, hi] inclusive over tiers 1–4. */
function wordTierBand(age: number): [number, number] {
  const a = Math.max(4, Math.min(12, Math.round(age)));
  const bands: Record<number, [number, number]> = {
    4: [1, 1], 5: [1, 1], 6: [1, 2], 7: [2, 2], 8: [2, 3],
    9: [3, 3], 10: [3, 4], 11: [4, 4], 12: [4, 4],
  };
  return bands[a];
}

/** Words at this age's tier band (falls back a tier if a sub-pool is empty). */
function englishWordsForAge(age: number): WordEntry[] {
  const [lo, hi] = wordTierBand(age);
  const inBand = WORD_BANK.filter((w) => w.tier >= lo && w.tier <= hi);
  return inBand.length >= 4 ? inBand : WORD_BANK.filter((w) => w.tier <= hi);
}

/** Vocab-pair tier WINDOW per age — a moving band (not cumulative) so older
 *  ages get the HARDER pairs, not still-easy ones. `start` = the age the skill
 *  begins; before that, clamp to the youngest band. */
function pairTierBand(age: number, start: number): [1 | 2 | 3, 1 | 2 | 3] {
  const step = Math.max(0, Math.min(8, Math.round(age) - start));
  const bands: [1 | 2 | 3, 1 | 2 | 3][] = [
    [1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 3], [3, 3], [3, 3], [3, 3],
  ];
  return bands[step];
}

function pairsInBand(pairs: WordPair[], [lo, hi]: [number, number]): WordPair[] {
  const inBand = pairs.filter((p) => p.tier >= lo && p.tier <= hi);
  return inBand.length >= 2 ? inBand : pairs.filter((p) => p.tier <= hi);
}

/** Antonym pairs at this age's vocabulary tier (opposites begin ~age 6). */
function antonymsForAge(age: number): WordPair[] {
  return pairsInBand(ANTONYMS, pairTierBand(age, 6));
}

/** Synonym pairs at this age's vocabulary tier (synonyms begin ~age 8). */
function synonymsForAge(age: number): WordPair[] {
  return pairsInBand(SYNONYMS, pairTierBand(age, 8));
}

function makeVocabPicture(age: number): Challenge {
  const pool = englishWordsForAge(age);
  const e = pick(pool) ?? WORD_BANK[0];
  return stringChallenge(
    "vocab-picture",
    "What is this?",
    e.word,
    () => pick(pool)?.word,
    { kind: "glyphs", glyphs: [e.emoji], layout: "single" },
  );
}

function makeFirstLetter(age: number): Challenge {
  const pool = englishWordsForAge(age);
  const e = pick(pool) ?? WORD_BANK[0];
  // Younger / coin-flip: "which letter does this picture start with?"
  if (age <= 6 || Math.random() < 0.5) {
    const correct = e.word[0].toUpperCase();
    return stringChallenge(
      "first-letter",
      "Which letter does this start with?",
      correct,
      () => {
        const c = CONSONANTS.concat(VOWELS)[randInt(0, 25)]?.toUpperCase();
        return c && c !== correct ? c : undefined;
      },
      { kind: "glyphs", glyphs: [e.emoji], layout: "single" },
    );
  }
  // Older: "which WORD starts with «L»?" — distractors start with another letter.
  const L = e.word[0].toUpperCase();
  return stringChallenge(
    "first-letter",
    `Which word starts with "${L}"?`,
    e.word,
    () => {
      const w = pick(pool)?.word;
      return w && w[0].toUpperCase() !== L ? w : undefined;
    },
  );
}

function makeRhyme(): Challenge {
  const group = pick(RHYME_GROUPS.filter((g) => g.length >= 2)) ?? RHYME_GROUPS[0];
  const [promptWord, correct] = shuffle(group);
  // Distractors come from OTHER groups → guaranteed non-rhymes.
  const others = RHYME_GROUPS.filter((g) => g !== group).flat();
  return stringChallenge(
    "rhyme",
    `Which word rhymes with "${promptWord}"?`,
    correct,
    () => pick(others),
  );
}

/** The full semantic pair graph — antonyms AND synonyms together, all tiers.
 *  Clusters must be computed on this union: a second valid answer can hide
 *  behind a synonym bridge the single pool can't see (begin–end + start–stop
 *  only connect through the SYNONYM pair begin–start, so "stop" is a valid
 *  opposite of "begin" yet looks unrelated inside ANTONYMS alone). */
const SEMANTIC_PAIRS: ReadonlyArray<WordPair> = [...ANTONYMS, ...SYNONYMS];

function makeOpposite(age: number): Challenge {
  const pool = antonymsForAge(age);
  const p = pick(pool) ?? pool[0];
  const [a, b] = Math.random() < 0.5 ? [p.a, p.b] : [p.b, p.a];
  // Distractors = other antonym words at the same tier — exclude EVERY word
  // semantically linked to `a` across the WHOLE antonym+synonym graph (a word
  // can have more than one valid opposite, and a synonym of `a`'s opposite is
  // itself a valid opposite), so a distractor can't be a second valid answer.
  const group = connectedWords(SEMANTIC_PAIRS, a, b);
  const others = pool.flatMap((q) => [q.a, q.b]).filter((w) => !group.has(w));
  return stringChallenge(
    "opposite",
    `What is the opposite of "${a}"?`,
    b,
    () => pick(others),
  );
}

/** Every word transitively connected to `a` through the pair graph (the whole
 *  synonym/antonym cluster). Words appear in MULTIPLE pairs (e.g. "huge" in
 *  big/huge, huge/massive, tremendous/huge), so excluding only the prompt's own
 *  pair would let a SECOND valid answer slip in as a distractor. Excluding the
 *  full connected component guarantees exactly one correct choice. */
function connectedWords(
  pool: ReadonlyArray<{ a: string; b: string }>,
  a: string,
  b: string,
): Set<string> {
  const group = new Set<string>([a, b]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const q of pool) {
      if (group.has(q.a) && !group.has(q.b)) {
        group.add(q.b);
        grew = true;
      }
      if (group.has(q.b) && !group.has(q.a)) {
        group.add(q.a);
        grew = true;
      }
    }
  }
  return group;
}

function makeSynonym(age: number): Challenge {
  const pool = synonymsForAge(age);
  const p = pick(pool) ?? pool[0];
  const [a, b] = Math.random() < 0.5 ? [p.a, p.b] : [p.b, p.a];
  // Distractors = words from OTHER synonym clusters — exclude EVERY word
  // semantically linked to `a` on the union graph (see SEMANTIC_PAIRS): two
  // synonym pairs with no shared word (happy/glad vs jolly/merry) can still
  // be the same meaning-cluster, so pool-local exclusion isn't enough.
  const group = connectedWords(SEMANTIC_PAIRS, a, b);
  const others = pool.flatMap((q) => [q.a, q.b]).filter((w) => !group.has(w));
  return stringChallenge(
    "synonym",
    `Which word means the same as "${a}"?`,
    b,
    () => pick(others),
  );
}

function makeSyllables(age: number): Challenge {
  // Phonological awareness — "clap the beats". Young ages stay ≤3 syllables.
  const maxSyll = age <= 6 ? 3 : 4;
  const pool = WORD_BANK.filter((w) => w.syll <= maxSyll);
  const e = pick(pool) ?? WORD_BANK[0];
  const correct = String(e.syll);
  return stringChallenge(
    "syllables",
    `How many syllables (beats) in "${e.word}"?`,
    correct,
    () => {
      const n = randInt(1, 4);
      return n === e.syll ? undefined : String(n);
    },
    { kind: "glyphs", glyphs: [e.emoji], layout: "single" },
  );
}

/** Apply one random mutation to a real word → a plausible misspelling. */
function mangle(word: string): string | undefined {
  const a = word.split("");
  const kind = randInt(0, 3);
  if (kind === 0 && a.length >= 2) {
    const i = randInt(0, a.length - 2); // swap two adjacent letters
    [a[i], a[i + 1]] = [a[i + 1], a[i]];
  } else if (kind === 1) {
    const i = randInt(0, a.length - 1); // double a letter
    a.splice(i, 0, a[i]);
  } else if (kind === 2) {
    const vi = a.findIndex((c) => VOWELS.includes(c)); // drop a vowel
    if (vi === -1) return undefined;
    a.splice(vi, 1);
  } else {
    const vi = a.findIndex((c) => VOWELS.includes(c)); // swap a vowel
    if (vi === -1) return undefined;
    let nv = a[vi];
    for (let t = 0; nv === a[vi] && t < 10; t++) nv = VOWELS[randInt(0, 4)];
    a[vi] = nv;
  }
  const out = a.join("");
  return out === word ? undefined : out;
}

function makeSpelling(age: number): Challenge {
  const pool = englishWordsForAge(age);
  const e = pick(pool) ?? WORD_BANK[0];
  // The emoji anchors the answer (pick the spelling that matches the picture),
  // so even a real-word mangle is an unambiguous wrong choice for THIS picture.
  return stringChallenge(
    "spelling",
    "Which spelling is correct?",
    e.word,
    () => {
      const m = mangle(e.word);
      return m && !REAL_WORDS.has(m) ? m : undefined;
    },
    { kind: "glyphs", glyphs: [e.emoji], layout: "single" },
  );
}

function makeMissingLetter(age: number): Challenge {
  const maxLen = age <= 6 ? 4 : 7;
  const pool = englishWordsForAge(age).filter(
    (w) => w.word.length >= 3 && w.word.length <= maxLen,
  );
  const e = pick(pool.length ? pool : englishWordsForAge(age)) ?? WORD_BANK[0];
  const word = e.word;
  const i = randInt(0, word.length - 1);
  const correct = word[i];
  const blanked = word
    .split("")
    .map((c, idx) => (idx === i ? "_" : c))
    .join(" ");
  const isVowel = VOWELS.includes(correct);
  return stringChallenge(
    "missing-letter",
    `Fill the missing letter:  ${blanked}`,
    correct,
    () => {
      const c = isVowel ? VOWELS[randInt(0, 4)] : CONSONANTS[randInt(0, 20)];
      return c !== correct ? c : undefined;
    },
    { kind: "glyphs", glyphs: [e.emoji], layout: "single" },
  );
}

/** Word relationships (Khan G5-7). Two pairs of the SAME relation (both
 *  antonym or both synonym); the child completes the second pair. */
function makeAnalogy(age: number): Challenge {
  const useSyn = Math.random() < 0.5;
  const pool = useSyn ? synonymsForAge(age) : antonymsForAge(age);
  if (pool.length < 2) return makeOpposite(age); // safety fallback
  const [p1, p2] = shuffle(pool);
  // The answer is p2.b, so any other word in p2.a's connected group (another
  // valid synonym/opposite of p2.a) would be a SECOND valid answer — exclude
  // the whole group (on the union graph, like makeOpposite/makeSynonym), plus
  // p1's two words so the prompt pair isn't echoed.
  const group = connectedWords(SEMANTIC_PAIRS, p2.a, p2.b);
  const others = pool
    .flatMap((q) => [q.a, q.b])
    .filter((w) => !group.has(w) && w !== p1.a && w !== p1.b);
  return stringChallenge(
    "analogy",
    `${p1.a} → ${p1.b},  so  ${p2.a} → ___?`,
    p2.b,
    () => pick(others),
  );
}

/** Apply the regular English pluralization rules. */
function regularPlural(w: string): string {
  // Double-f (+ optional e) takes a plain s — giraffe → giraffes,
  // cliff → cliffs. Only a single f/fe mutates to "ves" (leaf → leaves).
  if (/ffe?$/.test(w)) return `${w}s`;
  if (/(s|x|z|ch|sh)$/.test(w)) return `${w}es`;
  if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ies`;
  if (/fe?$/.test(w)) return w.replace(/fe?$/, "ves");
  return `${w}s`;
}

/** Words the REGULAR plural branch must never draw. Irregular nouns would get
 *  a wrong "regular" answer presented as correct (ox→oxes) while the true
 *  plural (oxen) shows up as a distractor; plural-only / mass nouns have no
 *  sensible "one X, two Xs" form at all. Irregulars still appear via the
 *  dedicated IRREGULAR_PLURALS branch, which knows their real plurals. */
const IRREGULAR_SINGULARS = new Set(IRREGULAR_PLURALS.map((p) => p.singular));
const PLURAL_UNSAFE = new Set(["scissors", "milk", "bread"]);

/** Plausible-wrong plural forms (the Set in stringChallenge dedups). */
function pluralDistractorSource(
  singular: string,
  correct: string,
): () => string | undefined {
  const cands = [
    `${singular}s`,
    `${singular}es`,
    singular,
    `${singular}en`,
    regularPlural(singular),
  ].filter((w) => w !== correct);
  return () => pick(cands);
}

function makePlural(age: number): Challenge {
  // ~40% irregular (mouse→mice); else a regular plural from the age word pool.
  if (Math.random() < 0.4) {
    const e = pick(IRREGULAR_PLURALS) ?? IRREGULAR_PLURALS[0];
    return stringChallenge(
      "plural",
      `One ${e.singular}, two ___?`,
      e.plural,
      pluralDistractorSource(e.singular, e.plural),
    );
  }
  const pool = englishWordsForAge(age).filter(
    (w) => !IRREGULAR_SINGULARS.has(w.word) && !PLURAL_UNSAFE.has(w.word),
  );
  const e = pick(pool) ?? WORD_BANK[0];
  const correct = regularPlural(e.word);
  return stringChallenge(
    "plural",
    `One ${e.word}, two ___?`,
    correct,
    pluralDistractorSource(e.word, correct),
    { kind: "glyphs", glyphs: [e.emoji], layout: "single" },
  );
}

function makeCompound(age: number): Challenge {
  void age;
  const e = pick(COMPOUND_WORDS) ?? COMPOUND_WORDS[0];
  // Distractors that SHARE one half with the answer (e.g. "sunset" / "sunshine"
  // for "sun + flower") come first, so the child must combine BOTH parts rather
  // than just pick the only familiar-looking word. Fill the rest at random.
  const sharers = COMPOUND_WORDS.filter(
    (c) => c.whole !== e.whole && (c.a === e.a || c.b === e.b),
  ).map((c) => c.whole);
  const rest = COMPOUND_WORDS.filter(
    (c) => c.whole !== e.whole && c.a !== e.a && c.b !== e.b,
  ).map((c) => c.whole);
  const distractors = [...shuffle(sharers), ...shuffle(rest)].slice(0, 3);
  const choices = shuffle([e.whole, ...distractors]);
  return {
    category: "compound",
    prompt: `${e.a} + ${e.b} = ___?`,
    choices,
    correctIndex: choices.indexOf(e.whole),
  };
}

/** Homophone groups at this age's tier: ≤G4 simple sounds, ≥G5 spelling-aware. */
function homophonesForAge(age: number) {
  const tier = age <= 9 ? 1 : 2;
  const inBand = HOMOPHONES.filter((g) => g.tier === tier);
  return inBand.length ? inBand : HOMOPHONES;
}

function makeHomophone(age: number): Challenge {
  const pool = homophonesForAge(age);
  const group = pick(pool.filter((g) => g.words.length >= 2)) ?? pool[0];
  const [promptWord, correct] = shuffle(group.words);
  // Distractors from OTHER groups → real words that DON'T sound like the prompt.
  const others = HOMOPHONES.filter((g) => g !== group).flatMap((g) => g.words);
  return stringChallenge(
    "homophone",
    `Which word sounds the same as "${promptWord}"?`,
    correct,
    () => pick(others),
  );
}

// ─────────────────────────────────────────────────────────────
// Logic / computational thinking generators (pseudo-programming +
// algorithm basics). All NON-numeric — solved by tracing / ordering /
// branching / deducing, never by arithmetic.
// ─────────────────────────────────────────────────────────────

/** Up-to-4 choices drawn from a fixed pool, always including `correct`. */
function fixedChoices(
  pool: string[],
  correct: string,
): { choices: string[]; correctIndex: number } {
  const opts = new Set<string>([correct]);
  for (const p of shuffle(pool)) {
    if (opts.size >= 4) break;
    opts.add(p);
  }
  const choices = shuffle([...opts]);
  return { choices, correctIndex: choices.indexOf(correct) };
}

/** Sequence — an algorithm is ordered steps ("which step is first / next?"). */
function makeSequence(): Challenge {
  const t = pick(STEP_SEQUENCES) ?? STEP_SEQUENCES[0];
  if (Math.random() < 0.5) {
    return {
      category: "sequence",
      prompt: `To ${t.task}, which step comes FIRST?`,
      ...fixedChoices(t.steps, t.steps[0]),
    };
  }
  const i = randInt(0, t.steps.length - 2);
  // Exclude the step named in the prompt from the distractor pool so it isn't
  // offered as a choice.
  const pool = t.steps.filter((_, j) => j !== i);
  return {
    category: "sequence",
    prompt: `To ${t.task}: what comes right AFTER "${t.steps[i]}"?`,
    ...fixedChoices(pool, t.steps[i + 1]),
  };
}

/** Commands — run a 1-D instruction list; where does the robot land? */
function makeCommands(age: number): Challenge {
  const lane = COMMAND_LANE;
  // Forward-only runs are just "count the arrows" — fine for pre-schoolers,
  // trivial beyond that. From age 6 mix in backward moves so the child must
  // actually trace the path; longer runs as ages climb (lane has 6 squares,
  // so even 5 forward moves stay on the board).
  const allowBack = age >= 6;
  const n = age <= 5 ? randInt(2, 3) : age <= 7 ? randInt(3, 4) : randInt(4, 5);
  let pos = 0;
  const moves: string[] = [];
  for (let i = 0; i < n; i++) {
    const back = allowBack && pos > 0 && Math.random() < 0.3;
    moves.push(back ? "⬅️" : "➡️");
    pos = clamp(pos + (back ? -1 : 1), 0, lane.length - 1);
  }
  return {
    category: "commands",
    prompt: `Lane:  ${lane.join("  ")}\n🤖 starts at ${lane[0]} and runs:  ${moves.join("  ")}\nWhich square does it land on?`,
    ...fixedChoices(lane, lane[pos]),
  };
}

/** Loop — expand a repeat (iteration). The loop BODY is a short sequence (1–2
 *  glyphs for older kids), so the answer is that whole body repeated, not just
 *  one symbol stamped N times — the point of a loop is "repeat this body". */
function makeLoop(age: number): Challenge {
  const bodyLen = age <= 6 ? 1 : (pick([1, 2]) ?? 2);
  const body = shuffle([...LOOP_GLYPHS]).slice(0, bodyLen);
  const bodyStr = body.join("");
  const n = randInt(2, age <= 6 ? 3 : 4);
  const correct = bodyStr.repeat(n);
  const shown = bodyLen > 1 ? `(${bodyStr})` : bodyStr;
  return stringChallenge(
    "loop",
    `What does "repeat ${shown} ${n} times" make?`,
    correct,
    () => {
      const r = Math.random();
      // Wrong order inside each repeat (body reversed) — only meaningful for a
      // 2-glyph body; same length as the answer so it isn't given away.
      if (bodyLen > 1 && r < 0.4) {
        return [...body].reverse().join("").repeat(n);
      }
      // Wrong number of repeats.
      if (r < 0.75) {
        const m = randInt(2, 5);
        return bodyStr.repeat(m === n ? m + 1 : m);
      }
      // A single glyph stamped out — the "not actually looping the body" guess.
      const g = pick(body) ?? bodyStr;
      return g.repeat(randInt(2, bodyLen * n + 1));
    },
  );
}

/** Conditional — if / else branching. */
function makeConditional(): Challenge {
  const r = pick(CONDITIONAL_RULES) ?? CONDITIONAL_RULES[0];
  const condTrue = Math.random() < 0.5;
  const others = CONDITIONAL_RULES.filter((x) => x !== r).flatMap((x) => [
    x.then,
    x.els,
  ]);
  return stringChallenge(
    "conditional",
    `Rule: IF ${r.cond} → "${r.then}", ELSE → "${r.els}".\n` +
      `Now: ${condTrue ? `${r.cond} is TRUE.` : `it is NOT true that ${r.cond}.`} What do you do?`,
    condTrue ? r.then : r.els,
    () => (Math.random() < 0.5 ? (condTrue ? r.els : r.then) : pick(others)),
  );
}

/** Trace — execute turns and predict the facing direction. */
function makeTrace(age: number): Challenge {
  const start = randInt(0, 3);
  const n = randInt(1, age <= 7 ? 2 : 3);
  const turns: string[] = [];
  let pos = start;
  for (let i = 0; i < n; i++) {
    const right = Math.random() < 0.6;
    turns.push(right ? "turn right" : "turn left");
    pos = (pos + (right ? 1 : 3)) % 4;
  }
  const choices = shuffle([...DIRECTIONS]);
  return {
    category: "trace",
    prompt: `You face ${DIRECTIONS[start]}. You ${turns.join(", then ")}. Which way do you face now?`,
    choices,
    correctIndex: choices.indexOf(DIRECTIONS[pos]),
  };
}

/** Debug — a real how-to procedure with ONE step that doesn't belong (an alien
 *  step borrowed from another task). The child reads the algorithm and spots
 *  the buggy step — genuine debugging, not "find the odd symbol". */
function makeDebug(age: number): Challenge {
  void age;
  const task = pick(STEP_SEQUENCES) ?? STEP_SEQUENCES[0];
  // A step from a DIFFERENT task that isn't already part of this one.
  const alienPool = STEP_SEQUENCES.filter((t) => t.task !== task.task)
    .flatMap((t) => t.steps)
    .filter((s) => !task.steps.includes(s));
  const alien = pick(alienPool) ?? alienPool[0];
  const bugPos = randInt(0, task.steps.length - 1);
  const steps = task.steps.map((s, i) => (i === bugPos ? alien : s));
  const numbered = steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return {
    category: "debug",
    // Choices ARE the steps — tap the one that doesn't belong in the procedure.
    prompt: `Here are the steps to ${task.task}, but one is WRONG:\n${numbered}\nWhich step is the bug?`,
    choices: steps,
    correctIndex: bugPos,
  };
}

/** Boolean — AND / OR / NOT logic gates (answer Yes / No). */
function makeBoolean(age: number): Challenge {
  const [x, y] = shuffle(BOOLEAN_TOKENS);
  const gate = pick(age <= 9 ? ["AND", "OR"] : ["AND", "OR", "NOT"]) ?? "AND";
  let prompt: string;
  let open: boolean;
  if (gate === "NOT") {
    const has = Math.random() < 0.5;
    prompt = `The alarm rings if there is NOT a ${x}. You ${has ? "HAVE" : "do NOT have"} a ${x}. Does it ring?`;
    open = !has;
  } else {
    const hasX = Math.random() < 0.5;
    const hasY = Math.random() < 0.5;
    const have =
      [hasX ? x : null, hasY ? y : null].filter(Boolean).join(" + ") ||
      "nothing";
    prompt = `The door opens if you have ${x} ${gate} ${y}. You have: ${have}. Does it open?`;
    open = gate === "AND" ? hasX && hasY : hasX || hasY;
  }
  const choices = shuffle(["Yes", "No"]);
  return {
    category: "boolean",
    prompt,
    choices,
    correctIndex: choices.indexOf(open ? "Yes" : "No"),
  };
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
function fmt1(n: number): string {
  return n.toFixed(1);
}
function factorsOf(n: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= n; i++) if (n % i === 0) out.push(i);
  return out;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
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
