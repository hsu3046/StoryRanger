/**
 * Math + logic puzzles for the v2.0c battle system.
 *
 * Each monster has a puzzle "kind" they're solved against. Generators
 * pull their ranges + distractor spreads from `puzzle-routing.json`'s
 * `generators` field (admin-editable). Anything not configured falls
 * back to the DEFAULT_GENERATORS below.
 */

import type {
  BiggerGenT,
  MissingGenT,
  MultiplyGenT,
  NumericRangeGenT,
  OddOutGenT,
  PatternGenT,
  PuzzleGeneratorsT,
} from "@/data/schemas/puzzle-routing";

export type PuzzleKind =
  | "add-1d" // 1-digit addition: 3 + 4 = ?
  | "sub-1d" // 1-digit subtraction: 9 - 3 = ?
  | "add-2d" // 2-digit addition: 12 + 7 = ?
  | "multiply" // small multiplication: 4 × 3 = ?
  | "pattern" // pattern complete: 2, 4, 6, ?
  | "odd-out" // pick the odd number (from 4)
  | "bigger" // which number is bigger
  | "missing"; // 3 + ? = 8

export interface Puzzle {
  kind: PuzzleKind;
  /** Display string, e.g. "7 + 5 = ?" */
  question: string;
  /** 4 choice strings (numbers as strings, mixed-type for variety). */
  choices: string[];
  /** Index into choices of the correct answer. */
  correctIndex: number;
}

const KINDS_BY_DIFFICULTY: Record<"easy" | "medium" | "hard", PuzzleKind[]> = {
  easy: ["add-1d", "sub-1d", "bigger", "odd-out"],
  medium: ["add-2d", "missing", "pattern"],
  hard: ["multiply", "pattern"],
};

export function difficultyFor(monsterAc: number): "easy" | "medium" | "hard" {
  if (monsterAc <= 12) return "easy";
  if (monsterAc <= 14) return "medium";
  return "hard";
}

/**
 * Puzzle categories each attacker can solve. When a companion attacks,
 * their categories take priority over the monster's preferred kind.
 *
 * Loaded from JSON via the puzzle-routing schema. Admin can edit the matrix
 * at /admin/stories/<id>/puzzles.
 */
import routingJson from "@/stories/wizard-of-oz/puzzle-routing.json";
import { PuzzleRoutingSchema } from "@/data/schemas/puzzle-routing";

const parsedRouting = PuzzleRoutingSchema.parse(routingJson);

export const ATTACKER_KINDS: Record<
  "hero" | "scarecrow" | "tinman" | "lion",
  PuzzleKind[]
> = {
  hero: parsedRouting.attackerKinds.hero ?? ["add-1d"],
  scarecrow: parsedRouting.attackerKinds.scarecrow ?? ["add-1d"],
  tinman: parsedRouting.attackerKinds.tinman ?? ["add-1d"],
  lion: parsedRouting.attackerKinds.lion ?? ["add-1d"],
};

// ─────────────────────────────────────────────────────────────
// Generator config — defaults match the original hardcoded ranges so
// authors who never touch the admin tab get identical behaviour.
// ─────────────────────────────────────────────────────────────

export const DEFAULT_GENERATORS = {
  "add-1d": { min: 1, max: 9, spread: 3 } satisfies NumericRangeGenT,
  "sub-1d": { min: 1, max: 9, spread: 3 } satisfies NumericRangeGenT,
  "add-2d": { min: 1, max: 19, spread: 3 } satisfies NumericRangeGenT,
  multiply: {
    aMin: 2,
    aMax: 6,
    bMin: 2,
    bMax: 6,
    spread: 5,
  } satisfies MultiplyGenT,
  pattern: {
    startMin: 1,
    startMax: 6,
    steps: [1, 2, 2, 3, 5],
    spread: 4,
  } satisfies PatternGenT,
  "odd-out": { max: 9 } satisfies OddOutGenT,
  bigger: { min: 5, max: 50 } satisfies BiggerGenT,
  missing: {
    ansMin: 2,
    ansMax: 9,
    addMin: 2,
    addMax: 9,
    spread: 3,
  } satisfies MissingGenT,
} as const;

function resolveGenerators(overrides?: PuzzleGeneratorsT) {
  const o = overrides ?? parsedRouting.generators ?? {};
  return {
    "add-1d": o["add-1d"] ?? DEFAULT_GENERATORS["add-1d"],
    "sub-1d": o["sub-1d"] ?? DEFAULT_GENERATORS["sub-1d"],
    "add-2d": o["add-2d"] ?? DEFAULT_GENERATORS["add-2d"],
    multiply: o.multiply ?? DEFAULT_GENERATORS.multiply,
    pattern: o.pattern ?? DEFAULT_GENERATORS.pattern,
    "odd-out": o["odd-out"] ?? DEFAULT_GENERATORS["odd-out"],
    bigger: o.bigger ?? DEFAULT_GENERATORS.bigger,
    missing: o.missing ?? DEFAULT_GENERATORS.missing,
  };
}

