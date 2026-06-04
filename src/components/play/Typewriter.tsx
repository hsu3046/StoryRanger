"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  text: string;
  /** Milliseconds between characters. Default 38 — an unhurried read-aloud
   *  pace (was 28; slowed for a calmer storybook rhythm). */
  speed?: number;
  /** When true (default), pause longer at sentence-ending punctuation so the
   *  rhythm feels like reading aloud, not stuttering. */
  punctuationPause?: boolean;
  /** Fires once when the full text is revealed (or skip is tapped). */
  onDone?: () => void;
  /** Tap-to-skip: clicking the typewriter region finishes instantly. */
  skipOnClick?: boolean;
  /** Render the full text immediately, no typing — used when re-showing
   *  narration that was already revealed for this scene (e.g. after closing a
   *  dialogue). The typing animation is reserved for genuine scene entry. */
  instant?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Reveals `text` one character at a time. Wraps content in a span; we
 * always render the FULL text in a visibility-hidden mirror so the layout
 * is reserved at the final size from the start (no reflow as each glyph
 * appears, no "growing bubble" feel).
 *
 * Text changes (new scene / branch picked) reset the animation.
 */
export function Typewriter({
  text,
  speed = 38,
  punctuationPause = true,
  onDone,
  skipOnClick,
  instant,
  className,
  style,
}: Props) {
  const [count, setCount] = useState(instant ? text.length : 0);
  // Latch onDone in a ref so parents passing inline arrows don't re-trigger
  // the typing effect on every render (same pattern as MathPuzzle timer).
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Completion fires exactly once per text. The terminal-breath delay below can
  // re-enter the effect (instant flips, re-render) before onDone fires, so this
  // guards against a double signal. Re-armed on each new text.
  const doneFiredRef = useRef(false);
  useEffect(() => {
    doneFiredRef.current = false;
  }, [text]);

  // Reset on text change — to 0 to retype, or straight to the end when instant
  // (already-revealed narration re-showing after a dialogue closes).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: external `text` prop drives the animation reset
    setCount(instant ? text.length : 0);
  }, [text, instant]);

  // Advance one character per tick. Pause AFTER a breathing point: each delay is
  // keyed off the char we JUST revealed (text[count-1]), so the gap lands after
  // the period / comma / line break — the way you breathe reading aloud —
  // rather than stalling just before the punctuation appears.
  useEffect(() => {
    // The breath that should follow `ch` once it has been revealed.
    const breathAfter = (ch: string | undefined) => {
      if (!punctuationPause || !ch) return speed;
      if (ch === "\n") return speed * 13; // line break — longest breath
      if (ch === "." || ch === "!" || ch === "?" || ch === "—") return speed * 9;
      if (ch === "," || ch === ";" || ch === ":") return speed * 4.5;
      return speed;
    };

    if (count >= text.length) {
      if (doneFiredRef.current) return;
      const fire = () => {
        if (doneFiredRef.current) return;
        doneFiredRef.current = true;
        onDoneRef.current?.();
      };
      // Let a terminal breathing point land before signalling completion —
      // onDone reveals the choices / ending UI, so a line ending in '.', '!',
      // '?', '—' or a line break gets its final breath first. An instant
      // re-show wasn't typed, so it completes immediately.
      const tail =
        !instant && text.length > 0
          ? breathAfter(text[text.length - 1])
          : speed;
      if (tail <= speed) {
        fire();
        return;
      }
      const id = setTimeout(fire, tail);
      return () => clearTimeout(id);
    }

    const id = setTimeout(
      () => setCount((c) => c + 1),
      breathAfter(text[count - 1]),
    );
    return () => clearTimeout(id);
  }, [count, text, speed, punctuationPause, instant]);

  function skip() {
    if (!skipOnClick) return;
    if (count < text.length) setCount(text.length);
  }

  const visible = text.slice(0, count);
  const remainder = text.slice(count);

  return (
    <span
      className={className}
      style={style}
      onClick={skipOnClick ? skip : undefined}
    >
      {visible}
      {/* Mirror the remainder in the same inline flow so kerning / line
          wrapping is computed against the FULL text from the first paint
          on — only the colour + decorations are stripped. Using
          `visibility: hidden` or wrapping `visible` in its own span made
          iOS Safari nudge each character left/right by a subpixel as the
          boundary slid through the text (text-balance / shadow / stroke
          all reacted to the segment split). Keeping both segments as bare
          text in the same parent removes that boundary entirely. */}
      <span
        aria-hidden
        style={{
          color: "transparent",
          textShadow: "none",
          WebkitTextStroke: "0",
        }}
      >
        {remainder}
      </span>
    </span>
  );
}
