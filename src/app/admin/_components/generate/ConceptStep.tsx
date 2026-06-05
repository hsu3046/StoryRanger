"use client";

import { useState } from "react";

import type { ConceptT, DraftMetaT } from "@/data/schemas";
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
  function setBible<K extends keyof ConceptT["artStyleBible"]>(
    key: K,
    value: ConceptT["artStyleBible"][K],
  ) {
    setConcept((c) =>
      c ? { ...c, artStyleBible: { ...c.artStyleBible, [key]: value } } : c,
    );
  }

  if (!concept) {
    return (
      <Card title="Concept">
        <p className="text-sm text-ink-soft">
          Describe your story idea, then generate the concept — title, premise,
          themes, and an art-style bible.
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

  const b = concept.artStyleBible;
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
      <Field label="Premise / tone">
        <textarea className={`${inputCls} min-h-44`} value={concept.premise} onChange={(e) => set("premise", e.target.value)} />
      </Field>

      <hr className="mt-1 border-t border-ink-soft/15" />
      <h4 className="text-sm font-semibold text-accent-deep">Art Style</h4>
      <div className="flex flex-col gap-3">
        <Field label="Medium">
          <input className={inputCls} value={b.medium} onChange={(e) => setBible("medium", e.target.value)} />
        </Field>
        <Field label="Palette">
          <input className={inputCls} value={b.palette} onChange={(e) => setBible("palette", e.target.value)} />
        </Field>
        <Field label="Line quality">
          <input className={inputCls} value={b.lineQuality} onChange={(e) => setBible("lineQuality", e.target.value)} />
        </Field>
        <Field label="Mood">
          <input className={inputCls} value={b.mood} onChange={(e) => setBible("mood", e.target.value)} />
        </Field>
        <Field label="Motifs">
          <input
            className={inputCls}
            value={b.motifs.join(", ")}
            onChange={(e) => setBible("motifs", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          />
        </Field>
        <Field label="Never draw">
          <input
            className={inputCls}
            value={b.negative.join(", ")}
            onChange={(e) => setBible("negative", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          />
        </Field>
      </div>

      {err && <ErrorNote>{err}</ErrorNote>}
    </Card>
  );
}
