/**
 * Shared TTS (ElevenLabs) config + cache-key derivation.
 *
 * Model + voice settings are CONSTANTS (not env) so the client and the server
 * derive the EXACT same cache key — the client checks R2 at that key, the
 * server writes there on a miss. Changing any value below busts the cache (a
 * different key), which is what we want after a quality tweak.
 */

/** Workhorse model: high-quality, emotionally aware, GA. (Pre-generated +
 *  cached, so latency doesn't matter; quality does.) */
export const TTS_MODEL = "eleven_multilingual_v2";

/** Global voice settings. Per-character overrides can come later; for now only
 *  `speed` varies (from each character's `voiceSpeed`). */
export const TTS_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true,
} as const;

/** ElevenLabs allows 0.25–4.0; clamp the authored speed into range. */
export function clampSpeed(speed: number): number {
  return Math.max(0.25, Math.min(4, speed));
}

/**
 * Deterministic R2 object key for one spoken line: `tts/<sha256>.mp3`. Hashes
 * the text + voice + model + every setting that affects the audio, so the same
 * line+voice+settings always resolves to the same cached object. Works in the
 * browser and the Node runtime (both expose `crypto.subtle`).
 */
export async function ttsObjectKey(
  text: string,
  voiceId: string,
  voiceSpeed: number,
): Promise<string> {
  const s = TTS_VOICE_SETTINGS;
  const sig = [
    text,
    voiceId,
    TTS_MODEL,
    s.stability,
    s.similarity_boost,
    s.style,
    s.use_speaker_boost,
    `spd=${clampSpeed(voiceSpeed)}`,
  ].join("|");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sig),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `tts/${hex}.mp3`;
}
