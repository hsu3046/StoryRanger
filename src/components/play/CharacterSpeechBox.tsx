import type { SpeakerId } from "@/types/story";

interface Props {
  speaker: SpeakerId;
  characterName: string;
  characterColor: string;
  narration: string;
  variant?: "page" | "overlay";
}

/**
 * Subtle dark stroke + drop shadow so light text reads clearly on top of
 * the cinematic scene image without any background card.
 */
const OVERLAY_TEXT_STYLE: React.CSSProperties = {
  textShadow:
    "0 5px 18px rgba(20, 12, 4, 0.85), 0 3px 6px rgba(20, 12, 4, 0.95)",
  WebkitTextStroke: "2.5px rgba(20, 12, 4, 0.7)",
  paintOrder: "stroke fill",
};

export function CharacterSpeechBox({
  speaker,
  characterName,
  characterColor,
  narration,
  variant = "page",
}: Props) {
  const isNarrator = speaker === "narrator";
  const isOverlay = variant === "overlay";

  if (isOverlay) {
    return (
      <p
        className="text-2xl sm:text-3xl leading-snug tracking-wide text-paper whitespace-pre-line font-medium text-balance text-center"
        style={OVERLAY_TEXT_STYLE}
      >
        {narration}
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
        {narration}
      </p>
    </div>
  );
}
