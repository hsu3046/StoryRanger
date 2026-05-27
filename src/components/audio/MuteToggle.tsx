"use client";

import { SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";

interface Props {
  muted: boolean;
  onToggle: () => void;
}

export function MuteToggle({ muted, onToggle }: Props) {
  const IconComp = muted ? SpeakerSlash : SpeakerHigh;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={muted ? "Unmute narration" : "Mute narration"}
      className="flex h-12 w-12 items-center justify-center rounded-pill bg-paper-deep/70 text-ink-soft ring-1 ring-ink-soft/10 shadow-soft backdrop-blur transition-all hover:bg-paper-deep hover:text-ink active:scale-90"
    >
      <IconComp size={22} weight="duotone" aria-hidden />
    </button>
  );
}
