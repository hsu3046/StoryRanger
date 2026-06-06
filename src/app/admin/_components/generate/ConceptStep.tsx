"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CaretLeft,
  CaretRight,
  Check,
  Lock,
  LockOpen,
  X,
} from "@phosphor-icons/react";

import type { ConceptT, DraftMetaT } from "@/data/schemas";
import { ART_STYLES } from "@/data/art-styles";
import { assetUrl } from "@/lib/asset-paths";
import { saveConceptAction, saveDraftMetaAction } from "../../_actions/generateDraft";
import { Field, inputCls } from "../form";
import { RegenerateButton } from "./RegenerateButton";
import { Card, ErrorNote, postJson, PrimaryButton } from "./shared";
import { useAutosave, useStageVisit } from "./useAutosave";

/** Narrow, centred variant of `inputCls` for the small numeric age inputs. */
const ageInputCls = inputCls.replace("w-full", "w-16 text-center");
const labelCls = "text-xs font-semibold uppercase tracking-wide text-ink-soft";

/** Fields the author can lock (kept on Generate) or leave open (AI writes). */
type LockKey = "targetAge" | "themes" | "lesson" | "title" | "subtitle" | "premise" | "tone";
const LOCK_KEYS: LockKey[] = ["targetAge", "themes", "lesson", "title", "subtitle", "premise", "tone"];
// Author-intent fields start LOCKED (you set them); craft fields start OPEN.
const DEFAULT_LOCKS: Record<LockKey, boolean> = {
  targetAge: true,
  themes: true,
  lesson: true,
  title: false,
  subtitle: false,
  premise: false,
  tone: false,
};

function skeletonConcept(language: string): ConceptT {
  return {
    title: "",
    subtitle: "",
    premise: "",
    lesson: "",
    tone: "",
    targetAge: { min: 5, max: 8 },
    themes: [],
    language,
    estimatedMinutes: 10,
    artStyleId: "",
    artStylePrompt: "",
  };
}

/** A concept is "real" (worth persisting / past the input stage) once the AI
 *  craft fields or any author input carry content. */
function isMeaningful(c: ConceptT): boolean {
  return (
    c.title.trim() !== "" ||
    c.premise.trim() !== "" ||
    c.lesson.trim() !== "" ||
    c.tone.trim() !== "" ||
    c.themes.length > 0
  );
}

