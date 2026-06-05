"use client";

import { useEffect, useRef } from "react";

import type { DraftMetaT, DraftStageT } from "@/data/schemas";
import { saveDraftMetaAction } from "../../_actions/generateDraft";

/** Mark this stage as the draft's current one (for resume) when it's opened. */
export function useStageVisit(draftId: string, meta: DraftMetaT, stage: DraftStageT) {
  useEffect(() => {
    if (meta.currentStage !== stage) {
      void saveDraftMetaAction(draftId, { ...meta, currentStage: stage });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Debounced autosave + flush-on-unmount. With the per-step "Save & continue"
 * buttons gone, edits persist automatically: `save` runs `delay`ms after the
 * last change and once more when the component unmounts (so switching tabs or
 * leaving the page never loses work). `enabled` gates it (skip until data
 * exists). The save is fire-and-forget — generation actions persist their
 * result immediately so navigation never races an unsaved big change.
 */
export function useAutosave<T>(
  data: T,
  save: (data: T) => void,
  { delay = 1000, enabled = true }: { delay?: number; enabled?: boolean } = {},
) {
  const dataRef = useRef(data);
  const saveRef = useRef(save);
  const enabledRef = useRef(enabled);

  // Keep refs current (after each render) so the unmount flush sees the latest.
  useEffect(() => {
    dataRef.current = data;
    saveRef.current = save;
    enabledRef.current = enabled;
  });

  // Debounced save while editing.
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => {
      if (enabledRef.current) saveRef.current(dataRef.current);
    }, delay);
    return () => clearTimeout(t);
  }, [data, enabled, delay]);

  // Flush once on unmount (tab/page navigation).
  useEffect(
    () => () => {
      if (enabledRef.current) saveRef.current(dataRef.current);
    },
    [],
  );
}
