"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { PaperPlaneTilt } from "@phosphor-icons/react";

interface Props {
  hint?: string;
  disabled?: boolean;
  onSubmit: (text: string) => void;
}

const MAX_LENGTH = 240;
const MAX_HEIGHT_PX = 200;

export function FreeInput({ hint, disabled, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT_PX) + "px";
  }, [value]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    const composing =
      (e.nativeEvent as KeyboardEvent["nativeEvent"] & { isComposing?: boolean })
        .isComposing || e.keyCode === 229;
    if (e.key === "Enter" && !e.shiftKey && !composing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex min-h-20 w-full items-center gap-1 rounded-pill bg-paper/55 px-3 py-2 ring-1 ring-ink-soft/15 shadow-button backdrop-blur-sm transition-shadow focus-within:bg-paper/80 focus-within:ring-accent/50">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        disabled={disabled}
        maxLength={MAX_LENGTH}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder={hint ?? "What does Dorothy do?"}
        className="min-h-12 max-h-52 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2.5 text-center text-lg font-semibold leading-snug text-ink placeholder:font-semibold placeholder:text-ink-soft/50 focus:outline-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || value.trim().length === 0}
        aria-label="Send"
        className="flex h-12 w-12 shrink-0 items-center justify-center text-accent-deep transition-all hover:text-accent active:scale-90 disabled:text-ink-soft/25"
      >
        <PaperPlaneTilt size={26} weight="fill" aria-hidden />
      </button>
    </div>
  );
}
