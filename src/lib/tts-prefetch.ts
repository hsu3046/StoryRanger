import { assetUrl, ASSET_BASE_URL } from "./asset-paths";
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
export async function prefetchNarration(
  text: string,
  voiceId: string,
  voiceSpeed: number,
): Promise<void> {
  try {
    if (!text || !voiceId) return;
    const key = await ttsObjectKey(text, voiceId, voiceSpeed);

    // Already cached in R2 → a GET warms the browser cache too; done.
    if (ASSET_BASE_URL) {
      try {
        const hit = await fetch(assetUrl(`/${key}`));
        if (hit.ok) return;
      } catch {
        /* fall through to generate */
      }
    }

    // Miss → generate (server persists to R2). Body discarded.
    await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId, voiceSpeed }),
    });
  } catch {
    /* prefetch is best-effort — swallow all errors */
  }
}
