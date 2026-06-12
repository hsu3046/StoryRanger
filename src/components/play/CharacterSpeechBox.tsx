import type { Howl } from "howler";

import type { SpeakerId } from "@/types/story";
import type { SpeechAlignment } from "@/lib/tts-config";
import { ReadAlongText } from "./ReadAlongText";
import { Typewriter } from "./Typewriter";

interface Props {
  speaker: SpeakerId;
  characterName: string;
  characterColor: string;
  narration: string;
  variant?: "page" | "overlay";
  /** Fires when the text is fully on screen (read-along shows it at mount,
   *  so this is immediate). The parent gates the choice buttons on it. */
  onTypingDone?: () => void;
  /** Render the narration instantly (no typing) — page variant only. */
  instant?: boolean;
  /** Read-along playback (overlay variant): the narration's Howl + its
   *  character timing, from SpeechAudio's onPlayback. */
  playbackSound?: Howl | null;
  alignment?: SpeechAlignment | null;
  /** Narration audio is expected (voice channel on + TTS mounted). */
  expectAudio?: boolean;
  /** Narration audio settled (finished or failed) — see ReadAlongText. */
  audioDone?: boolean;
}

/**
 * Subtle dark stroke + drop shadow so light text reads clearly on top of
 * the cinematic scene image without any background card. Kept lean
 * (single shadow + thin stroke) — multiple shadow layers + a thick stroke
 * tank perf on older iPads and cause the typewriter glyphs to jitter as
 * each new character is painted.
 */
const OVERLAY_TEXT_STYLE: React.CSSProperties = {
  textShadow: "0 3px 10px rgba(20, 12, 4, 0.9)",
  WebkitTextStroke: "1.5px rgba(20, 12, 4, 0.7)",
  paintOrder: "stroke fill",
  // Lock kerning + ligature decisions to a single layout pass. Without
  // these, the browser re-runs ligature/kerning analysis on every
  // character append from the typewriter, nudging earlier glyphs by a
  // subpixel and showing up as horizontal jitter — especially on iOS
  // Safari with our serif font's pair kerning.
  fontKerning: "none",
  fontVariantLigatures: "none",
  textRendering: "optimizeSpeed",
};

export function CharacterSpeechBox({
  speaker,
  characterName,
  characterColor,
  narration,
  variant = "page",
  onTypingDone,
  instant,
  playbackSound = null,
  alignment = null,
  expectAudio = false,
  audioDone,
}: Props) {
  const isNarrator = speaker === "narrator";
  const isOverlay = variant === "overlay";

  if (isOverlay) {
    // Read-along (replaced the typewriter, whose pace never matched the TTS):
    // the full text mounts dimmed and words brighten as the narrator speaks
    // them. `text-balance` is safe here for the same reason it was with the
    // typewriter's transparent remainder — the full text sits in the inline
    // flow from the first paint (only span opacity animates), so the line
    // breaker's input never changes. Kerning/ligatures stay locked
    // (OVERLAY_TEXT_STYLE) against the historical iOS jitter.
    return (
      <p
        className="text-fluid-narration leading-snug tracking-wide text-paper whitespace-pre-line text-balance font-medium text-center"
        style={OVERLAY_TEXT_STYLE}
      >
        <ReadAlongText
          text={narration}
          sound={playbackSound}
          alignment={alignment}
          expectAudio={expectAudio}
          audioDone={audioDone}
          onDone={onTypingDone}
        />
      </p>
    );
  }

  // page variant — used in flat surfaces (currently unused, kept for future)
  return (
    <div className="flex flex-col gap-2.5">
      {!isNarrator && (
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: characterColor }}
            aria-hidden
          />
          <span
            className="font-handwritten text-3xl leading-none"
            style={{ color: characterColor }}
          >
            {characterName}
          </span>
        </div>
      )}
      <p className="text-xl sm:text-2xl leading-relaxed text-ink whitespace-pre-line">
        <Typewriter
          text={narration}
          skipOnClick
          instant={instant}
          onDone={onTypingDone}
        />
      </p>
    </div>
  );
}
