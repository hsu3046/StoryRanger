/**
 * OpenAI client — used ONLY for TTS now. LLM calls go through
 * `src/lib/llm.ts` which routes between OpenAI / Gemini / Anthropic
 * based on `LLM_PROVIDER`.
 */

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

// `||` (not `??`) so that an empty string in .env.local (e.g.
// `OPENAI_TTS_MODEL=` with nothing after the `=`) falls back to the
// default. `??` only triggers on null/undefined and would let an empty
// string through, breaking the OpenAI call with `model: ""`.
export const TTS_MODEL = process.env.OPENAI_TTS_MODEL?.trim() || "tts-1";
