/**
 * Offline content bank for the LOGIC subject — computational-thinking /
 * pseudo-programming + algorithm basics for kids. Pure data; consumed by the
 * `makeX` generators in src/lib/education.ts. Every item is NON-numeric (no
 * arithmetic), so Logic stays clearly distinct from Math: you solve by
 * tracing, ordering, branching or deducing — not by calculating.
 */

/** An everyday task as an ordered list of steps (for the "sequence" drill —
 *  an algorithm is ordered steps). 3–4 short steps, first-to-last. */
export const STEP_SEQUENCES: { task: string; steps: string[] }[] = [
  { task: "plant a seed", steps: ["dig a hole", "drop the seed", "cover with soil", "water it"] },
  { task: "make a sandwich", steps: ["take the bread", "add the filling", "close it", "take a bite"] },
  { task: "brush your teeth", steps: ["wet the brush", "add toothpaste", "brush", "rinse"] },
  { task: "get dressed", steps: ["take off pajamas", "put on a shirt", "put on pants", "tie your shoes"] },
  { task: "bake a cake", steps: ["mix the batter", "pour into the pan", "bake it", "let it cool"] },
  { task: "mail a letter", steps: ["write it", "fold it", "seal the envelope", "drop it in the mailbox"] },
  { task: "wash your hands", steps: ["turn on the water", "add soap", "scrub", "dry them"] },
  { task: "draw a picture", steps: ["pick a crayon", "draw the lines", "color it in", "show a friend"] },
];

/** if-then-else rules (for the "conditional" drill). `cond` is a short
 *  condition; `then`/`els` are the two branch actions. */
export const CONDITIONAL_RULES: { cond: string; then: string; els: string }[] = [
  { cond: "it is raining ☔", then: "take an umbrella", els: "wear sunglasses" },
  { cond: "the light is green 🟢", then: "go", els: "stop" },
  { cond: "it is night 🌙", then: "go to sleep", els: "go play" },
  { cond: "it is cold 🥶", then: "wear a coat", els: "wear a t-shirt" },
  { cond: "the bell rings 🔔", then: "go to class", els: "keep playing" },
  { cond: "the door is locked 🔒", then: "use the key", els: "walk in" },
  { cond: "you are hungry 🍽️", then: "eat a snack", els: "keep working" },
  { cond: "the cup is empty", then: "fill it", els: "drink it" },
];

/** A left-to-right lane of distinct landmark emoji for the "commands" drill
 *  (the robot starts at index 0 and steps along it). */
export const COMMAND_LANE = ["🏁", "🌳", "🍎", "🌸", "🎁", "⭐"];

/** Glyphs used by the "loop" drill (repeat a single symbol). */
export const LOOP_GLYPHS = ["⬆️", "⬇️", "👏", "⭐", "🔵", "🦶"];

/** Tokens used by the "boolean" (logic-gate) drill. */
export const BOOLEAN_TOKENS = ["🔑", "🪪", "🎫", "⭐"];

/** Compass directions in CLOCKWISE order — a right turn is +1, left is −1
 *  (mod 4). Used by the "trace" drill (which way are you facing?). */
export const DIRECTIONS = ["⬆️ up", "➡️ right", "⬇️ down", "⬅️ left"];
