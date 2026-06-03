"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ConceptT, DraftMetaT } from "@/data/schemas";
import { saveConceptAction, saveDraftMetaAction } from "../../_actions/generateDraft";
import { Field, inputCls } from "../form";
import { advanceMeta, Card, ErrorNote, GhostButton, postJson, PrimaryButton } from "./shared";

interface Props {
  draftId: string;
  brief: string;
  language: string;
  meta: DraftMetaT;
  initialConcept: ConceptT | null;
}

export function ConceptStep({ draftId, brief, language, meta, initialConcept }: Props) {
  const router = useRouter();
  const [concept, setConcept] = useState<ConceptT | null>(initialConcept);
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  async function generate() {
    setErr(null);
    setBusy("gen");
    try {
      const res = await postJson<{ concept: ConceptT }>("/api/admin/generate/concept", {
        brief,
        language,
      });
      setConcept(res.concept);
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

  function saveContinue() {
    if (!concept) return;
    setErr(null);
    setBusy("save");
    start(async () => {
      const a = await saveConceptAction(draftId, concept);
      if (!a.ok) {
        setErr(a.error);
        setBusy(null);
        return;
      }
      await saveDraftMetaAction(draftId, advanceMeta(meta, "concept", "storyboard"));
      router.push(`/admin/generate/${draftId}/storyboard`);
    });
  }

  if (!concept) {
    return (
      <Card title="Concept">
        <p className="text-sm text-ink-soft">
          Turn the brief into a title, premise, themes, and an art-style bible.
        </p>
        <p className="rounded-card bg-paper-deep/40 px-3 py-2 text-sm text-ink-soft">
          <span className="font-semibold text-ink">Brief: </span>
          {brief || <em>(none — add one in the brief)</em>}
        </p>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex justify-end">
          <PrimaryButton onClick={generate} disabled={busy === "gen"}>
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
        <GhostButton onClick={generate} disabled={busy !== null}>
          {busy === "gen" ? "Regenerating…" : "↻ Regenerate"}
        </GhostButton>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={inputCls} value={concept.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Subtitle">
          <input className={inputCls} value={concept.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
        </Field>
      </div>
      <Field label="Premise / tone">
        <textarea className={`${inputCls} min-h-20`} value={concept.premise} onChange={(e) => set("premise", e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Themes" hint="comma-separated">
          <input
            className={inputCls}
            value={concept.themes.join(", ")}
            onChange={(e) => set("themes", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          />
        </Field>
        <Field label="Target age">
          <div className="flex items-center gap-2">
            <input
              type="number"
              className={inputCls}
              value={concept.targetAge.min}
              onChange={(e) => set("targetAge", { ...concept.targetAge, min: Number(e.target.value) || 0 })}
            />
            <span className="text-ink-soft">–</span>
            <input
              type="number"
              className={inputCls}
              value={concept.targetAge.max}
              onChange={(e) => set("targetAge", { ...concept.targetAge, max: Number(e.target.value) || 0 })}
            />
          </div>
        </Field>
        <Field label="Minutes">
          <input
            type="number"
            className={inputCls}
            value={concept.estimatedMinutes}
            onChange={(e) => set("estimatedMinutes", Number(e.target.value) || 0)}
          />
        </Field>
      </div>

      <h4 className="mt-1 text-sm font-semibold text-accent-deep">Art-style bible</h4>
      <div className="grid gap-3 sm:grid-cols-2">
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
        <Field label="Motifs" hint="comma-separated">
          <input
            className={inputCls}
            value={b.motifs.join(", ")}
            onChange={(e) => setBible("motifs", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          />
        </Field>
        <Field label="Never draw" hint="comma-separated">
          <input
            className={inputCls}
            value={b.negative.join(", ")}
            onChange={(e) => setBible("negative", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          />
        </Field>
      </div>

      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex justify-end">
        <PrimaryButton onClick={saveContinue} disabled={busy !== null}>
          {busy === "save" ? "Saving…" : "Save & continue →"}
        </PrimaryButton>
      </div>
    </Card>
  );
}
