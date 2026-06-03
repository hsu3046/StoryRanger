"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type {
  ConceptT,
  DraftMetaT,
  StoryboardBeatT,
  StoryboardT,
} from "@/data/schemas";
import { saveDraftMetaAction, saveStoryboardAction } from "../../_actions/generateDraft";
import { inputClsSm, StyledSelect } from "../form";
import { advanceMeta, Card, ErrorNote, GhostButton, postJson, PrimaryButton } from "./shared";

interface Props {
  draftId: string;
  concept: ConceptT;
  meta: DraftMetaT;
  initialStoryboard: StoryboardT | null;
}

function lint(sb: StoryboardT): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = sb.beats.map((b) => b.id);
  const idSet = new Set(ids);
  // Duplicate beat ids collapse to one scene key in assembly (one scene
  // overwrites the other) — block save, matching the API-side storyboard lint.
  const seenBeat = new Set<string>();
  for (const id of ids) {
    if (seenBeat.has(id)) errors.push(`duplicate beat id "${id}"`);
    seenBeat.add(id);
  }
  if (!idSet.has(sb.startSceneId)) errors.push(`startSceneId "${sb.startSceneId}" is not a beat`);
  for (const beat of sb.beats) {
    const seenBranch = new Set<string>();
    for (const br of beat.branches) {
      if (!idSet.has(br.next)) errors.push(`${beat.id} → "${br.label}" points to missing beat "${br.next}"`);
      if (seenBranch.has(br.id)) errors.push(`${beat.id} has duplicate branch id "${br.id}"`);
      seenBranch.add(br.id);
    }
    if (!beat.isEnding && beat.branches.length === 0) warnings.push(`${beat.id} is a dead end`);
  }
  return { errors, warnings };
}

