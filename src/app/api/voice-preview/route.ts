import { NextResponse } from "next/server";

import { hasElevenLabsKey, fetchVoicePreviewUrl } from "@/lib/elevenlabs";

export const runtime = "nodejs";

/**
 * Resolve a voice's free, pre-made sample URL so the admin can preview how a
 * voice sounds before assigning it to a character — like the BGM dropdown's
 * play button. Uses ElevenLabs' `preview_url` (Get-voice endpoint), which
 * costs NO TTS credits. Admin-only surface; returns just the URL (the browser
 * plays it directly — the clip lives on ElevenLabs' CDN).
 */
export async function GET(req: Request) {
  // Admin-only helper. The admin UI 404s in production, but this API route
  // would still deploy — guard it so the public can't drive the ElevenLabs
  // key (mirrors the dev-only admin write actions). 404 = "doesn't exist here".
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const voiceId = new URL(req.url).searchParams.get("voiceId")?.trim();
  if (!voiceId) {
    return NextResponse.json({ error: "voiceId required" }, { status: 400 });
  }
  if (!hasElevenLabsKey()) {
    return NextResponse.json({ error: "no_api_key" }, { status: 503 });
  }

  try {
    const previewUrl = await fetchVoicePreviewUrl(voiceId);
    if (!previewUrl) {
      return NextResponse.json(
        { error: "no preview for this voice" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { previewUrl },
      // Voice metadata is stable — let the admin cache the resolved URL.
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "preview failed";
    // ElevenLabs 404 (voice not in workspace) surfaces as a 404; anything
    // else is an upstream/gateway problem.
    const status = /\b404\b/.test(msg) ? 404 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