/**
 * Generate one puzzle. `overrides` is used by the admin Generators tab
 * to preview unsaved param edits without round-tripping through disk.
 */
export function generatePuzzle(
  preferredKind?: PuzzleKind,
  difficulty: "easy" | "medium" | "hard" = "easy",
  overrides?: PuzzleGeneratorsT,
): Puzzle {
  const kind =
    preferredKind ?? pick(KINDS_BY_DIFFICULTY[difficulty]) ?? "add-1d";
  const gens = resolveGenerators(overrides);

  switch (kind) {
    case "add-1d":
      return makeAdd("add-1d", gens["add-1d"]);
    case "sub-1d":
      return makeSub(gens["sub-1d"]);
    case "add-2d":
      return makeAdd("add-2d", gens["add-2d"]);
    case "multiply":
      return makeMultiply(gens.multiply);
    case "pattern":
      return makePattern(gens.pattern);
    case "odd-out":
      return makeOddOut(gens["odd-out"]);
    case "bigger":
      return makeBigger(gens.bigger);
    case "missing":
      return makeMissing(gens.missing);
  }
}

// ─────────────────────────────────────────────────────────────
// Puzzle generators
// ─────────────────────────────────────────────────────────────

function makeAdd(kind: "add-1d" | "add-2d", cfg: NumericRangeGenT): Puzzle {
  const a = randInt(cfg.min, cfg.max);
  const b = randInt(cfg.min, cfg.max);
  const ans = a + b;
  return numericPuzzle(kind, `${a} + ${b} = ?`, ans, cfg.spread);
}

function makeSub(cfg: NumericRangeGenT): Puzzle {
  // Guarantee a non-negative result by keeping `b` strictly less than `a`.
  const a = randInt(Math.max(cfg.min + 1, 2), cfg.max);
  const b = randInt(cfg.min, a - 1);
  const ans = a - b;
  return numericPuzzle("sub-1d", `${a} − ${b} = ?`, ans, cfg.spread);
}

function makeMultiply(cfg: MultiplyGenT): Puzzle {
  const a = randInt(cfg.aMin, cfg.aMax);
  const b = randInt(cfg.bMin, cfg.bMax);
  const ans = a * b;
  return numericPuzzle("multiply", `${a} × ${b} = ?`, ans, cfg.spread);
}

function makePattern(cfg: PatternGenT): Puzzle {
  const start = randInt(cfg.startMin, cfg.startMax);
  const step = pick(cfg.steps) ?? 1;
  const seq = [start, start + step, start + step * 2, start + step * 3];
  const missingIdx = 3; // always last for kid clarity
  const question = `${seq[0]}, ${seq[1]}, ${seq[2]}, ?`;
  return numericPuzzle("pattern", question, seq[missingIdx], cfg.spread);
}

function makeOddOut(cfg: OddOutGenT): Puzzle {
  const odd = randInt(1, cfg.max) * 2 + 1;
  const evens: number[] = [];
  while (evens.length < 3) {
    const e = randInt(1, cfg.max) * 2;
    if (!evens.includes(e) && e !== odd) evens.push(e);
  }
  const all = shuffle([odd, ...evens]);
  return {
    kind: "odd-out",
    question: "Pick the odd number:",
    choices: all.map(String),
    correctIndex: all.indexOf(odd),
  };
}

function makeBigger(cfg: BiggerGenT): Puzzle {
  const a = randInt(cfg.min, cfg.max);
  let b = a;
  while (b === a) b = randInt(cfg.min, cfg.max);
  const bigger = Math.max(a, b);
  const distractors: number[] = [];
  while (distractors.length < 2) {
    const d = randInt(cfg.min, cfg.max);
    if (d !== a && d !== b && !distractors.includes(d)) distractors.push(d);
  }
  const choices = shuffle([a, b, ...distractors]);
  return {
    kind: "bigger",
    question: `Which is bigger: ${a} or ${b}?`,
    choices: choices.map(String),
    correctIndex: choices.indexOf(bigger),
  };
}

function makeMissing(cfg: MissingGenT): Puzzle {
  const ans = randInt(cfg.ansMin, cfg.ansMax);
  const total = ans + randInt(cfg.addMin, cfg.addMax);
  const known = total - ans;
  return numericPuzzle("missing", `${known} + ? = ${total}`, ans, cfg.spread);
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function numericPuzzle(
  kind: PuzzleKind,
  question: string,
  answer: number,
  spread: number,
): Puzzle {
  const distractors = new Set<number>();
  // Small offsets are always available; the spread parameter controls how
  // far the wildest distractor can drift.
  const offsets = [-spread, -2, -1, 1, 2, spread];
  while (distractors.size < 3) {
    const off = pick(offsets)!;
    const d = answer + off;
    if (d !== answer && d >= 0) distractors.add(d);
  }
  const choices = shuffle([answer, ...distractors]).map(String);
  return {
    kind,
    question,
    choices,
    correctIndex: choices.indexOf(String(answer)),
  };
}

function randInt(min: number, max: number): number {
  // Guard against bad config (max < min) so we never throw at runtime.
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

function pick<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}
