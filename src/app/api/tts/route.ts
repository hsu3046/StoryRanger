import { NextResponse } from "next/server";
import { z } from "zod";

import { getOpenAI, hasOpenAIKey, TTS_MODEL } from "@/lib/openai-client";

export const runtime = "nodejs";

const RequestSchema = z.object({
  text: z.string().min(1).max(2000),
  voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]),
  voiceSpeed: z.number().min(0.25).max(4.0).default(1.0),
});

export async function POST(req: Request) {
  let body;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!hasOpenAIKey()) {
    console.warn("[tts] OPENAI_API_KEY not set — returning 503");
    return NextResponse.json({ error: "no_api_key" }, { status: 503 });
  }

  console.log("[tts] request", {
    model: TTS_MODEL,
    voice: body.voice,
    speed: body.voiceSpeed,
    textLen: body.text.length,
  });

  try {
    const client = getOpenAI();
    const audio = await client.audio.speech.create({
      model: TTS_MODEL,
      voice: body.voice,
      input: body.text,
      speed: body.voiceSpeed,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await audio.arrayBuffer());
    console.log("[tts] ✓", { bytes: buffer.length });
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[tts] OpenAI error", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "tts_failed", detail: msg },
      { status: 502 },
    );
  }
}