/** Lock / unlock toggle shown beside a field label. */
function LockToggle({
  locked,
  onToggle,
}: {
  locked: boolean;
  onToggle: () => void;
}) {
  const Icon = locked ? Lock : LockOpen;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={locked}
      title={
        locked
          ? "Locked — you set this; Generate keeps it"
          : "Open — Generate (re)writes this"
      }
      className={`inline-flex h-6 w-6 items-center justify-center rounded-pill transition-colors ${
        locked
          ? "bg-paper-deep/60 text-accent-deep"
          : "text-ink-soft/40 hover:text-ink-soft"
      }`}
    >
      <Icon weight={locked ? "fill" : "regular"} className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

/** Labelled field row with a lock toggle on the right. */
function LockedField({
  label,
  locked,
  onToggle,
  children,
}: {
  label: string;
  locked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className={labelCls}>{label}</span>
        <LockToggle locked={locked} onToggle={onToggle} />
      </div>
      {children}
    </div>
  );
}

interface Props {
  draftId: string;
  brief: string;
  language: string;
  meta: DraftMetaT;
  initialConcept: ConceptT | null;
}

export function ConceptStep({ draftId, brief, language, meta, initialConcept }: Props) {
  // A concept always exists in memory (skeleton before first generation) so the
  // author-input fields are editable from the start; it's only persisted once
  // it carries real content (isMeaningful).
  const [concept, setConcept] = useState<ConceptT>(
    initialConcept ?? skeletonConcept(language),
  );
  const [briefText, setBriefText] = useState(brief);
  const [busy, setBusy] = useState<"gen" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [locks, setLocks] = useState<Record<LockKey, boolean>>(DEFAULT_LOCKS);
  // Index of the art-style being previewed in the enlarge modal (null = closed).
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const generated = isMeaningful(concept) && concept.title.trim() !== "";

  const N_STYLES = ART_STYLES.length;
  /** Step the preview to the prev/next style, wrapping around the gallery. */
  const moveStyle = (delta: number) =>
    setPreviewIdx((i) => (i === null ? i : (i + delta + N_STYLES) % N_STYLES));

  // Modal key handling (ESC close, ←/→ navigate) + body scroll lock.
  useEffect(() => {
    if (previewIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewIdx(null);
      else if (e.key === "ArrowLeft")
        setPreviewIdx((i) => (i === null ? i : (i - 1 + N_STYLES) % N_STYLES));
      else if (e.key === "ArrowRight")
        setPreviewIdx((i) => (i === null ? i : (i + 1) % N_STYLES));
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [previewIdx, N_STYLES]);

  useAutosave(concept, (c) => saveConceptAction(draftId, c), {
    enabled: isMeaningful(concept),
  });
  // Persist the story idea (brief) to meta so it survives navigation.
  useAutosave(briefText, (t) => saveDraftMetaAction(draftId, { brief: t }), {
    enabled: briefText !== brief,
  });
  useStageVisit(draftId, meta, "concept");

  async function generate(authorRequest?: string) {
    setErr(null);
    setBusy("gen");
    try {
      // Send the LOCKED fields as constraints so the AI writes the open fields to
      // fit them (the author's intent — age/lesson/themes — is never re-rolled).
      const constraints: Partial<Record<LockKey, unknown>> = {};
      for (const key of LOCK_KEYS) if (locks[key]) constraints[key] = concept[key];

      const res = await postJson<{ concept: ConceptT }>("/api/admin/generate/concept", {
        brief: briefText,
        language,
        authorRequest,
        constraints,
      });
      // Merge: keep every locked field + the author-picked art style; take the AI
      // output only for open fields.
      const merged: ConceptT = { ...res.concept };
      for (const key of LOCK_KEYS) {
        if (locks[key]) (merged[key] as ConceptT[LockKey]) = concept[key];
      }
      merged.artStyleId = concept.artStyleId;
      merged.artStylePrompt = concept.artStylePrompt;
      setConcept(merged);
      void saveConceptAction(draftId, merged);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function set<K extends keyof ConceptT>(key: K, value: ConceptT[K]) {
    setConcept((c) => ({ ...c, [key]: value }));
  }
  function toggleLock(key: LockKey) {
    setLocks((l) => ({ ...l, [key]: !l[key] }));
  }
  /** Pick an art-style template — stores its id (for highlight) + prompt (the
   *  text injected into every image prompt). */
  function setStyle(id: string, prompt: string) {
    setConcept((c) => ({ ...c, artStyleId: id, artStylePrompt: prompt }));
  }

  const targetAgeField = (
    <LockedField label="Target age" locked={locks.targetAge} onToggle={() => toggleLock("targetAge")}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          className={ageInputCls}
          value={concept.targetAge.min}
          onChange={(e) => set("targetAge", { ...concept.targetAge, min: Number(e.target.value) || 0 })}
        />
        <span className="text-ink-soft">–</span>
        <input
          type="number"
          className={ageInputCls}
          value={concept.targetAge.max}
          onChange={(e) => set("targetAge", { ...concept.targetAge, max: Number(e.target.value) || 0 })}
        />
      </div>
    </LockedField>
  );
  const themesField = (
    <LockedField label="Themes" locked={locks.themes} onToggle={() => toggleLock("themes")}>
      <input
        className={inputCls}
        value={concept.themes.join(", ")}
        onChange={(e) => set("themes", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        placeholder="Exploration, Friendship, Courage"
      />
    </LockedField>
  );
  const lessonField = (
    <LockedField label="Lesson" locked={locks.lesson} onToggle={() => toggleLock("lesson")}>
      <textarea
        className={`${inputCls} min-h-20`}
        value={concept.lesson ?? ""}
        onChange={(e) => set("lesson", e.target.value)}
        placeholder="What you want children to learn or feel by the end"
      />
    </LockedField>
  );

  // ── Input stage — author fills the required intent, AI hasn't run yet ──
  if (!generated) {
    // A locked field is author-owned, so it must be filled before generating;
    // an open field the AI will write, so it isn't required here.
    const ready =
      briefText.trim() !== "" &&
      (!locks.themes || concept.themes.length > 0) &&
      (!locks.lesson || concept.lesson.trim() !== "") &&
      (!locks.targetAge || (concept.targetAge.min > 0 && concept.targetAge.max > 0));
    return (
      <Card title="Concept">
        <p className="text-sm text-ink-soft">
          Set the target age, themes, and lesson — the AI writes the title,
          premise, and tone to fit. You&apos;ll pick an art style next.
        </p>
        <Field label="Story idea">
          <textarea
            className={`${inputCls} min-h-28`}
            value={briefText}
            onChange={(e) => setBriefText(e.target.value)}
            placeholder="e.g. A shy octopus afraid of the dark learns to make its own light…"
          />
        </Field>
        {targetAgeField}
        {lessonField}
        {themesField}
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex justify-end">
          <PrimaryButton onClick={() => generate()} disabled={busy === "gen" || !ready}>
            {busy === "gen" ? "Generating…" : "✨ Generate"}
          </PrimaryButton>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Concept"
      actions={
        <RegenerateButton
          busy={busy === "gen"}
          disabled={busy !== null}
          title="Revise the concept"
          hint={
            <>
              Re-writes only the open (
              <LockOpen weight="regular" className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
              ) fields to fit your locked (
              <Lock weight="fill" className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
              ) ones. Lock a field to keep it; open it to let the AI re-write it.
            </>
          }
          onRegenerate={generate}
        />
      }
    >
      <LockedField label="Title" locked={locks.title} onToggle={() => toggleLock("title")}>
        <input className={inputCls} value={concept.title} onChange={(e) => set("title", e.target.value)} />
      </LockedField>
      <LockedField label="Subtitle" locked={locks.subtitle} onToggle={() => toggleLock("subtitle")}>
        <input className={inputCls} value={concept.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
      </LockedField>
      {targetAgeField}
      {lessonField}
      {themesField}
      <LockedField label="Premise" locked={locks.premise} onToggle={() => toggleLock("premise")}>
        <textarea
          className={`${inputCls} min-h-28`}
          value={concept.premise}
          onChange={(e) => set("premise", e.target.value)}
          placeholder="What happens — who the hero is and the situation that starts the story"
        />
      </LockedField>
      <LockedField label="Tone" locked={locks.tone} onToggle={() => toggleLock("tone")}>
        <input
          className={inputCls}
          value={concept.tone ?? ""}
          onChange={(e) => set("tone", e.target.value)}
          placeholder="cozy, gentle, a little mysterious"
        />
      </LockedField>

      <h4 className="mt-5 text-sm font-semibold text-accent-deep">Art Style</h4>
      <div className="grid grid-cols-4 gap-2">
        {ART_STYLES.map((s, i) => {
          const active = concept.artStyleId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setPreviewIdx(i)}
              aria-pressed={active}
              title={s.prompt}
              className={`flex flex-col gap-1 overflow-hidden rounded-card bg-paper-deep/20 p-1.5 text-left transition active:scale-[0.98] ${
                active
                  ? "ring-2 ring-accent"
                  : "ring-1 ring-ink-soft/10 hover:ring-ink-soft/30"
              }`}
            >
              <span className="relative block aspect-video w-full overflow-hidden rounded-button bg-paper-deep/40">
                {s.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- author-curated static thumbnails (R2-mirrored), not user content */
                  <img
                    src={assetUrl(s.image)}
                    alt={s.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[0.7rem] text-ink-soft/50">
                    No Image
                  </span>
                )}
                {active && (
                  <span className="absolute right-1 top-1 rounded-pill bg-accent px-1.5 py-0.5 text-[0.65rem] font-semibold text-paper shadow-soft">
                    Selected
                  </span>
                )}
              </span>
              <span className="block truncate px-0.5 text-center text-xs font-medium text-ink">
                {s.name}
              </span>
            </button>
          );
        })}
      </div>

      {err && <ErrorNote>{err}</ErrorNote>}

      {previewIdx !== null &&
        typeof document !== "undefined" &&
        createPortal(
          (() => {
            const s = ART_STYLES[previewIdx];
            const active = concept.artStyleId === s.id;
            const navBtn =
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper/15 text-paper transition-colors hover:bg-paper/30 active:scale-95";
            return (
              <div
                className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/85 p-4"
                onClick={() => setPreviewIdx(null)}
                role="dialog"
                aria-modal="true"
              >
                <button
                  type="button"
                  onClick={() => setPreviewIdx(null)}
                  aria-label="Close"
                  className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-paper/15 text-paper transition-colors hover:bg-paper/30"
                >
                  <X weight="bold" className="h-5 w-5" />
                </button>

                <div
                  className="flex items-center gap-3 sm:gap-5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => moveStyle(-1)}
                    aria-label="Previous style"
                    className={navBtn}
                  >
                    <CaretLeft weight="bold" className="h-6 w-6" />
                  </button>

                  <div className="flex max-w-[80vw] flex-col items-center gap-3">
                    <p className="text-center text-lg font-semibold text-paper">
                      {s.name}
                    </p>
                    <div className="flex max-h-[68vh] items-center justify-center overflow-hidden rounded-card bg-paper/10">
                      {s.image ? (
                        /* eslint-disable-next-line @next/next/no-img-element -- author-curated static thumbnail */
                        <img
                          src={assetUrl(s.image)}
                          alt={s.name}
                          className="max-h-[68vh] max-w-[80vw] object-contain"
                        />
                      ) : (
                        <div className="flex h-64 w-80 items-center justify-center text-sm text-paper/50">
                          No Image
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStyle(s.id, s.prompt);
                        setPreviewIdx(null);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-button px-5 py-2 text-sm font-semibold transition-colors active:scale-95 ${
                        active
                          ? "bg-emerald text-paper"
                          : "bg-accent text-paper hover:bg-accent-deep"
                      }`}
                    >
                      {active ? (
                        <>
                          <Check weight="bold" className="h-4 w-4" /> Selected
                        </>
                      ) : (
                        "Select this style"
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => moveStyle(1)}
                    aria-label="Next style"
                    className={navBtn}
                  >
                    <CaretRight weight="bold" className="h-6 w-6" />
                  </button>
                </div>
              </div>
            );
          })(),
          document.body,
        )}
    </Card>
  );
}
