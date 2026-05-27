"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Gift,
  Heart,
  Lightbulb,
  PaperPlaneTilt,
  X,
} from "@phosphor-icons/react";

import type {
  CompanionId,
  DialogueMessage,
  DialogueResponse,
  Hero,
  SpeakerId,
} from "@/types/story";
import { prettyItem } from "@/data/items";

interface Props {
  open: boolean;
  storyId: string;
  characterId: SpeakerId;
  characterName: string;
  characterColor: string;
  characterImageBase: string; // e.g. "/stories/wizard-of-oz/characters/lion"
  mood: number;
  hero: Hero;
  sceneId: string;
  sceneNarration: string;
  companions: CompanionId[];
  history: DialogueMessage[];
  onApplyTurn: (resp: DialogueResponse, userText: string) => void;
  onClose: () => void;
}

const MAX_INPUT = 240;

const IMAGE_EXTS = [".png", ".webp", ".jpg", ".jpeg"];

function buildImageCandidates(base: string): string[] {
  return IMAGE_EXTS.map((ext) => base + ext);
}

export function DialogueModal({
  open,
  storyId,
  characterId,
  characterName,
  characterColor,
  characterImageBase,
  mood,
  hero,
  sceneId,
  sceneNarration,
  companions,
  history,
  onApplyTurn,
  onClose,
}: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recentGift, setRecentGift] = useState<string | null>(null);
  const [recentHint, setRecentHint] = useState<string | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const imageCandidates = buildImageCandidates(characterImageBase);

  // Reset img candidate when character changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on key change
    setImgIdx(0);
    setImgFailed(false);
  }, [characterImageBase]);

  // Auto-scroll history to bottom when it changes
  useEffect(() => {
    const el = historyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history, loading]);

  // Auto-dismiss gift / hint toasts
  useEffect(() => {
    if (!recentGift) return;
    const t = setTimeout(() => setRecentGift(null), 4000);
    return () => clearTimeout(t);
  }, [recentGift]);

  useEffect(() => {
    if (!recentHint) return;
    const t = setTimeout(() => setRecentHint(null), 5000);
    return () => clearTimeout(t);
  }, [recentHint]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);
    setInput("");
    try {
      const res = await fetch("/api/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId,
          characterId,
          hero,
          sceneId,
          sceneNarration,
          companions,
          currentMood: mood,
          history,
          utterance: text,
        }),
      });
      if (!res.ok) throw new Error(`dialogue ${res.status}`);
      const data = (await res.json()) as DialogueResponse;
      if (data.itemGift) setRecentGift(data.itemGift);
      if (data.hiddenHint) setRecentHint(data.hiddenHint);
      onApplyTurn(data, text);
    } catch (err) {
      console.warn("[dialogue] request failed", err);
      onApplyTurn(
        {
          reply: "They smile gently — but the words don't come right now.",
          moodDelta: 0,
          hiddenHint: null,
          itemGift: null,
          endsConversation: false,
        },
        text,
      );
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    const composing =
      (
        e.nativeEvent as ReactKeyboardEvent["nativeEvent"] & {
          isComposing?: boolean;
        }
      ).isComposing || e.keyCode === 229;
    if (e.key === "Enter" && !e.shiftKey && !composing) {
      e.preventDefault();
      send();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            key="dialogue-backdrop"
            type="button"
            aria-label="Close dialogue"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 cursor-pointer bg-ink/30 backdrop-blur-sm"
          />
          <motion.div
            key="dialogue-card"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            role="dialog"
            aria-modal="true"
            className="pointer-events-auto fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card-lg bg-paper shadow-overlay ring-1 ring-ink-soft/10"
          >
            {/* Header */}
            <header
              className="flex items-center gap-3 border-b border-ink-soft/10 px-5 py-3"
              style={{
                background: `linear-gradient(90deg, ${characterColor}18, transparent)`,
              }}
            >
              <div
                className="flex h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-paper"
                style={{ backgroundColor: `${characterColor}22` }}
              >
                {!imgFailed ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imageCandidates[imgIdx]}
                    alt={characterName}
                    className="h-full w-full object-cover"
                    onError={() => {
                      if (imgIdx + 1 < imageCandidates.length) {
                        setImgIdx(imgIdx + 1);
                      } else {
                        setImgFailed(true);
                      }
                    }}
                  />
                ) : (
                  <span
                    className="m-auto font-handwritten text-2xl"
                    style={{ color: characterColor }}
                  >
                    {characterName.charAt(0)}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col">
                <span
                  className="font-handwritten text-xl leading-tight"
                  style={{ color: characterColor }}
                >
                  {characterName}
                </span>
                <span className="flex items-center gap-1 text-sm text-ink-soft">
                  <Heart size={14} weight="fill" className="text-ruby" />
                  <span className="font-semibold tabular-nums text-ink">
                    {mood}
                  </span>
                  <span className="text-ink-soft/60">/ 10</span>
                </span>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Leave conversation"
                className="flex h-9 w-9 items-center justify-center rounded-pill bg-paper-deep/60 text-ink-soft ring-1 ring-ink-soft/10 transition-colors hover:bg-paper-deep hover:text-ink active:scale-90"
              >
                <X size={16} weight="bold" />
              </button>
            </header>

            {/* History */}
            <div
              ref={historyRef}
              className="flex max-h-[50dvh] min-h-32 flex-1 flex-col gap-2.5 overflow-y-auto bg-paper-deep/20 px-5 py-4"
            >
              {history.length === 0 && !loading && (
                <p className="m-auto max-w-xs text-center text-sm text-ink-soft/60">
                  Say hello — type something and press send.
                </p>
              )}
              {history.map((turn, i) => (
                <DialogueBubble
                  key={i}
                  role={turn.role}
                  text={turn.text}
                  characterColor={characterColor}
                />
              ))}
              {loading && (
                <DialogueBubble
                  role="character"
                  text="…"
                  characterColor={characterColor}
                  thinking
                />
              )}
            </div>

            {/* Input */}
            <footer className="flex shrink-0 items-end gap-2 border-t border-ink-soft/10 px-4 py-3">
              <textarea
                rows={1}
                value={input}
                disabled={loading}
                maxLength={MAX_INPUT}
                onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT))}
                onKeyDown={handleKey}
                placeholder={`Say something to ${characterName}…`}
                className="min-h-12 max-h-32 flex-1 resize-none rounded-button bg-paper-deep/40 px-4 py-3 text-base text-ink ring-1 ring-ink-soft/10 transition-shadow placeholder:text-ink-soft/50 focus:bg-paper-deep/70 focus:outline-none focus:ring-accent/50"
              />
              <button
                type="button"
                onClick={send}
                disabled={loading || input.trim().length === 0}
                aria-label="Send"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-accent-deep text-paper shadow-soft transition-all active:scale-95 disabled:bg-ink-soft/20 disabled:text-ink-soft/40"
              >
                <PaperPlaneTilt size={20} weight="fill" />
              </button>
            </footer>

            {/* Floating toasts */}
            <AnimatePresence>
              {recentGift && (
                <motion.div
                  key="gift-toast"
                  initial={{ opacity: 0, y: 8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-pill bg-accent-deep px-4 py-2 text-sm text-paper shadow-medal"
                >
                  <Gift size={18} weight="duotone" />
                  <span>
                    Gift:{" "}
                    <span className="font-semibold">
                      {prettyItem(recentGift)}
                    </span>
                  </span>
                </motion.div>
              )}
              {recentHint && (
                <motion.div
                  key="hint-toast"
                  initial={{ opacity: 0, y: 8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute left-1/2 top-3 z-10 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-card bg-paper-deep px-4 py-2 text-sm text-ink shadow-card ring-1 ring-accent/30"
                >
                  <Lightbulb size={18} weight="duotone" className="text-accent" />
                  <span className="italic">{recentHint}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function DialogueBubble({
  role,
  text,
  characterColor,
  thinking = false,
}: {
  role: "hero" | "character";
  text: string;
  characterColor: string;
  thinking?: boolean;
}) {
  const isHero = role === "hero";
  return (
    <div
      className={`flex ${isHero ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] rounded-card-lg px-4 py-2.5 text-base leading-snug ${
          isHero
            ? "rounded-br-md bg-accent-deep text-paper"
            : "rounded-bl-md bg-paper text-ink ring-1 ring-ink-soft/10"
        } ${thinking ? "italic text-ink-soft/60" : ""}`}
        style={
          !isHero
            ? { borderLeft: `3px solid ${characterColor}` }
            : undefined
        }
      >
        {text}
      </div>
    </div>
  );
}

