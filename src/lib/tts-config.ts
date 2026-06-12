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

/** Safe fallback voice (ElevenLabs "Storyteller", warm female) used by the TTS
 *  route when a character's configured voice id is invalid/unavailable — so a
 *  line still speaks instead of going silent. Must be a real workspace voice. */
export const DEFAULT_TTS_VOICE = "21m00Tcm4TlvDq8ikWAM";

/** Global voice settings. Per-character overrides can come later; for now only
 *  `speed` varies (from each character's `voiceSpeed`). */
export const TTS_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true,
} as const;

/**
 * ElevenLabs `voice_settings.speed` accepts **0.7–1.2** (1.0 = normal); a value
 * outside this range makes the API return 422 and the line silently fails. This
 * is the single source of truth for the authored-speed bounds — the schema,
 * admin field, and request validation all key off it.
 */
export const SPEED_MIN = 0.7;
export const SPEED_MAX = 1.2;

/** Clamp the authored speed into ElevenLabs' supported range. */
export function clampSpeed(speed: number): number {
  return Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed));
}

/**
 * Character-level timing for one synthesized line, exactly as ElevenLabs'
 * `with-timestamps` endpoint returns it: `characters[i]` of the INPUT text
 * is spoken during [start[i], end[i]] seconds of the audio. This is what
 * drives the read-along word highlight — generated WITH the audio, never
 * derived from it.
 */
export interface SpeechAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** Cache schema version. v2 = the read-along migration: clips are generated
 *  via `with-timestamps` and an `.align.json` sits beside each `.mp3`. The
 *  bump re-keys every line, so pre-alignment clips regenerate lazily on
 *  first play (one-time credits) instead of living forever without timing. */
const TTS_CACHE_VERSION = "v2";

/**
 * Deterministic R2 object keys for one spoken line: the audio at
 * `tts/<sha256>.mp3` and its timing at `tts/<sha256>.align.json`. Hashes the
 * text + voice + model + every setting that affects the audio, so the same
 * line+voice+settings always resolves to the same cached pair. Works in the
 * browser and the Node runtime (both expose `crypto.subtle`).
 */
export async function ttsObjectKeys(
  text: string,
  voiceId: string,
  voiceSpeed: number,
): Promise<{ audio: string; align: string }> {
  const s = TTS_VOICE_SETTINGS;
  const sig = [
    TTS_CACHE_VERSION,
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
  return { audio: `tts/${hex}.mp3`, align: `tts/${hex}.align.json` };
}
