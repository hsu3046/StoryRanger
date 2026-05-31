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

export type ChallengeCategory = z.infer<typeof ChallengeCategorySchema>;

export type ChallengeVisual =
  | { kind: "glyphs"; glyphs: string[]; layout: "row" | "single" }
  | { kind: "polygon"; sides: number }
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

export function generateChallenge(opts: {
  age: number;
  category?: ChallengeCategory | "auto";
}): Challenge {
  const { age, categories } = planForAge(opts.age);
  const category =
    !opts.category || opts.category === "auto"
      ? pick(categories) ?? "add"
      : opts.category;

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

function makeShape(): Challenge {
  const sides = pick([3, 4, 5, 6]) ?? 4;
  const target = POLY_NAMES[sides];
  const names = new Set<string>([target]);
  const pool = Object.values(POLY_NAMES);
  for (let t = 0; names.size < 4 && t < 200; t++) names.add(pick(pool)!);
  const choices = shuffle([...names]);
  return {
    category: "shape",
    prompt: "What shape is this?",
    choices,
    correctIndex: choices.indexOf(target),
    visual: { kind: "polygon", sides },
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
    ...numericChallenge("measure", `Area of this rectangle? (${w} × ${h})`, w * h, spreadFor(w * h)),
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

function makeRatio(age: number): Challenge {
  if (pick([true, false])) {
    // Simplify a:b.
    const g = randInt(2, 6);
    const x = randInt(1, 5);
    let y = randInt(1, 5);
    if (x === y) y = y === 5 ? y - 1 : y + 1;
    const correct = `${x}:${y}`;
    const opts = new Set<string>([correct]);
    for (let t = 0; opts.size < 4 && t < 200; t++) opts.add(`${randInt(1, 6)}:${randInt(1, 6)}`);
    const choices = shuffle([...opts]);
    return { category: "ratio", prompt: `Simplify the ratio ${x * g} : ${y * g}`, choices, correctIndex: choices.indexOf(correct) };
  }
  // Find the missing term: a:b, first = a×k → second = b×k.
  const a = randInt(1, 4), b = randInt(1, 5), k = randInt(2, 5);
  void age;
  return numericChallenge("ratio", `The ratio is ${a} : ${b}. If the first is ${a * k}, the second is ?`, b * k, spreadFor(b * k));
}

function makeMoney(age: number): Challenge {
  const mode = pick(age <= 7 ? ["add", "sub"] : ["add", "sub", "mul"]);
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

function moneyAnswer(prompt: string, cents: number): Challenge {
  const opts = new Set<string>([money(cents)]);
  for (let t = 0; opts.size < 4 && t < 200; t++) {
    const cand = cents + pick([-50, -20, -10, 10, 20, 50])!;
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
