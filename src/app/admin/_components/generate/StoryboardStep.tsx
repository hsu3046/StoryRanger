"use client";

import { useState } from "react";
import { CaretDown, CaretUp, DotsSixVertical } from "@phosphor-icons/react";

import type {
  ConceptT,
  DraftMetaT,
  StoryboardBeatT,
  StoryboardT,
} from "@/data/schemas";
import { saveStoryboardAction } from "../../_actions/generateDraft";
import { useConfirm } from "../ConfirmDialog";
import { inputClsSm } from "../form";
import { RegenerateButton } from "./RegenerateButton";
import { Card, ErrorNote, postJson, PrimaryButton } from "./shared";
import { useAutosave, useStageVisit } from "./useAutosave";

// LLM generation clamp (the first "Generate"); manual editing can go beyond.
const GEN_MIN = 5;
const GEN_MAX = 12;
const GEN_DEFAULT = 8;
// Manual add/remove bounds once beats exist.
const MANUAL_MIN = 1;
const MANUAL_MAX = 16;

// Beat ids are an INTERNAL correlation handle only (the page stage records
// which beat each page came from). They're never the final scene key
// (scenes are re-keyed scene-1..N) and never shown to the user — so they just
// need to be unique. New/manual beats get an auto id; saves de-dup silently.
function freshBeatId(existing: Set<string>): string {
  let n = existing.size + 1;
  let id = `beat-${n}`;
  while (existing.has(id)) id = `beat-${++n}`;
  return id;
}
function emptyBeat(id: string): StoryboardBeatT {
  return { id, title: "", synopsis: "", isEnding: false, endingLabel: "", branches: [] };
}

/** Linear-flow normalization applied on save: start = first beat, ending =
 *  last beat, and de-duplicated internal ids. */
function normalizeStoryboard(sb: StoryboardT): StoryboardT {
  const last = sb.beats.length - 1;
  const usedIds = new Set<string>();
  const beats = sb.beats.map((b, i) => {
    let id = b.id;
    if (!id || usedIds.has(id)) id = freshBeatId(usedIds);
    usedIds.add(id);
    return {
      ...b,
      id,
      isEnding: i === last,
      endingLabel: i === last ? b.endingLabel.trim() || "The End" : "",
    };
  });
  return { ...sb, startSceneId: beats[0]?.id ?? sb.startSceneId, beats };
}

function Stepper({
  value,
  onDec,
  onInc,
  decDisabled,
  incDisabled,
}: {
  value: number;
  onDec: () => void;
  onInc: () => void;
  decDisabled: boolean;
  incDisabled: boolean;
}) {
  const btn =
    "rounded-pill bg-paper-deep/60 px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-ink-soft/10 hover:bg-paper-deep disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
      <button type="button" aria-label="Remove beat" disabled={decDisabled} onClick={onDec} className={btn}>
        −
      </button>
      <span className="w-5 text-center text-sm font-semibold tabular-nums text-ink">{value}</span>
      <button type="button" aria-label="Add beat" disabled={incDisabled} onClick={onInc} className={btn}>
        +
      </button>
    </span>
  );
}

