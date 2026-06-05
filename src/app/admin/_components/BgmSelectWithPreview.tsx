"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaretDown, Pause, Play } from "@phosphor-icons/react";

import { assetUrl } from "@/lib/asset-paths";
import { inputCls } from "./form";

/**
 * BGM picker with an inline preview play button per row. Native <select>
 * can't host buttons in <option>, so this is a custom popover dropdown.
 * Tracks one Audio element at a time — starting a new preview stops the
 * previous one; popover close + unmount also stop playback.
 *
 * Shared by the Story Graph editor (scene/branch BGM) and the Backgrounds
 * editor so both expose the same preview behaviour.
 */
export function BgmSelectWithPreview({
  value,
  options,
  storyId,
  allowEmpty,
  placeholder,
  onChange,
}: {
  value: string;
  options: string[];
  storyId: string;
  /** Label for an explicit "empty" option (e.g. "(none — uses target
   *  scene's bgm)"). Omit to disallow an empty selection. */
  allowEmpty?: string;
  /** Shown on the trigger button when value is empty and allowEmpty is
   *  also unset (i.e. "no BGM tracks on disk"). */
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [direction, setDirection] = useState<"down" | "up">("down");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Decide whether the popover opens below or above the trigger based on
  // available viewport space. Inspector panels run tall; opening downward
  // from a field near the bottom would clip off-screen.
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const NEEDED = 280; // max-h-64 (256px) + a little breathing room.
    setDirection(spaceBelow < NEEDED && spaceAbove > spaceBelow ? "up" : "down");
  }, [open]);

  const stopPreview = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingKey(null);
  }, []);

  function togglePreview(key: string) {
    if (playingKey === key) {
      stopPreview();
      return;
    }
    stopPreview();
    // Resolve like playback does: the story's own folder first (a story can
    // override a common track locally), then the shared /audio/bgm pool — so a
    // track that lives only in common still previews.
    const candidates = [
      assetUrl(`/stories/${storyId}/audio/bgm/${key}.mp3`),
      assetUrl(`/audio/bgm/${key}.mp3`),
    ];
    const tryPlay = (idx: number) => {
      if (idx >= candidates.length) {
        audioRef.current = null;
        setPlayingKey(null);
        return;
      }
      const audio = new Audio(candidates[idx]);
      audio.volume = 0.4;
      audio.onended = () => setPlayingKey(null);
      // 404 / undecodable → fall through to the next candidate.
      audio.onerror = () => {
        if (audioRef.current === audio) tryPlay(idx + 1);
      };
      audioRef.current = audio;
      // Only flip the row to "playing" once playback actually starts. 404 load
      // errors are handled by onerror above; here we only catch the autoplay
      // block so a failed play() doesn't show a Pause icon with no audio.
      audio
        .play()
        .then(() => {
          if (audioRef.current === audio) setPlayingKey(key);
        })
        .catch((err: unknown) => {
          if (
            audioRef.current === audio &&
            err instanceof DOMException &&
            err.name === "NotAllowedError"
          ) {
            audioRef.current = null;
            setPlayingKey(null);
          }
        });
    };
    tryPlay(0);
  }

  // Stop preview when popover closes or component unmounts.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- stop audio + clear playing state when the popover closes
    if (!open) stopPreview();
  }, [open, stopPreview]);
  useEffect(() => () => stopPreview(), [stopPreview]);

  const isCustom = !!value && !options.includes(value);
  const displayLabel = value || allowEmpty || placeholder || "(no BGM tracks)";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex w-full items-center justify-between pr-9 text-left`}
      >
        <span className={value ? "" : "text-ink-soft/60"}>{displayLabel}</span>
      </button>
      <CaretDown
        size={14}
        weight="bold"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft"
      />
      {open && (
        <>
          {/* Backdrop — iOS Safari ignores document mousedown for non-
              interactive areas, so a transparent click-trap is the only
              reliable outside-tap-to-close pattern. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <ul
            className={`absolute left-0 right-0 z-50 max-h-64 overflow-y-auto rounded-card bg-paper py-1 shadow-overlay ring-1 ring-ink-soft/15 ${
              direction === "up" ? "bottom-full mb-1" : "top-full mt-1"
            }`}
          >
            {allowEmpty && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-paper-deep/40 ${
                    !value ? "bg-paper-deep/30 font-semibold" : ""
                  }`}
                >
                  {allowEmpty}
                </button>
              </li>
            )}
            {isCustom && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange(value);
                    setOpen(false);
                  }}
                  className="flex w-full items-center bg-paper-deep/30 px-3 py-1.5 text-left text-sm font-semibold hover:bg-paper-deep/40"
                >
                  {value}{" "}
                  <span className="ml-1 font-normal text-ink-soft">
                    (custom)
                  </span>
                </button>
              </li>
            )}
            {options.length === 0 && !allowEmpty && (
              <li className="px-3 py-1.5 text-sm text-ink-soft/60">
                {placeholder ?? "(no BGM tracks)"}
              </li>
            )}
            {options.map((opt) => {
              const isPlaying = playingKey === opt;
              return (
                <li key={opt} className="flex items-center gap-1 pr-2">
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setOpen(false);
                    }}
                    className={`flex-1 px-3 py-1.5 text-left text-sm hover:bg-paper-deep/40 ${
                      value === opt ? "bg-paper-deep/30 font-semibold" : ""
                    }`}
                  >
                    {opt}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePreview(opt);
                    }}
                    title={isPlaying ? "Stop preview" : "Preview"}
                    aria-label={isPlaying ? "Stop preview" : "Preview"}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-pill transition-colors ${
                      isPlaying
                        ? "bg-emerald text-paper"
                        : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                    }`}
                  >
                    {isPlaying ? (
                      <Pause size={10} weight="fill" />
                    ) : (
                      <Play size={10} weight="fill" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
