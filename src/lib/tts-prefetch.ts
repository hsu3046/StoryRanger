import { buildCacheKey, getCachedAudio, setCachedAudio } from "./tts-cache";

/**
 * Best-effort cache warmup. While the player listens to scene N, fire
 * background fetches for the narrations of every branch's destination
 * (and outcome line). On branch click the audio is already in IndexedDB
 * → playback starts immediately, no OpenAI roundtrip.
 *
 * Silent by design: errors, 5xx, no api key, network drop — all ignored.
 * The next user click will fall back to the normal on-demand fetch path.
 */
export async function prefetchNarration(
  text: string,
  voice: string,
  voiceSpeed: number,
): Promise<void> {
  try {
    if (!text || !voice) return;
    const key = await buildCacheKey(text, voice, voiceSpeed);
    if (await getCachedAudio(key)) return;
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, voiceSpeed }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    await setCachedAudio(key, blob);
  } catch {
    /* prefetch is best-effort — swallow all errors */
  }
}
