/**
 * ElevenLabs text-to-speech (server-only). Synthesizes one line to MP3 plus
 * its character-level timing (read-along highlight). Caching/persistence is
 * handled by the caller (R2 on-demand cache).
 */
import {
  TTS_MODEL,
  TTS_VOICE_SETTINGS,
  clampSpeed,
  type SpeechAlignment,
} from "./tts-config";

export interface SynthesisResult {
  buffer: Buffer;
  /** Character timing from the same generation call — null only if the API
   *  response omitted it (shouldn't happen, but audio must still play). */
  alignment: SpeechAlignment | null;
}

export function hasElevenLabsKey(): boolean {
  return !!process.env.ELEVENLABS_API_KEY?.trim();
}

/** Carries the HTTP status so callers can distinguish a bad voice (4xx, worth a
 *  fallback voice) from a transient failure (429/5xx, worth a retry). status 0
 *  = network/timeout (no response). */
export class ElevenLabsError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ElevenLabsError";
    this.status = status;
  }
}

/** A voice-specific failure (invalid / unavailable / out-of-workspace voice) —
 *  retrying the same voice won't help, but a fallback voice might. */
export function isVoiceError(err: unknown): boolean {
  const s = err instanceof ElevenLabsError ? err.status : 0;
  return s === 400 || s === 404 || s === 422;
}

const TTS_ATTEMPTS = 3;
const TTS_TIMEOUT_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** One synthesis call with a hard timeout (aborts a hung request).
 *  `with-timestamps` variant: same model/credits/latency as the plain
 *  endpoint, but the response is JSON carrying the mp3 (base64) PLUS the
 *  character-level timing the read-along highlight needs. */
async function rawSynthesize(
  apiKey: string,
  text: string,
  voiceId: string,
  voiceSpeed: number,
): Promise<SynthesisResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        // No language_code → eleven_multilingual_v2 auto-detects the language
        // from the text, so Korean / Japanese / English stories all speak
        // correctly (a hardcoded "en" mispronounced non-English content).
        body: JSON.stringify({
          text,
          model_id: TTS_MODEL,
          voice_settings: {
            ...TTS_VOICE_SETTINGS,
            speed: clampSpeed(voiceSpeed),
          },
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ElevenLabsError(
        res.status,
        `elevenlabs ${res.status}: ${detail.slice(0, 300)}`,
      );
    }
    const data = (await res.json()) as {
      audio_base64?: string;
      alignment?: SpeechAlignment | null;
    };
    if (!data.audio_base64) {
      throw new ElevenLabsError(0, "elevenlabs: response missing audio_base64");
    }
    return {
      buffer: Buffer.from(data.audio_base64, "base64"),
      alignment: data.alignment ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate speech for `text` in `voiceId`, retrying transient failures
 * (429 / 5xx / network / timeout) with exponential backoff. Throws an
 * ElevenLabsError on a non-2xx; voice-specific 4xx errors are NOT retried (the
 * caller can fall back to a default voice — see the /api/tts route).
 */
export async function synthesizeSpeech(
  text: string,
  voiceId: string,
  voiceSpeed: number,
): Promise<SynthesisResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  let lastErr: unknown;
  for (let attempt = 0; attempt < TTS_ATTEMPTS; attempt++) {
    try {
      return await rawSynthesize(apiKey, text, voiceId, voiceSpeed);
    } catch (err) {
      lastErr = err;
      const status = err instanceof ElevenLabsError ? err.status : 0;
      // 0 = network/abort/timeout. Retry that + 429 + 5xx; bail on other 4xx.
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt === TTS_ATTEMPTS - 1) throw err;
      await sleep(700 * 2 ** attempt + Math.floor(Math.random() * 250));
    }
  }
  throw lastErr;
}

/**
 * Fetch a voice's pre-made sample URL (`preview_url`) via the Get-voice
 * endpoint. This is a free, pre-generated clip — costs NO TTS credits, unlike
 * synthesizeSpeech. Returns null if the voice has no preview. Throws on a
 * non-2xx (e.g. 404 when the voice isn't in the workspace).
 */
export async function fetchVoicePreviewUrl(
  voiceId: string,
): Promise<string | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
    { headers: { "xi-api-key": apiKey, Accept: "application/json" } },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`elevenlabs ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { preview_url?: string | null };
  return data.preview_url ?? null;
}
