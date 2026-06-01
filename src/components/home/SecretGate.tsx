"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { getAudio, SFX } from "@/lib/audio-engine";

/** Fixed family code — a soft "keep just-anyone out" gate, not real auth
 *  (the value ships in the client bundle). */
const CODE = "0824";
// Two rows of five: 1–5 then 6–0. Backspace is rendered separately below.
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

interface Props {
  /** Fired after the door-open celebration when the code is correct. */
  onUnlock: () => void;
  /** Back out to the home screen without entering. */
  onCancel: () => void;
}

/**
 * Kid-friendly "magic door" passcode gate. Tap the secret numbers; a correct
 * code swings the door open with a burst of sparkles, then hands off to the
 * caller (which runs the dive-into-the-story transition). A wrong code just
 * gives the dots a gentle wiggle and clears — never a harsh "denied".
 */
export function SecretGate({ onUnlock, onCancel }: Props) {
  const [entered, setEntered] = useState("");
  const [wrong, setWrong] = useState(false);
  const [opening, setOpening] = useState(false);
  const locked = opening || wrong; // freeze input during the open/wiggle beat

  function submit(code: string) {
    if (code === CODE) {
      setOpening(true);
      getAudio().playSfx(SFX.MEDAL);
      // Let the door swing open before handing off to the dive transition.
      setTimeout(onUnlock, 1100);
    } else {
      setWrong(true);
      setTimeout(() => {
        setEntered("");
        setWrong(false);
      }, 650);
    }
  }

  function press(d: string) {
    if (locked) return;
    const next = (entered + d).slice(0, CODE.length);
    setEntered(next);
    if (next.length === CODE.length) submit(next);
  }

  function backspace() {
    if (locked) return;
    setEntered((e) => e.slice(0, -1));
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-40 flex flex-col items-center overflow-y-auto bg-gradient-to-b from-[#2c2347] via-[#3b2f57] to-[#1d1730] px-6 py-8"
    >
      <button
        type="button"
        onClick={onCancel}
        className="absolute left-4 top-4 rounded-pill bg-paper/15 px-4 py-2 text-sm font-medium text-paper/85 backdrop-blur transition hover:bg-paper/25 active:scale-95"
      >
        ← Back
      </button>

      <div className="my-auto flex flex-col items-center gap-5">
        {/* The magic door */}
        <div className="relative" style={{ perspective: 900 }}>
          {/* Warm light revealed behind the door as it swings open. */}
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.6 }}
            animate={
              opening ? { opacity: 1, scale: 1.35 } : { opacity: 0, scale: 0.6 }
            }
            transition={{ duration: 0.9 }}
            className="absolute inset-0 rounded-[2rem]"
            style={{
              background:
                "radial-gradient(circle, rgba(255,246,210,0.95) 0%, rgba(255,212,120,0.6) 45%, rgba(255,180,80,0) 75%)",
              filter: "blur(6px)",
            }}
          />
          {/* Door panel — hinges open on the left edge. */}
          <motion.div
            animate={opening ? { rotateY: -82 } : { rotateY: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            style={{
              transformOrigin: "left center",
              transformStyle: "preserve-3d",
            }}
            className="relative flex h-40 w-28 items-center justify-end rounded-[1.3rem] bg-gradient-to-b from-[#b07c41] to-[#7c5026] px-3 shadow-[0_12px_30px_rgba(0,0,0,0.5)] ring-2 ring-[#caa06a]/60"
          >
            <div className="absolute inset-2 rounded-[0.9rem] ring-2 ring-[#8a5e30]/50" />
            <div className="h-3.5 w-3.5 rounded-full bg-[#ffe9a8] shadow-inner ring-1 ring-[#b88a3a]" />
          </motion.div>

          {/* Sparkle burst on open. */}
          {opening &&
            ["-46px -8px", "34px -26px", "-24px 38px", "42px 30px", "2px -52px"].map(
              (t, i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 text-2xl"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0.5] }}
                  transition={{ duration: 1, delay: 0.2 + i * 0.08 }}
                  style={{ translate: t }}
                >
                  ✨
                </motion.span>
              ),
            )}
        </div>

        <p
          className="text-center font-handwritten text-2xl leading-snug text-paper sm:text-3xl"
          style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}
        >
          {opening ? "The door is open! ✨" : "Enter the secret code 🔑"}
        </p>

        {/* Progress dots — wiggle on a wrong code. */}
        <motion.div
          animate={wrong ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex gap-3"
        >
          {Array.from({ length: CODE.length }).map((_, i) => (
            <span
              key={i}
              className={`h-4 w-4 rounded-full transition-colors ${
                wrong
                  ? "bg-red-300"
                  : i < entered.length
                    ? "bg-[#ffe08a] shadow-[0_0_10px_rgba(255,224,138,0.8)]"
                    : "bg-paper/25"
              }`}
            />
          ))}
        </motion.div>

        <p
          className={`text-sm transition-opacity ${
            wrong ? "text-paper/85 opacity-100" : "opacity-0"
          }`}
        >
          Oops, try again! 🙂
        </p>

        {/* Keypad — two rows of five (1–5 / 6–0), backspace below. */}
        <div className="flex flex-col items-center gap-2.5 sm:gap-3">
          <div className="grid grid-cols-5 gap-2.5 sm:gap-3">
            {KEYS.map((k) => (
              <KeyButton key={k} label={k} onClick={() => press(k)} disabled={locked} />
            ))}
          </div>
          <KeyButton label="⌫" onClick={backspace} disabled={locked} muted />
        </div>
      </div>
    </motion.div>
  );
}

function KeyButton({
  label,
  onClick,
  disabled,
  muted,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.88 }}
      aria-label={label === "⌫" ? "Delete" : label}
      className={`flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold shadow-card transition disabled:opacity-40 sm:h-16 sm:w-16 sm:text-2xl ${
        muted
          ? "bg-paper/20 text-paper/85 hover:bg-paper/30"
          : "bg-paper text-ink hover:bg-paper/90"
      }`}
    >
      {label}
    </motion.button>
  );
}
