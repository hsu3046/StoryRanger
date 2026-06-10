/**
 * Client-side TTS cooldown — shared by SpeechAudio (playback) and
 * tts-prefetch (warming).
 *
 * When /api/tts answers 429 (per-user character budget hit), we stop sending
 * NEW synthesis requests for the server-provided Retry-After window instead of
 * hammering into more 429s. Nothing user-facing happens: text gameplay
 * continues, and R2-cached lines still play (the cache path never touches the
 * API, so it is exempt from the cooldown on purpose).
 *
 * Module-level state is fine here: it only needs to live as long as the tab,
 * and a lost cooldown after reload merely costs one extra 429 round trip.
 */

let cooldownUntil = 0;

export function isTtsCoolingDown(): boolean {
  return Date.now() < cooldownUntil;
}

/** Arm the cooldown from a 429 response's Retry-After (seconds). */
export function startTtsCooldown(retryAfterSeconds: number): void {
  const ms = Math.max(1, retryAfterSeconds) * 1000;
  cooldownUntil = Math.max(cooldownUntil, Date.now() + ms);
}

/** Read a 429's Retry-After header (falls back to 60s when absent/garbled). */
export function retryAfterSecondsFrom(res: Response): number {
  const parsed = Number(res.headers.get("Retry-After"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}
