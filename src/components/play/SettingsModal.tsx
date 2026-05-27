"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  House,
  SpeakerHigh,
  SpeakerSlash,
  X,
} from "@phosphor-icons/react";

interface Props {
  open: boolean;
  onClose: () => void;
  onLeave: () => void;
  storyTitle: string;
  heroName: string;
  muted: boolean;
  onToggleMute: () => void;
}

export function SettingsModal({
  open,
  onClose,
  onLeave,
  storyTitle,
  heroName,
  muted,
  onToggleMute,
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
            className="pointer-events-auto fixed left-1/2 top-1/2 z-[80] flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-card-lg bg-paper/85 p-6 shadow-overlay ring-1 ring-ink-soft/10 backdrop-blur"
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

            <div className="flex flex-col gap-2">
              {/* Sound toggle */}
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? "Turn sound on" : "Turn sound off"}
                className="inline-flex min-h-14 items-center justify-between gap-2.5 rounded-button bg-paper-deep/60 px-5 text-base font-medium text-ink ring-1 ring-ink-soft/10 transition-all hover:bg-paper-deep hover:ring-accent/40 active:scale-[0.98]"
              >
                <span className="flex items-center gap-2.5">
                  {muted ? (
                    <SpeakerSlash size={20} weight="duotone" className="text-ink-soft" />
                  ) : (
                    <SpeakerHigh size={20} weight="duotone" className="text-accent" />
                  )}
                  <span>Sound</span>
                </span>
                <span className="text-sm font-semibold text-ink-soft">
                  {muted ? "OFF" : "ON"}
                </span>
              </button>

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
