/**
 * ElevenLabs text-to-speech (server-only). Synthesizes one line to MP3.
 * Caching/persistence is handled by the caller (R2 on-demand cache).
 */
import { TTS_MODEL, TTS_VOICE_SETTINGS, clampSpeed } from "./tts-config";

export function hasElevenLabsKey(): boolean {
  return !!process.env.ELEVENLABS_API_KEY?.trim();
}

/** Generate speech for `text` in `voiceId`. Throws on a non-2xx response. */
export async function synthesizeSpeech(
  text: string,
  voiceId: string,
  voiceSpeed: number,
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: TTS_MODEL,
        language_code: "en",
        voice_settings: { ...TTS_VOICE_SETTINGS, speed: clampSpeed(voiceSpeed) },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`elevenlabs ${res.status}: ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
