"use client";

import { useEffect, useRef } from "react";

import type { DraftMetaT, DraftStageT } from "@/data/schemas";
import { saveDraftMetaAction } from "../../_actions/generateDraft";

/** Mark this stage as the draft's current one (for resume) when it's opened. */
export function useStageVisit(draftId: string, meta: DraftMetaT, stage: DraftStageT) {
  useEffect(() => {
    if (meta.currentStage !== stage) {
      void saveDraftMetaAction(draftId, { currentStage: stage });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Live flush callbacks for the mounted step's autosaves. StepRail awaits these
// before navigating so the next step's server render reads fresh JSON.
const pendingFlushes = new Set<() => unknown>();

/** Persist every mounted autosave NOW and wait for the writes to land. Called
 *  before wizard navigation so a just-edited field can't race the next step. */
export function flushPendingAutosaves(): Promise<unknown> {
  return Promise.allSettled([...pendingFlushes].map((f) => Promise.resolve(f())));
}

/**
 * Debounced autosave + flush-on-unmount, plus registration in
 * `pendingFlushes` so navigation can await the save. With the per-step "Save &
 * continue" buttons gone, edits persist automatically. The `save` callback may
 * return a promise — it's awaited on an explicit flush (navigation) so the
 * next step never reads stale disk data.
 */
export function useAutosave<T>(
  data: T,
  save: (data: T) => unknown,
  { delay = 1000, enabled = true }: { delay?: number; enabled?: boolean } = {},
) {
  const dataRef = useRef(data);
  const saveRef = useRef(save);
  const enabledRef = useRef(enabled);
  const mountedRef = useRef(false);

  // Keep refs current (after each render) so flushes see the latest.
  useEffect(() => {
    dataRef.current = data;
    saveRef.current = save;
    enabledRef.current = enabled;
  });

  // Debounced save while editing.
  useEffect(() => {
    // Skip the seed value (already on disk from the initial render). This also
    // lets callers use `enabled: true` without a fragile "differs from initial"
    // gate — a field edited and then reset back to its initial value still
    // re-saves, instead of silently leaving stale text on disk.
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (!enabled) return;
    const t = setTimeout(() => {
      if (enabledRef.current) saveRef.current(dataRef.current);
    }, delay);
    return () => clearTimeout(t);
  }, [data, enabled, delay]);

  // Register a flush for navigation, and flush on unmount.
  useEffect(() => {
    const flush = () =>
      enabledRef.current ? saveRef.current(dataRef.current) : undefined;
    pendingFlushes.add(flush);
    return () => {
      pendingFlushes.delete(flush);
      flush();
    };
  }, []);
}
