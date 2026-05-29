"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

import type { Hero, HeroGender, PlayState } from "@/types/story";
import { loadState, saveState, clearState } from "@/lib/storage";
import { newPlayState } from "@/lib/story-engine";
import { wizardOfOz } from "@/stories/wizard-of-oz";

const NAME_MAX = 20;

export interface StoryCardMeta {
  id: string;
  title: string;
  /** Tagline shown under the title. */
  subtitle: string;
  /** Cover image path WITHOUT extension. */
  coverBase: string;
}

interface Props {
  /** Story catalog assembled server-side from scenes.json — single
   *  source of truth. Each entry mirrors `story.title`,
   *  `story.subtitle`, and `story.coverImage` (extension stripped). */
  stories: StoryCardMeta[];
}

export function HomeOnboarding({ stories: STORIES }: Props) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [savedMap, setSavedMap] = useState<Record<string, PlayState | null>>(
    {},
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [showNewHero, setShowNewHero] = useState(false);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<HeroGender>("girl");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot localStorage hydration
    setSavedMap(
      Object.fromEntries(STORIES.map((s) => [s.id, loadState(s.id)])),
    );
    setHydrated(true);
  }, []);

  const active = STORIES[activeIdx];
  const saved = savedMap[active.id] ?? null;
  const hasPrev = activeIdx > 0;
  const hasNext = activeIdx < STORIES.length - 1;

  const story = useMemo(() => {
    // Real Story object lookup. Today only wizardOfOz is wired; extending
    // the catalog requires importing the new Story here.
    return active.id === wizardOfOz.id ? wizardOfOz : null;
  }, [active.id]);

  function startNew(hero: Hero) {
    if (!story) return;
    clearState(active.id);
    saveState(newPlayState(story, hero));
    router.push(`/play/${active.id}`);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = name.trim().slice(0, NAME_MAX);
    if (!cleaned) return;
    startNew({ name: cleaned, gender });
  }

  return (
    <main className="fixed inset-0 z-0 overflow-hidden bg-ink">
      {/* Full-bleed cover */}
      <AnimatePresence mode="wait">
        <motion.div
          key={active.id}
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.01 }}
          transition={{ duration: 0.45 }}
          className="absolute inset-0"
        >
          <CoverImage base={active.coverBase} title={active.title} />
        </motion.div>
      </AnimatePresence>

      {/* Veils — top dim for the title chip, big bottom one for the buttons */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-ink/35 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[60%] bg-gradient-to-t from-ink/80 via-ink/35 to-transparent" />

      {/* Carousel arrows */}
      {STORIES.length > 1 && (
        <>
          <CarouselArrow
            side="left"
            disabled={!hasPrev}
            onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
          />
          <CarouselArrow
            side="right"
            disabled={!hasNext}
            onClick={() =>
              setActiveIdx((i) => Math.min(STORIES.length - 1, i + 1))
            }
          />
        </>
      )}

      {/* Title + tagline + buttons */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-5 px-6 pb-8 sm:gap-6 sm:pb-10"
        style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
      >
        <header className="flex flex-col items-center gap-2 text-center text-paper">
          <p
            className="font-handwritten text-2xl text-paper/85 sm:text-3xl"
            style={{ textShadow: "0 3px 10px rgba(0,0,0,0.7)" }}
          >
            Once upon a time…
          </p>
          <h1
            className="text-3xl font-semibold leading-tight sm:text-5xl"
            style={{ textShadow: "0 5px 18px rgba(0,0,0,0.85)" }}
          >
            {active.title}
          </h1>
          <p
            className="max-w-xl text-sm leading-relaxed text-paper/80 sm:text-base"
            style={{ textShadow: "0 2px 6px rgba(0,0,0,0.7)" }}
          >
            {active.subtitle}
          </p>
        </header>

        {hydrated && (
          <div className="flex w-full max-w-md flex-col items-stretch gap-3">
            {saved && (
              <button
                type="button"
                onClick={() => router.push(`/play/${active.id}`)}
                className="group inline-flex min-h-14 w-full items-center justify-between gap-3 rounded-button bg-paper/85 px-5 text-left text-base text-ink ring-1 ring-ink-soft/10 shadow-card backdrop-blur transition-all hover:bg-paper hover:-translate-y-px active:translate-y-0"
              >
                <span className="flex flex-col">
                  <span className="font-handwritten text-base text-accent-deep">
                    Continue
                  </span>
                  <span className="text-base font-medium">
                    as {saved.hero?.name ?? "Hero"}
                  </span>
                </span>
                <span className="font-handwritten text-2xl text-accent-deep/70 transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowNewHero(true)}
              className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-button bg-accent-deep px-9 text-lg font-medium text-paper shadow-card transition-all hover:-translate-y-0.5 hover:shadow-overlay active:translate-y-0 active:scale-[0.98]"
            >
              {saved ? "Start a new adventure" : "Begin the Adventure"}
            </button>
          </div>
        )}

        {/* Page dots */}
        {STORIES.length > 1 && (
          <div className="flex items-center gap-1.5">
            {STORIES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveIdx(i)}
                aria-label={`Go to ${s.title}`}
                className={`h-2 rounded-full transition-all ${
                  i === activeIdx
                    ? "w-8 bg-paper"
                    : "w-2 bg-paper/40 hover:bg-paper/60"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* New-hero overlay */}
      <AnimatePresence>
        {showNewHero && (
          <>
            <motion.button
              key="nh-backdrop"
              type="button"
              aria-label="Close"
              onClick={() => setShowNewHero(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-30 cursor-pointer bg-ink/40 backdrop-blur-sm"
            />
            <motion.form
              key="nh-form"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 6 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              onSubmit={handleSubmit}
              className="fixed left-1/2 top-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card-lg bg-paper/90 p-6 shadow-overlay ring-1 ring-ink-soft/10 backdrop-blur sm:p-7"
            >
              <header className="flex flex-col items-center gap-1">
                <p className="font-handwritten text-xl text-accent-deep">
                  Your adventure begins…
                </p>
                <p className="text-sm text-ink-soft">{active.title}</p>
              </header>

              <div className="flex w-full flex-col gap-1.5 text-left">
                <label
                  htmlFor="hero-name"
                  className="font-handwritten text-lg text-accent-deep"
                >
                  What is your name?
                </label>
                <input
                  id="hero-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
                  placeholder="Type your name"
                  className="min-h-12 rounded-button bg-paper-deep/40 px-5 text-base text-ink ring-1 ring-ink-soft/10 transition-shadow placeholder:text-ink-soft/50 focus:bg-paper-deep/70 focus:outline-none focus:ring-accent/50"
                />
              </div>

              <div className="flex w-full flex-col gap-1.5 text-left">
                <p className="font-handwritten text-lg text-accent-deep">
                  Are you a girl or a boy?
                </p>
                <div className="flex gap-2.5">
                  <GenderOption
                    value="girl"
                    selected={gender === "girl"}
                    onSelect={setGender}
                    emoji="👧"
                    label="Girl"
                  />
                  <GenderOption
                    value="boy"
                    selected={gender === "boy"}
                    onSelect={setGender}
                    emoji="👦"
                    label="Boy"
                  />
                </div>
              </div>

              <div className="mt-1 flex w-full gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewHero(false)}
                  className="min-h-12 flex-1 rounded-button bg-paper-deep/50 text-base font-medium text-ink ring-1 ring-ink-soft/10 transition-all active:scale-[0.98]"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={name.trim().length === 0}
                  className="min-h-12 flex-[2] rounded-button bg-accent-deep text-base font-medium text-paper shadow-soft transition-all active:scale-[0.98] disabled:bg-ink-soft/20 disabled:text-ink-soft/50"
                >
                  Begin the Adventure
                </button>
              </div>
            </motion.form>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}

// ──────────────────────────────────────────────────────────

const EXTS = [".webp", ".jpeg", ".jpg", ".png"];

function CoverImage({ base, title }: { base: string; title: string }) {
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const candidates = EXTS.map((e) => base + e);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on base change
    setIdx(0);
    setFailed(false);
  }, [base]);

  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-paper-deep to-accent/20">
        <span className="font-handwritten text-3xl text-ink-soft">{title}</span>
      </div>
    );
  }

  return (
    <Image
      key={candidates[idx]}
      src={candidates[idx]}
      alt={title}
      fill
      priority
      sizes="100vw"
      quality={85}
      className="object-cover object-center"
      onError={() => {
        if (idx + 1 < candidates.length) setIdx(idx + 1);
        else setFailed(true);
      }}
    />
  );
}

function CarouselArrow({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous story" : "Next story"}
      className={`absolute top-1/2 z-20 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-paper/70 text-ink ring-1 ring-ink-soft/15 shadow-button backdrop-blur transition-all hover:bg-paper/90 active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed sm:h-16 sm:w-16 ${
        side === "left" ? "left-4 sm:left-6" : "right-4 sm:right-6"
      }`}
    >
      {side === "left" ? (
        <CaretLeft size={28} weight="bold" />
      ) : (
        <CaretRight size={28} weight="bold" />
      )}
    </button>
  );
}

function GenderOption({
  value,
  selected,
  onSelect,
  emoji,
  label,
}: {
  value: HeroGender;
  selected: boolean;
  onSelect: (v: HeroGender) => void;
  emoji: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={selected}
      className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-button transition-all ${
        selected
          ? "bg-paper-deep ring-2 ring-accent shadow-card"
          : "bg-paper-deep/40 ring-1 ring-ink-soft/10 hover:bg-paper-deep/70"
      }`}
    >
      <span className="text-2xl" aria-hidden>
        {emoji}
      </span>
      <span
        className={`text-sm font-medium ${selected ? "text-ink" : "text-ink-soft"}`}
      >
        {label}
      </span>
    </button>
  );
}
