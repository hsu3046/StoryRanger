/**
 * Math + logic puzzles for the v2.0c battle system.
 *
 * Each monster has a puzzle "kind" they're solved against. Puzzles are
 * randomized but answer-deterministic; the dice flavor comes from
 * damage rolls and time-based critical bonuses.
 */

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

export function generatePuzzle(
  preferredKind?: PuzzleKind,
  difficulty: "easy" | "medium" | "hard" = "easy",
): Puzzle {
  const kind =
    preferredKind ??
    pick(KINDS_BY_DIFFICULTY[difficulty]) ??
    "add-1d";

  switch (kind) {
    case "add-1d":
      return makeAdd(1);
    case "sub-1d":
      return makeSub(1);
    case "add-2d":
      return makeAdd(2);
    case "multiply":
      return makeMultiply();
    case "pattern":
      return makePattern();
    case "odd-out":
      return makeOddOut();
    case "bigger":
      return makeBigger();
    case "missing":
      return makeMissing();
  }
}

// ─────────────────────────────────────────────────────────────
// Puzzle generators
// ─────────────────────────────────────────────────────────────

function makeAdd(maxDigits: 1 | 2): Puzzle {
  const max = maxDigits === 1 ? 9 : 19;
  const a = randInt(1, max);
  const b = randInt(1, max);
  const ans = a + b;
  return numericPuzzle(
    "add-1d",
    `${a} + ${b} = ?`,
    ans,
    /* spread */ 3,
  );
}

function makeSub(maxDigits: 1 | 2): Puzzle {
  const max = maxDigits === 1 ? 9 : 19;
  const a = randInt(2, max);
  const b = randInt(1, a - 1);
  const ans = a - b;
  return numericPuzzle("sub-1d", `${a} − ${b} = ?`, ans, 3);
}

function makeMultiply(): Puzzle {
  const a = randInt(2, 6);
  const b = randInt(2, 6);
  const ans = a * b;
  return numericPuzzle("multiply", `${a} × ${b} = ?`, ans, 5);
}

function makePattern(): Puzzle {
  const start = randInt(1, 6);
  const step = pick([1, 2, 2, 3, 5])!;
  const seq = [start, start + step, start + step * 2, start + step * 3];
  const missingIdx = pick([3])!; // always last for kid clarity
  const question = `${seq[0]}, ${seq[1]}, ${seq[2]}, ?`;
  return numericPuzzle("pattern", question, seq[missingIdx], step + 1);
}

function makeOddOut(): Puzzle {
  // pick three even, one odd (or vice-versa)
  const odd = randInt(1, 9) * 2 + 1; // odd
  const evens: number[] = [];
  while (evens.length < 3) {
    const e = randInt(1, 9) * 2;
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

function makeBigger(): Puzzle {
  const a = randInt(5, 50);
  let b = a;
  while (b === a) b = randInt(5, 50);
  const bigger = Math.max(a, b);
  // Make 4 choices including both. Add 2 distractors near range.
  const distractors: number[] = [];
  while (distractors.length < 2) {
    const d = randInt(5, 50);
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

function makeMissing(): Puzzle {
  const ans = randInt(2, 9);
  const total = ans + randInt(2, 9);
  const known = total - ans;
  return numericPuzzle("missing", `${known} + ? = ${total}`, ans, 3);
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
  while (distractors.size < 3) {
    const off = pick([
      -spread,
      -2,
      -1,
      1,
      2,
      spread,
    ])!;
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
