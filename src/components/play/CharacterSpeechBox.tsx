import type { SpeakerId } from "@/types/story";
import { Typewriter } from "./Typewriter";

interface Props {
  speaker: SpeakerId;
  characterName: string;
  characterColor: string;
  narration: string;
  variant?: "page" | "overlay";
  /** Fires when the typewriter finishes (or the user taps to skip). The
   *  parent uses this to gate revealing the choice buttons. */
  onTypingDone?: () => void;
  /** Render the narration instantly (no typing) — for already-revealed text
   *  re-shown after a dialogue closes. */
  instant?: boolean;
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
}: Props) {
  const isNarrator = speaker === "narrator";
  const isOverlay = variant === "overlay";

  if (isOverlay) {
    // `text-balance` history: it was removed once because line breaks
    // recomputed on every typewriter append (subpixel jitter on iOS). That
    // was under an older Typewriter structure. Today the Typewriter keeps
    // the FULL text in the inline flow from the first paint (the revealed
    // part + a transparent remainder as bare siblings in one parent), so
    // the input to the line breaker is CONSTANT across the whole animation
    // — balanced break positions can't move while typing. Kerning and
    // ligatures are also locked (OVERLAY_TEXT_STYLE), removing the other
    // historical jitter source. Balance is what fixes mid-sentence breaks
    // like "…the cellar / door, \"Dear!…\"" into evenly weighted lines.
    return (
      <p
        className="text-fluid-narration leading-snug tracking-wide text-paper whitespace-pre-line text-balance font-medium text-center"
        style={OVERLAY_TEXT_STYLE}
      >
        <Typewriter
          text={narration}
          skipOnClick
          instant={instant}
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
