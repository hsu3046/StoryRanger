"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaretDown, CircleNotch, Pause, Play } from "@phosphor-icons/react";

import type { VoiceEntryT } from "@/data/schemas";
import { inputCls } from "./form";

/**
 * Voice picker with an inline preview button per row. The stored value is an
 * ElevenLabs voice id; the dropdown shows the friendly label from the curated
 * catalog (src/data/global/voices.json — edit that file to add/rename voices).
 *
 * Preview plays the voice's `preview_url` (a free, pre-made sample — NO TTS
 * credits) resolved via /api/voice-preview, then cached per id. Mirrors
 * BgmSelectWithPreview: one Audio at a time; popover close + unmount stop it.
 */
export function VoiceSelectWithPreview({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: VoiceEntryT[];
  /** Shown on the trigger when nothing is selected yet. */
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"down" | "up">("down");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Resolved preview URLs cached per voice id — avoids re-hitting the API.
  const urlCacheRef = useRef<Map<string, string>>(new Map());
  // The voice id the user last intended to hear; a newer click (or close)
  // supersedes any in-flight fetch so a slow response can't play late.
  const reqRef = useRef<string | null>(null);

  // Open above the trigger when there isn't room below (inspector runs tall).
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const NEEDED = 280; // max-h-64 (256px) + breathing room.
    setDirection(spaceBelow < NEEDED && spaceAbove > spaceBelow ? "up" : "down");
  }, [open]);

  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  }, []);

  // Full stop: also cancels any pending fetch intent + clears the spinner.
  const stopPreview = useCallback(() => {
    reqRef.current = null;
    stopAudio();
    setLoadingId(null);
  }, [stopAudio]);

  const playUrl = useCallback(
    (id: string, url: string) => {
      stopAudio();
      const audio = new Audio(url);
      audio.volume = 0.7;
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      // Flip to "playing" only once playback actually starts; a newer preview
      // may have superseded this one before the promise resolves.
      audio
        .play()
        .then(() => {
          if (audioRef.current === audio) setPlayingId(id);
        })
        .catch(() => {
          if (audioRef.current === audio) {
            audioRef.current = null;
            setPlayingId(null);
          }
        });
    },
    [stopAudio],
  );

  const togglePreview = useCallback(
    async (id: string) => {
      if (playingId === id) {
        stopPreview();
        return;
      }
      reqRef.current = id; // new intent supersedes any in-flight fetch
      stopAudio();

      const cached = urlCacheRef.current.get(id);
      if (cached) {
        if (reqRef.current === id) playUrl(id, cached);
        return;
      }

      setLoadingId(id);
      try {
        const res = await fetch(
          `/api/voice-preview?voiceId=${encodeURIComponent(id)}`,
        );
        const data = (await res.json().catch(() => ({}))) as {
          previewUrl?: string;
          error?: string;
        };
        if (!res.ok || !data.previewUrl) {
          throw new Error(data.error || `preview failed (${res.status})`);
        }
        urlCacheRef.current.set(id, data.previewUrl);
        if (reqRef.current === id) playUrl(id, data.previewUrl);
      } catch {
        // Silent — the row just won't play (no key / no sample / not in
        // workspace). The label still selects fine.
      } finally {
        setLoadingId((cur) => (cur === id ? null : cur));
      }
    },
    [playingId, stopPreview, stopAudio, playUrl],
  );

  // Stop preview when popover closes or component unmounts.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- stop audio + clear playing state when the popover closes
    if (!open) stopPreview();
  }, [open, stopPreview]);
  useEffect(() => () => stopPreview(), [stopPreview]);

  const selected = options.find((o) => o.id === value);
  const isCustom = !!value && !selected;
  // "" is the intentional "no voice" sentinel — the character never speaks via
  // TTS (e.g. a dog). New characters seed a real DEFAULT_VOICE_ID, so an empty
  // value here always means the author explicitly chose silence, never "unset".
  const isNoVoice = value === "";
  const displayLabel = selected
    ? selected.name
    : isNoVoice
      ? "(no voice)"
      : value || placeholder || "(choose a voice)";

  /** Render one selectable row with a preview button. A plain helper (not a
   *  component) so it shares the closure's state without remounting. The
   *  optional tags render small + muted beside the name (e.g. "#warm #young")
   *  as a quick visual cue; full search/filter is tracked in issue #14. */
  const renderRow = (id: string, label: string, tags: string[] = []) => {
    const isPlaying = playingId === id;
    const isLoading = loadingId === id;
    return (
      <li key={id} className="flex items-center gap-1 pr-2">
        <button
          type="button"
          onClick={() => {
            onChange(id);
            setOpen(false);
          }}
          className={`flex min-w-0 flex-1 items-baseline gap-2 px-3 py-1.5 text-left text-sm hover:bg-paper-deep/40 ${
            value === id ? "bg-paper-deep/30 font-semibold" : ""
          }`}
          title={
            tags.length ? `${label} [${tags.join(", ")}] — ${id}` : `${label} — ${id}`
          }
        >
          <span className="min-w-0 truncate">{label}</span>
          {tags.length > 0 && (
            <span className="shrink-0 text-xs font-normal text-ink-soft/55">
              {tags.map((t) => `#${t}`).join(" ")}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void togglePreview(id);
          }}
          disabled={isLoading}
          title={isPlaying ? "Stop preview" : "Preview voice"}
          aria-label={isPlaying ? "Stop preview" : "Preview voice"}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-pill transition-colors ${
            isPlaying
              ? "bg-emerald text-paper"
              : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
          }`}
        >
          {isLoading ? (
            <CircleNotch size={10} weight="bold" className="animate-spin" />
          ) : isPlaying ? (
            <Pause size={10} weight="fill" />
          ) : (
            <Play size={10} weight="fill" />
          )}
        </button>
      </li>
    );
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex w-full items-center justify-between pr-9 text-left`}
      >
        <span
          className={`truncate ${value || isNoVoice ? "" : "text-ink-soft/60"}`}
        >
          {displayLabel}
        </span>
      </button>
      <CaretDown
        size={14}
        weight="bold"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft"
      />
      {open && (
        <>
          {/* Transparent click-trap — the only reliable outside-tap-to-close
              pattern on iOS Safari (document mousedown is ignored there). */}
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
            {/* "No voice" sentinel — selecting it stores "" so every TTS
                trigger short-circuits (the character never speaks aloud; its
                dialogue/narration text still shows). No preview button: there
                is no voice id to sample. */}
            <li className="flex items-center gap-1 pr-2">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className={`min-w-0 flex-1 px-3 py-1.5 text-left text-sm text-ink-soft hover:bg-paper-deep/40 ${
                  isNoVoice ? "bg-paper-deep/30 font-semibold" : ""
                }`}
                title="No voice — this character never speaks aloud (dialogue text still shows)"
              >
                🔇 (no voice)
              </button>
              {/* spacer keeps the label column aligned with rows that have a
                  preview button (h-6 w-6). */}
              <span className="h-6 w-6 shrink-0" aria-hidden />
            </li>
            {isCustom && renderRow(value, `${value} (custom)`)}
            {options.length === 0 && (
              <li className="px-3 py-1.5 text-sm text-ink-soft/60">
                (no voices in voices.json)
              </li>
            )}
            {options.map((opt) => renderRow(opt.id, opt.name, opt.tags))}
          </ul>
        </>
      )}
    </div>
  );
}
