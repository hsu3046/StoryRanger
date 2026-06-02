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