export function StoryboardStep({ draftId, concept, meta, initialStoryboard }: Props) {
  const router = useRouter();
  const [sb, setSb] = useState<StoryboardT | null>(initialStoryboard);
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  const lintResult = useMemo(() => (sb ? lint(sb) : null), [sb]);
  const beatIds = sb?.beats.map((b) => b.id) ?? [];

  async function generate() {
    setErr(null);
    setBusy("gen");
    try {
      const res = await postJson<{ storyboard: StoryboardT }>("/api/admin/generate/storyboard", { concept });
      setSb(res.storyboard);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function patchBeat(idx: number, patch: Partial<StoryboardBeatT>) {
    setSb((s) =>
      s ? { ...s, beats: s.beats.map((b, i) => (i === idx ? { ...b, ...patch } : b)) } : s,
    );
  }

  function saveContinue() {
    if (!sb) return;
    setErr(null);
    setBusy("save");
    start(async () => {
      const a = await saveStoryboardAction(draftId, sb);
      if (!a.ok) {
        setErr(a.error);
        setBusy(null);
        return;
      }
      await saveDraftMetaAction(draftId, advanceMeta(meta, "storyboard", "characters"));
      router.push(`/admin/generate/${draftId}/characters`);
    });
  }

  if (!sb) {
    return (
      <Card title="Storyboard">
        <p className="text-sm text-ink-soft">
          Lay out the beats (pages) and the branch structure from the concept.
        </p>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex justify-end">
          <PrimaryButton onClick={generate} disabled={busy === "gen"}>
            {busy === "gen" ? "Generating…" : "✨ Generate storyboard"}
          </PrimaryButton>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={`Storyboard · ${sb.beats.length} beats`}
      actions={
        <GhostButton onClick={generate} disabled={busy !== null}>
          {busy === "gen" ? "Regenerating…" : "↻ Regenerate"}
        </GhostButton>
      }
    >
      {lintResult && (lintResult.errors.length > 0 || lintResult.warnings.length > 0) && (
        <div className="flex flex-col gap-1 rounded-card bg-paper-deep/40 px-3 py-2 text-xs">
          {lintResult.errors.map((e, i) => (
            <span key={`e${i}`} className="text-ruby">⚠ {e}</span>
          ))}
          {lintResult.warnings.map((w, i) => (
            <span key={`w${i}`} className="text-amber-600">• {w}</span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-ink-soft">
        <span className="font-semibold uppercase tracking-wide">Start</span>
        <StyledSelect
          compact
          value={sb.startSceneId}
          onChange={(e) => setSb((s) => (s ? { ...s, startSceneId: e.target.value } : s))}
          className="max-w-[16rem]"
        >
          {beatIds.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </StyledSelect>
      </div>

      <div className="flex flex-col gap-3">
        {sb.beats.map((beat, idx) => (
          <div key={beat.id} className="rounded-card bg-paper-deep/30 p-3 ring-1 ring-ink-soft/10">
            <div className="mb-2 flex items-center justify-between gap-2">
              <code className="rounded-pill bg-paper px-2 py-0.5 text-xs text-ink-soft">{beat.id}</code>
              <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  checked={beat.isEnding}
                  onChange={(e) => patchBeat(idx, { isEnding: e.target.checked })}
                />
                ending
              </label>
            </div>
            <textarea
              className={`${inputClsSm} mb-2 min-h-12`}
              value={beat.synopsis}
              onChange={(e) => patchBeat(idx, { synopsis: e.target.value })}
              placeholder="synopsis"
            />
            <div className="mb-2 grid gap-2 sm:grid-cols-2">
              <input
                className={inputClsSm}
                value={beat.speaker}
                onChange={(e) => patchBeat(idx, { speaker: e.target.value })}
                placeholder="speaker (narrator / id)"
              />
              <input
                className={inputClsSm}
                value={beat.setting}
                onChange={(e) => patchBeat(idx, { setting: e.target.value })}
                placeholder="setting (location, time)"
              />
            </div>
            {beat.isEnding ? (
              <input
                className={inputClsSm}
                value={beat.endingLabel}
                onChange={(e) => patchBeat(idx, { endingLabel: e.target.value })}
                placeholder="ending label"
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                {beat.branches.map((br, bi) => (
                  <div key={br.id} className="flex items-center gap-2">
                    <input
                      className={inputClsSm}
                      value={br.label}
                      onChange={(e) =>
                        patchBeat(idx, {
                          branches: beat.branches.map((x, j) => (j === bi ? { ...x, label: e.target.value } : x)),
                        })
                      }
                      placeholder="choice label"
                    />
                    <span className="text-xs text-ink-soft">→</span>
                    <StyledSelect
                      compact
                      value={br.next}
                      onChange={(e) =>
                        patchBeat(idx, {
                          branches: beat.branches.map((x, j) => (j === bi ? { ...x, next: e.target.value } : x)),
                        })
                      }
                      className="max-w-[12rem]"
                    >
                      <option value={br.next}>{br.next}</option>
                      {beatIds.filter((id) => id !== br.next).map((id) => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </StyledSelect>
                    <button
                      type="button"
                      className="text-xs text-ruby"
                      onClick={() =>
                        patchBeat(idx, { branches: beat.branches.filter((_, j) => j !== bi) })
                      }
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="self-start text-xs text-accent-deep"
                  onClick={() => {
                    const used = new Set(beat.branches.map((b) => b.id));
                    let n = beat.branches.length + 1;
                    let id = `b${n}`;
                    while (used.has(id)) id = `b${++n}`;
                    patchBeat(idx, {
                      branches: [
                        ...beat.branches,
                        { id, label: "New choice", next: beatIds[0] ?? beat.id, outcomeHint: "" },
                      ],
                    });
                  }}
                >
                  + add choice
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex justify-end">
        <PrimaryButton
          onClick={saveContinue}
          disabled={busy !== null || (lintResult?.errors.length ?? 0) > 0}
        >
          {busy === "save" ? "Saving…" : "Save & continue →"}
        </PrimaryButton>
      </div>
    </Card>
  );
}
