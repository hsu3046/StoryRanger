import OpenAI from "openai";

let cached: OpenAI | null = null;

export function hasOpenAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

export function getOpenAI(): OpenAI {
  if (!cached) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    cached = new OpenAI({ apiKey });
  }
  return cached;
}

export const NARRATION_MODEL =
  process.env.OPENAI_NARRATION_MODEL ?? "gpt-5-mini";

export const TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? "tts-1";
