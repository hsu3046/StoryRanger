"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  text: string;
  /** Milliseconds between characters. Default 28 — quick but visibly typed. */
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
  speed = 28,
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

  // Reset on text change — to 0 to retype, or straight to the end when instant
  // (already-revealed narration re-showing after a dialogue closes).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: external `text` prop drives the animation reset
    setCount(instant ? text.length : 0);
  }, [text, instant]);

  // Advance one character per tick.
  useEffect(() => {
    if (count >= text.length) {
      onDoneRef.current?.();
      return;
    }
    // Pause AFTER a breathing point: the delay until we reveal text[count] is
    // keyed off the char we JUST revealed (text[count-1]), so the gap lands
    // after the period / comma / line-break — the way you breathe reading
    // aloud — rather than stalling just before the punctuation appears.
    let delay = speed;
    if (punctuationPause) {
      const prev = text[count - 1];
      if (prev === "\n") {
        delay = speed * 10; // line break — longest breath (new paragraph)
      } else if (prev === "." || prev === "!" || prev === "?" || prev === "—") {
        delay = speed * 7; // sentence end
      } else if (prev === "," || prev === ";" || prev === ":") {
        delay = speed * 3; // clause
      }
    }
    const id = setTimeout(() => setCount((c) => c + 1), delay);
    return () => clearTimeout(id);
  }, [count, text, speed, punctuationPause]);

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
