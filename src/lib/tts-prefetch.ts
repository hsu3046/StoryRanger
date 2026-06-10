import { assetUrl, ASSET_BASE_URL } from "./asset-paths";
import {
  isTtsCoolingDown,
  retryAfterSecondsFrom,
  startTtsCooldown,
} from "./tts-cooldown";
import { ttsObjectKey } from "./tts-config";

/**
 * Best-effort cache warmup. While the player listens to scene N, fire
 * background requests for upcoming lines (each branch's destination narration +
 * outcome). On a hit the audio is already in R2 (and the browser HTTP cache);
 * on a miss we trigger generation so the server writes it to R2 — then the
 * real playback is an instant cache hit for everyone.
 *
 * Silent by design: errors, 5xx, no api key, network drop — all ignored.
 */
/** Keys currently being warmed / already warmed this session. The warming
 *  effect's deps re-fire on unrelated state ticks (e.g. dragging the voice
 *  volume slider) — without this memory every re-run would re-POST the same
 *  un-cached lines while the first synthesis is still running, paying
 *  ElevenLabs once per tick. Module-level on purpose: scene changes remount
 *  components, but the warmed set should survive the whole tab. */
const inFlight = new Set<string>();
const done = new Set<string>();

export async function prefetchNarration(
  text: string,
  voiceId: string,
  voiceSpeed: number,
): Promise<void> {
  let key: string | null = null;
  try {
    if (!text || !voiceId) return;
    key = await ttsObjectKey(text, voiceId, voiceSpeed);
    if (inFlight.has(key) || done.has(key)) return;
    inFlight.add(key);

    // Already cached in R2 → a GET warms the browser cache too; done.
    if (ASSET_BASE_URL) {
      try {
        const hit = await fetch(assetUrl(`/${key}`));
        if (hit.ok) {
          done.add(key);
          return;
        }
      } catch {
        /* fall through to generate */
      }
    }

    // Miss → generate (server persists to R2). Body discarded. Prefetch is
    // the first thing to give up under a rate-limit cooldown — warming the
    // cache is never worth spending the played-back lines' budget.
    if (isTtsCoolingDown()) return;
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId, voiceSpeed }),
    });
    if (res.status === 429) startTtsCooldown(retryAfterSecondsFrom(res));
    if (res.ok) done.add(key);
  } catch {
    /* prefetch is best-effort — swallow all errors */
  } finally {
    if (key) inFlight.delete(key);
  }
}