export function StoryboardStep({ draftId, concept, meta, initialStoryboard }: {
  draftId: string;
  concept: ConceptT;
  meta: DraftMetaT;
  initialStoryboard: StoryboardT | null;
}) {
  const confirm = useConfirm();
  const [sb, setSb] = useState<StoryboardT | null>(initialStoryboard);
  const [genCount, setGenCount] = useState(
    initialStoryboard?.beats.length || GEN_DEFAULT,
  );
  const [busy, setBusy] = useState<"gen" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useAutosave(sb, (s) => { if (s) void saveStoryboardAction(draftId, normalizeStoryboard(s)); }, {
    enabled: !!sb,
  });
  useStageVisit(draftId, meta, "storyboard");

  async function generate(authorRequest?: string, count?: number) {
    setErr(null);
    setBusy("gen");
    try {
      const beatCount = count ?? (sb ? sb.beats.length : genCount);
      const res = await postJson<{ storyboard: StoryboardT }>(
        "/api/admin/generate/storyboard",
        { concept, beatCount, authorRequest },
      );
      setSb(res.storyboard);
      setGenCount(res.storyboard.beats.length);
      void saveStoryboardAction(draftId, normalizeStoryboard(res.storyboard));
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
  function addBeat() {
    setSb((s) => {
      if (!s || s.beats.length >= MANUAL_MAX) return s;
      const id = freshBeatId(new Set(s.beats.map((b) => b.id)));
      return { ...s, beats: [...s.beats, emptyBeat(id)] };
    });
  }
  async function removeLastBeat() {
    const cur = sb;
    if (!cur || cur.beats.length <= MANUAL_MIN) return;
    const last = cur.beats[cur.beats.length - 1];
    if (last.synopsis.trim()) {
      const ok = await confirm({
        title: "Remove this beat?",
        message: `Beat ${cur.beats.length} has content:\n\n"${last.synopsis.trim()}"\n\nRemove it?`,
        confirmLabel: "Remove",
      });
      if (!ok) return;
    }
    setSb((s) => (s ? { ...s, beats: s.beats.slice(0, -1) } : s));
  }
  function moveBeat(from: number, to: number) {
    setSb((s) => {
      if (!s || from === to) return s;
      const beats = [...s.beats];
      const [m] = beats.splice(from, 1);
      beats.splice(to, 0, m);
      return { ...s, beats };
    });
  }

  // ── Empty state — first generation; the stepper sets the LLM beat count ──
  if (!sb) {
    return (
      <Card title="Storyboard">
        <p className="text-sm text-ink-soft">
          Lay out the story&apos;s overall flow as a short, linear list of beats.
          Choices, branches, and battles are added later in the story graph.
        </p>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex items-center justify-end gap-3">
          <Stepper
            value={genCount}
            onDec={() => setGenCount((n) => Math.max(GEN_MIN, n - 1))}
            onInc={() => setGenCount((n) => Math.min(GEN_MAX, n + 1))}
            decDisabled={genCount <= GEN_MIN}
            incDisabled={genCount >= GEN_MAX}
          />
          <PrimaryButton onClick={() => generate()} disabled={busy === "gen"}>
            {busy === "gen" ? "Generating…" : "✨ Generate storyboard"}
          </PrimaryButton>
        </div>
      </Card>
    );
  }

  const busyAny = busy !== null;
  return (
    <Card
      title={
        <>
          <span>Storyboard</span>
          <Stepper
            value={sb.beats.length}
            onDec={() => void removeLastBeat()}
            onInc={addBeat}
            decDisabled={busyAny || sb.beats.length <= MANUAL_MIN}
            incDisabled={busyAny || sb.beats.length >= MANUAL_MAX}
          />
        </>
      }
      actions={
        <RegenerateButton
          busy={busy === "gen"}
          disabled={busyAny}
          title="Revise the storyboard"
          examples={[
            "Add a twist in the middle",
            "A bittersweet ending",
            "More about the friendship",
            "Slower build-up",
          ]}
          count={{
            initial: Math.min(Math.max(sb.beats.length, GEN_MIN), GEN_MAX),
            min: GEN_MIN,
            max: GEN_MAX,
            label: "Beats",
          }}
          onRegenerate={generate}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {sb.beats.map((beat, idx) => (
          <div
            key={beat.id}
            onDragOver={(e) => {
              if (dragIdx !== null) {
                e.preventDefault();
                setDragOverIdx(idx);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIdx !== null) moveBeat(dragIdx, idx);
              setDragIdx(null);
              setDragOverIdx(null);
            }}
            className={`flex flex-col gap-1 ${dragIdx === idx ? "opacity-50" : ""}`}
          >
            <div className="flex items-center gap-2 px-1">
              <span
                draggable
                onDragStart={(e) => {
                  setDragIdx(idx);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragIdx(null);
                  setDragOverIdx(null);
                }}
                className="cursor-grab text-ink-soft/60 hover:text-ink-soft active:cursor-grabbing"
                aria-label="Drag to reorder"
                title="Drag to reorder"
              >
                <DotsSixVertical weight="bold" className="h-4 w-4" />
              </span>
              <span className="text-xs font-semibold tabular-nums text-ink-soft">{idx + 1}</span>
              <button
                type="button"
                aria-label="Move up"
                disabled={idx === 0}
                onClick={() => moveBeat(idx, idx - 1)}
                className="text-ink-soft/60 hover:text-ink disabled:opacity-30"
              >
                <CaretUp weight="bold" className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={idx === sb.beats.length - 1}
                onClick={() => moveBeat(idx, idx + 1)}
                className="text-ink-soft/60 hover:text-ink disabled:opacity-30"
              >
                <CaretDown weight="bold" className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              className={`${inputClsSm} min-h-20 ${
                dragOverIdx === idx && dragIdx !== idx ? "ring-2 ring-accent" : ""
              }`}
              value={beat.synopsis}
              onChange={(e) => patchBeat(idx, { synopsis: e.target.value })}
              placeholder="What happens in this beat?"
            />
          </div>
        ))}
      </div>

      {err && <ErrorNote>{err}</ErrorNote>}
    </Card>
  );
}
