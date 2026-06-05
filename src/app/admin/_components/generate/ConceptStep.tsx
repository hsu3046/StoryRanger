"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CaretLeft, CaretRight, Check, X } from "@phosphor-icons/react";

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

interface Props {
  draftId: string;
  brief: string;
  language: string;
  meta: DraftMetaT;
  initialConcept: ConceptT | null;
}

export function ConceptStep({ draftId, brief, language, meta, initialConcept }: Props) {
  const [concept, setConcept] = useState<ConceptT | null>(initialConcept);
  const [briefText, setBriefText] = useState(brief);
  const [busy, setBusy] = useState<"gen" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Index of the art-style being previewed in the enlarge modal (null = closed).
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

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

  useAutosave(concept, (c) => (c ? saveConceptAction(draftId, c) : undefined), {
    enabled: !!concept,
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
      const res = await postJson<{ concept: ConceptT }>("/api/admin/generate/concept", {
        brief: briefText,
        language,
        authorRequest,
      });
      setConcept(res.concept);
      void saveConceptAction(draftId, res.concept);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function set<K extends keyof ConceptT>(key: K, value: ConceptT[K]) {
    setConcept((c) => (c ? { ...c, [key]: value } : c));
  }
  /** Pick an art-style template — stores its id (for highlight) + prompt (the
   *  text injected into every image prompt). */
  function setStyle(id: string, prompt: string) {
    setConcept((c) => (c ? { ...c, artStyleId: id, artStylePrompt: prompt } : c));
  }

  if (!concept) {
    return (
      <Card title="Concept">
        <p className="text-sm text-ink-soft">
          Describe your story idea, then generate the concept — title, premise,
          and themes. You&apos;ll pick an art style next.
        </p>
        <Field label="Story idea">
          <textarea
            className={`${inputCls} min-h-32`}
            value={briefText}
            onChange={(e) => setBriefText(e.target.value)}
            placeholder="e.g. A shy octopus afraid of the dark learns to make its own light…"
          />
        </Field>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex justify-end">
          <PrimaryButton onClick={() => generate()} disabled={busy === "gen" || !briefText.trim()}>
            {busy === "gen" ? "Generating…" : "✨ Generate concept"}
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
          examples={[
            "Make it more adventurous",
            "Aim younger",
            "A different setting",
            "Gentler, cozier tone",
          ]}
          onRegenerate={generate}
        />
      }
    >
      <Field label="Title">
        <input className={inputCls} value={concept.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Subtitle">
        <input className={inputCls} value={concept.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
      </Field>
      <Field label="Target age">
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
      </Field>
      <Field label="Themes">
        <input
          className={inputCls}
          value={concept.themes.join(", ")}
          onChange={(e) => set("themes", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        />
      </Field>
      <Field label="Premise">
        <textarea
          className={`${inputCls} min-h-28`}
          value={concept.premise}
          onChange={(e) => set("premise", e.target.value)}
          placeholder="What happens — who the hero is and the situation that starts the story"
        />
      </Field>
      <Field label="Lesson">
        <textarea
          className={`${inputCls} min-h-20`}
          value={concept.lesson ?? ""}
          onChange={(e) => set("lesson", e.target.value)}
          placeholder="What you want children to learn or feel by the end"
        />
      </Field>
      <Field label="Tone">
        <input
          className={inputCls}
          value={concept.tone ?? ""}
          onChange={(e) => set("tone", e.target.value)}
          placeholder="cozy, gentle, a little mysterious"
        />
      </Field>

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
