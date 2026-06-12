import { NextResponse } from "next/server";
import { z } from "zod";

import { getOpenAI, hasOpenAIKey, STT_MODEL } from "@/lib/openai-client";
import {
  MAX_AUDIO_BYTES,
  MAX_LABEL_CHARS,
  MAX_LABELS,
} from "@/lib/stt-config";
import {
  consumeRateLimit,
  rateLimited429,
  requirePaidSession,
} from "@/lib/supabase/guard";

export const runtime = "nodejs";

/**
 * Per-user STT budget, in REQUESTS. One push-to-talk clip is ≤6 s (client
 * hard-cut + the byte gate below), so counting requests is equivalent to
 * counting audio time: 300/day = ≤30 min ≈ $0.09 worst-case per account.
 */
const STT_REQS_PER_MINUTE = 20;
const STT_REQS_PER_DAY = 300;

/** MediaRecorder containers we accept (Chrome/Android → webm/opus, iOS
 *  Safari → mp4/AAC), plus the formats a non-MediaRecorder fallback could
 *  plausibly send. The codec suffix ("audio/webm;codecs=opus") is ignored. */
const ALLOWED_MIME_PREFIXES = [
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/mpeg",
];

const LabelsSchema = z
  .array(z.string().min(1).max(MAX_LABEL_CHARS))
  .max(MAX_LABELS);

/** OpenAI sniffs the container from the FILENAME extension, not the mime —
 *  give the upload one that matches what the recorder produced. */
function filenameFor(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) {
    return "speech.mp4";
  }
  if (mime.includes("wav")) return "speech.wav";
  if (mime.includes("mpeg")) return "speech.mp3";
  return "speech.webm";
}

/**
 * Transcribe one short push-to-talk clip so the client can fuzzy-match it
 * against the visible choice labels (the matching itself is client-side —
 * this route stays a dumb, reusable transcriber).
 *
 * PRIVACY: the child's audio lives only in this request's memory. It is never
 * written to R2/disk, never logged, and never cached — the only persistent
 * trace of a call is the rate-limit counter. The transcript content is not
 * logged either. (COPPA's audio exemption and KR child-data guidance both
 * hinge on immediate disposal.)
 */
export async function POST(req: Request) {
  // Paid STT — gate behind login (the proxy can't, it excludes /api).
  const { gate, userId } = await requirePaidSession();
  if (gate) return gate;

  let audio: File;
  let labels: string[] = [];
  try {
    const form = await req.formData();
    const audioEntry = form.get("audio");
    if (!(audioEntry instanceof File) || audioEntry.size === 0) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    audio = audioEntry;
    const rawLabels = form.get("labels");
    if (typeof rawLabels === "string" && rawLabels) {
      labels = LabelsSchema.parse(JSON.parse(rawLabels));
    }
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "audio_too_large" }, { status: 413 });
  }
  const mime = (audio.type || "").toLowerCase();
  if (!ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
    return NextResponse.json({ error: "unsupported_format" }, { status: 400 });
  }

  const limit = await consumeRateLimit({
    userId,
    route: "stt",
    weight: 1,
    minuteMax: STT_REQS_PER_MINUTE,
    dayMax: STT_REQS_PER_DAY,
  });
  if (limit.limited) return rateLimited429(limit.retryAfterSeconds);

  if (!hasOpenAIKey()) {
    console.warn("[stt] OPENAI_API_KEY not set — returning 503");
    return NextResponse.json({ error: "no_api_key" }, { status: 503 });
  }

  try {
    // Re-wrap so the extension matches the container (see filenameFor) —
    // client filenames aren't trusted. Biasing the model with the visible
    // labels lifts first-pass accuracy on exactly the words we must match.
    const file = new File([audio], filenameFor(mime), {
      type: audio.type || "audio/webm",
    });
    const result = await getOpenAI().audio.transcriptions.create({
      file,
      model: STT_MODEL,
      language: "en",
      temperature: 0,
      prompt: labels.length
        ? `The child is choosing one of these options: ${labels.join("; ")}`
        : undefined,
    });
    return NextResponse.json(
      { transcript: result.text ?? "" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    // Status/shape only — never the audio or any transcribed content.
    console.error(
      "[stt] transcription failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json({ error: "stt_failed" }, { status: 502 });
  }
}
