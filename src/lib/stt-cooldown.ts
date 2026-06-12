/**
 * Client-side STT cooldown — same pattern as tts-cooldown.ts, separate state:
 * the two budgets are independent server-side (route "stt" vs "tts"), so a
 * TTS 429 must not silence the mic and vice versa.
 *
 * While cooling down the MicButton hides itself; tapping the choice buttons
 * keeps working, so the child loses nothing but the voice shortcut.
 */

let cooldownUntil = 0;

export function isSttCoolingDown(): boolean {
  return Date.now() < cooldownUntil;
}

/** Arm the cooldown from a 429 response's Retry-After (seconds). */
export function startSttCooldown(retryAfterSeconds: number): void {
  const ms = Math.max(1, retryAfterSeconds) * 1000;
  cooldownUntil = Math.max(cooldownUntil, Date.now() + ms);
}
