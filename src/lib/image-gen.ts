/**
 * Nano Banana image generation (Gemini image models) — mirrors the lazy-client
 * / env-key style of `lib/llm.ts`. Server-only (uses GEMINI_API_KEY).
 *
 * Default model: "gemini-3.1-flash-image" (Nano Banana 2). Override with the
 * IMAGE_MODEL env to e.g. "gemini-3-pro-image" (Nano Banana Pro) for the cover
 * / hero anchor.
 *
 * Output is raw PNG bytes (post-processing → webp lives in `image-post.ts`).
 */

import { GoogleGenAI, type Part } from "@google/genai";

export type AspectRatio =
  | "1:1"
  | "2:3"
  | "3:2"
  | "3:4"
  | "4:3"
  | "4:5"
  | "5:4"
  | "9:16"
  | "16:9"
  | "21:9";

export type ImageSize = "1K" | "2K" | "4K";

/** A reference image fed to the model as conditioning (base64). */
export interface ReferenceImage {
  mimeType: string;
  data: string;
}

export interface GenerateImageOpts {
  prompt: string;
  /** Character / style references — prepended BEFORE the text part. */
  referenceImages?: ReferenceImage[];
  aspectRatio?: AspectRatio;
  size?: ImageSize;
  model?: string;
}

function envTrim(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function hasImageKey(): boolean {
  return !!envTrim("GEMINI_API_KEY") || !!envTrim("GOOGLE_API_KEY");
}

export function activeImageModel(): string {
  return envTrim("IMAGE_MODEL") ?? "gemini-3.1-flash-image";
}

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!_client) {
    const apiKey = envTrim("GEMINI_API_KEY") ?? envTrim("GOOGLE_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

/** Thrown when the model refused on safety grounds — the caller may retry once
 *  with a softened prompt rather than blindly hammering. */
export class ImageSafetyError extends Error {}

/** Generate one image. Returns PNG bytes. Throws on no-image / safety block. */
export async function generateImage(opts: GenerateImageOpts): Promise<Buffer> {
  const parts: Part[] = [
    ...(opts.referenceImages ?? []).map(
      (img): Part => ({
        inlineData: { mimeType: img.mimeType, data: img.data },
      }),
    ),
    { text: opts.prompt },
  ];

  const response = await client().models.generateContent({
    model: opts.model ?? activeImageModel(),
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: opts.aspectRatio ?? "16:9",
        imageSize: opts.size ?? "2K",
      },
    },
  });

  const cand = response.candidates?.[0];
  const finish = cand?.finishReason as string | undefined;
  const block = response.promptFeedback?.blockReason as string | undefined;
  // All policy/safety stop reasons (incl. image-specific ones) route to the
  // single softened-prompt retry in generateImageResilient rather than the
  // pointless 3× identical-prompt backoff.
  const REFUSALS = new Set([
    "SAFETY",
    "PROHIBITED_CONTENT",
    "BLOCKLIST",
    "RECITATION",
    "SPII",
    "IMAGE_SAFETY",
    "IMAGE_PROHIBITED_CONTENT",
    "IMAGE_RECITATION",
  ]);
  if (block || (finish && REFUSALS.has(finish))) {
    throw new ImageSafetyError(
      `[image-gen] blocked (finishReason=${finish}, blockReason=${block})`,
    );
  }

  const part = cand?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    throw new Error(`[image-gen] no image part (finishReason=${finish})`);
  }
  return Buffer.from(part.inlineData.data, "base64");
}

/**
 * Generate with retries: exponential backoff on transient errors, plus ONE
 * softened-prompt retry on a safety block (then give up — don't hammer).
 */
export async function generateImageResilient(
  opts: GenerateImageOpts,
  attempts = 3,
): Promise<Buffer> {
  let current = opts;
  let softened = false;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await generateImage(current);
    } catch (err) {
      lastErr = err;
      if (err instanceof ImageSafetyError) {
        if (softened) throw err;
        softened = true;
        current = {
          ...current,
          prompt: `${current.prompt} Keep it warm, gentle, and age-appropriate for young children; nothing scary, dark, or harsh.`,
        };
        continue; // immediate retry with the softened prompt
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    }
  }
  throw lastErr;
}
