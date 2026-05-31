"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowCounterClockwise,
  House,
  type Icon,
  Microphone,
  MusicNotes,
  Waveform,
  X,
} from "@phosphor-icons/react";

interface Props {
  open: boolean;
  onClose: () => void;
  onLeave: () => void;
  storyTitle: string;
  heroName: string;
  /** Channel volumes, 0–1. */
  voiceVolume: number;
  bgmVolume: number;
  sfxVolume: number;
  onVoiceVolume: (v: number) => void;
  onBgmVolume: (v: number) => void;
  onSfxVolume: (v: number) => void;
  /** Restore all three channels to their defaults. */
  onResetVolumes: () => void;
  /** Play a sample effect so the Effects slider can be auditioned. */
  onPreviewSfx: () => void;
}

export function SettingsModal({
  open,
  onClose,
  onLeave,
  storyTitle,
  heroName,
  voiceVolume,
  bgmVolume,
  sfxVolume,
  onVoiceVolume,
  onBgmVolume,
  onSfxVolume,
  onResetVolumes,
  onPreviewSfx,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            key="settings-backdrop"
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[70] cursor-pointer bg-ink/25 backdrop-blur-sm"
          />
          <motion.div
            key="settings-card"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            role="dialog"
            aria-modal="true"
            className="pointer-events-auto fixed left-1/2 top-1/2 z-[80] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-card-lg bg-paper/85 p-6 shadow-overlay ring-1 ring-ink-soft/10 backdrop-blur"
          >
            <header className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <p className="font-handwritten text-2xl text-accent-deep">
                  Settings
                </p>
                <p className="text-sm text-ink-soft">
                  Playing as{" "}
                  <span className="font-semibold text-ink">{heroName}</span> in{" "}
                  <span className="italic">{storyTitle}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-pill bg-paper-deep/60 text-ink-soft ring-1 ring-ink-soft/10 transition-colors hover:bg-paper-deep hover:text-ink active:scale-90"
              >
                <X size={16} weight="bold" />
              </button>
            </header>

            {/* Volume sliders — one per audio channel. */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft/70">
                  Sound
                </span>
                <button
                  type="button"
                  onClick={onResetVolumes}
                  className="inline-flex items-center gap-1 rounded-pill px-2 py-1 text-xs font-medium text-ink-soft transition-colors hover:bg-paper-deep/60 hover:text-ink active:scale-95"
                >
                  <ArrowCounterClockwise size={14} weight="bold" />
                  Reset
                </button>
              </div>
              <VolumeRow
                icon={Microphone}
                label="Voice"
                value={voiceVolume}
                onChange={onVoiceVolume}
              />
              <VolumeRow
                icon={MusicNotes}
                label="Music"
                value={bgmVolume}
                onChange={onBgmVolume}
              />
              <VolumeRow
                icon={Waveform}
                label="Effects"
                value={sfxVolume}
                onChange={onSfxVolume}
                onCommit={onPreviewSfx}
              />
            </div>

            <div className="flex flex-col gap-2">
              {/* Leave story */}
              <button
                type="button"
                onClick={onLeave}
                className="inline-flex min-h-14 items-center justify-center gap-2.5 rounded-button bg-paper-deep/60 px-5 text-base font-medium text-ink ring-1 ring-ink-soft/10 transition-all hover:bg-paper-deep hover:ring-accent/40 active:scale-[0.98]"
              >
                <House size={20} weight="duotone" className="text-accent" />
                <span>Leave the story</span>
              </button>
              <p className="px-1 text-xs text-ink-soft/70">
                Your progress is saved — you can come back any time.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function VolumeRow({
  icon: IconComp,
  label,
  value,
  onChange,
  onCommit,
}: {
  icon: Icon;
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** Fired when a drag/keypress settles — used to audition effects. */
  onCommit?: () => void;
}) {
  const off = value <= 0;
  return (
    <div className="flex items-center gap-3 rounded-button bg-paper-deep/60 px-4 py-3 ring-1 ring-ink-soft/10">
      <IconComp
        size={20}
        weight="duotone"
        className={off ? "text-ink-soft/45" : "text-accent"}
      />
      <span className="w-16 shrink-0 text-sm font-medium text-ink">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        aria-label={`${label} volume`}
        className="h-2 flex-1 cursor-pointer accent-accent-deep"
      />
    </div>
  );
}
