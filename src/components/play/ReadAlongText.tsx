"use client";

import type { Howl } from "howler";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SpeechAlignment } from "@/lib/tts-config";

/**
 * Read-along text — the typewriter's replacement (the typing pace never
 * matched the TTS pace; user decision 2026-06).
 *
 * The FULL text renders immediately (dimmed), and each word brightens the
 * moment the audio speaks it. Sync is exact, not estimated: ElevenLabs
 * returns character-level timing WITH the audio, and every animation frame
 * compares it against the actual playback clock (`howl.seek()`) — zero
 * drift, replay/seek-back included (the bright count is recomputed from the
 * clock, not accumulated).
 *
 * Fallback ladder (all "fail bright" — text must never stay unreadable):
 *  - no audio expected (muted voice channel)        → everything bright now
 *  - audio settled without playing (budget/failure) → everything bright
 *  - audio plays but timing is missing/mismatched   → everything bright
 *    while the clip reads at its own pace (= the plain fade-in variant)
 *
 * Layout note: the full text is in the inline flow from the first paint
 * (only span opacity animates), so `text-balance` line breaks can never
 * shift mid-line — same invariant the old Typewriter kept with its
 * transparent remainder.
 */

interface Props {
  text: string;
  /** Howl carrying THIS text's audio (null until fetched/decoded). */
  sound: Howl | null;
  /** Character timing for THIS text (null → no word sync, fail bright). */
  alignment: SpeechAlignment | null;
  /** Audio is expected for this line (voice channel on + a TTS mount
   *  exists). While true and the sound hasn't arrived, words wait dim. */
  expectAudio: boolean;
  /** The line's audio settled — finished, or will never play. Brightens
   *  whatever is left (and everything, when playback never started). */
  audioDone?: boolean;
  /** Fires once per text, immediately — the full text is on screen at
   *  mount. Kept so callers' "typing done" gates keep working unchanged. */
  onDone?: () => void;
}

/** Words brighten a hair before their audio start — reading slightly ahead
 *  of the voice feels natural; trailing it feels laggy. */
const HIGHLIGHT_LEAD_S = 0.08;

const DIM_OPACITY = 0.4;

interface WordSegment {
  /** Exact slice of `text` (word or whitespace run). */
  chunk: string;
  /** Audio second this word starts at; null for whitespace / no timing. */
  startTime: number | null;
}

/** Split into word/whitespace chunks and attach each word's start time by
 *  walking the alignment's character cursor. Returns null when the timing
 *  doesn't actually describe this text (defensive — ElevenLabs echoes the
 *  input verbatim, but a mismatch must fall back, not mis-highlight). */
function buildSegments(
  text: string,
  alignment: SpeechAlignment | null,
): WordSegment[] | null {
  if (!alignment) return null;
  if (
    alignment.characters.length !== alignment.character_start_times_seconds.length ||
    alignment.characters.join("") !== text
  ) {
    return null;
  }
  const segments: WordSegment[] = [];
  let cursor = 0;
  for (const chunk of text.split(/(\s+)/)) {
    if (!chunk) continue;
    const isWord = !/^\s+$/.test(chunk);
    segments.push({
      chunk,
      startTime: isWord
        ? alignment.character_start_times_seconds[cursor]
        : null,
    });
    cursor += chunk.length;
  }
  return segments;
}

export function ReadAlongText({
  text,
  sound,
  alignment,
  expectAudio,
  audioDone,
  onDone,
}: Props) {
  const segments = useMemo(
    () => buildSegments(text, alignment),
    [text, alignment],
  );
  const wordStarts = useMemo(
    () =>
      segments
        ?.filter((s) => s.startTime !== null)
        .map((s) => s.startTime as number) ?? null,
    [segments],
  );

  // How many WORDS are bright. Infinity = everything (the fallbacks).
  const [brightCount, setBrightCount] = useState(0);

  // "Typing done" fires immediately — the whole text is on screen.
  const doneForRef = useRef<string | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => {
    if (doneForRef.current === text) return;
    doneForRef.current = text;
    onDoneRef.current?.();
  }, [text]);

  // Reset highlight state per line.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- per-text reset of the highlight cursor
    setBrightCount(0);
  }, [text, sound]);

  // The sync loop. The audio clock is trusted ONLY while the clip is
  // actually playing — when a Howler sound ends (or is stopped) it REWINDS
  // seek() to 0, and reading that would collapse the highlight back to the
  // first word (the "only 'The' stays white" bug). Outside playback:
  //  - line settled (audioDone) → park on ALL bright;
  //  - otherwise (clip still loading / about to start) → hold as-is, dim.
  // A replay flips playing() back on, the clock restarts near 0, and the
  // recomputed count re-runs the wave from the top.
  const audioDoneRef = useRef(audioDone);
  useEffect(() => {
    audioDoneRef.current = audioDone;
  });
  useEffect(() => {
    if (!expectAudio || !sound || !wordStarts) return;
    let raf: number | null = null;
    const tick = () => {
      if (sound.playing()) {
        const pos = sound.seek();
        const t = (typeof pos === "number" ? pos : 0) + HIGHLIGHT_LEAD_S;
        let count = 0;
        while (count < wordStarts.length && wordStarts[count] <= t) count++;
        setBrightCount((prev) => (prev === count ? prev : count));
      } else if (audioDoneRef.current) {
        const all = wordStarts.length;
        setBrightCount((prev) => (prev === all ? prev : all));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [expectAudio, sound, wordStarts]);

  // Fallback ladder — any state where word-sync can't (or won't) happen
  // shows the full text bright. (The "finished playing" case is handled by
  // the loop above parking the count on ALL.)
  const allBright =
    !expectAudio || // muted: nothing to wait for
    (audioDone && !sound) || // settled without ever playing (budget/failure)
    (sound !== null && !wordStarts); // audio plays but no usable timing

  // No timing? Still render word/whitespace chunks (uniform markup) — the
  // `allBright` ladder decides their state, never the per-word counter.
  const displaySegments = useMemo<WordSegment[]>(
    () =>
      segments ??
      text
        .split(/(\s+)/)
        .filter(Boolean)
        .map((chunk) => ({ chunk, startTime: null })),
    [segments, text],
  );

  // Waiting for audio that should arrive → words stay dim (the "page is
  // set, the reader is inhaling" beat). Everything else renders by count.
  let wordIdx = 0;
  return (
    <span>
      {displaySegments.map((seg, i) => {
        if (/^\s+$/.test(seg.chunk)) {
          return seg.chunk; // whitespace — no span, no styling
        }
        const idx = wordIdx++;
        const bright = allBright || idx < brightCount;
        return (
          <span
            key={i}
            className="transition-opacity duration-150"
            style={{ opacity: bright ? 1 : DIM_OPACITY }}
          >
            {seg.chunk}
          </span>
        );
      })}
    </span>
  );
}
