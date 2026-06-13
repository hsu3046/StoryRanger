"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { duplicateStoryAction } from "../_actions/duplicateStory";

/**
 * Per-story "Duplicate" affordance on the dashboard card. Collapsed to a pill
 * button; expands into a tiny inline form (new id + title — both optional,
 * with the convention defaults shown as placeholders). No asset copying
 * happens — see duplicateStoryAction.
 */
export function DuplicateStoryForm({
  sourceId,
  sourceTitle,
}: {
  sourceId: string;
  sourceTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await duplicateStoryAction({ sourceId, newId, newTitle });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setNewId("");
      setNewTitle("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Roomier than the DashLink pills — the ⧉ glyph is taller than the
        // latin text and clipped under py-1.
        className="inline-flex items-center gap-1.5 rounded-pill bg-paper-deep/70 px-4 py-2 text-base font-medium leading-none text-ink-soft ring-1 ring-ink-soft/15 transition-colors hover:bg-paper-deep"
      >
        {/* No trailing "…" — the opens-a-form convention reads as TRUNCATED
            text on this pill (user feedback). */}
        <span aria-hidden>⧉</span> Duplicate
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-card bg-paper-deep/40 p-3">
      <p className="text-xs text-ink-soft">
        Duplicates content only — art, music and map stay shared with{" "}
        <code className="rounded bg-paper px-1">{sourceId}</code> until a
        scene/character is regenerated in the duplicate.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          placeholder={`${sourceId}-copy`}
          disabled={pending}
          className="min-w-[220px] flex-1 rounded-card bg-paper px-4 py-2 text-base text-ink ring-1 ring-ink-soft/15 outline-none placeholder:text-ink-soft/50 focus:ring-accent/50"
          aria-label="New story id"
        />
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={`${sourceTitle} (Copy)`}
          disabled={pending}
          className="min-w-[220px] flex-1 rounded-card bg-paper px-4 py-2 text-base text-ink ring-1 ring-ink-soft/15 outline-none placeholder:text-ink-soft/50 focus:ring-accent/50"
          aria-label="New story title"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center rounded-pill bg-accent-deep px-5 py-2 text-base font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Duplicating" : "Duplicate"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
          className="inline-flex items-center rounded-pill px-4 py-2 text-base text-ink-soft hover:text-ink"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
