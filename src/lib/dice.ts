/**
 * Simple dice utilities for the v2.0c battle system.
 *
 * Supports d20 single-die rolls + general dice expressions like
 * "1d4", "2d6+1", "1d6-2" for damage calculation.
 */

export interface RollResult {
  /** The raw die roll value (1..sides). */
  roll: number;
  /** A static bonus added (e.g. stat modifier). */
  bonus: number;
  /** Sum = roll + bonus, clamped to >= 0. */
  total: number;
  /** Was this a natural 20? (Critical hit) */
  critical: boolean;
  /** Was this a natural 1? (Critical fail) */
  fumble: boolean;
}

export function rollD20(bonus = 0): RollResult {
  const roll = Math.floor(Math.random() * 20) + 1;
  return {
    roll,
    bonus,
    total: Math.max(0, roll + bonus),
    critical: roll === 20,
    fumble: roll === 1,
  };
}

export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Roll a dice expression like "1d4", "2d6+1", "1d6-2".
 * Returns 0 (clamped) on parse failure or negative result.
 */
export function rollDice(expression: string): number {
  const m = expression.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!m) return 0;
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3], 10) : 0;
  let total = mod;
  for (let i = 0; i < count; i++) total += rollDie(sides);
  return Math.max(0, total);
}

/**
 * Did the d20 attack roll meet/exceed the target's armor class?
 * Natural 20 always hits, natural 1 always misses.
 */
export function attackHits(roll: RollResult, targetAC: number): boolean {
  if (roll.critical) return true;
  if (roll.fumble) return false;
  return roll.total >= targetAC;
}
