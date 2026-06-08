"use client";

import { useCallback, useEffect, useRef } from "react";

import type { PlayState } from "@/types/story";
import { loadState, saveState } from "./storage";
import { loadRemotePlayState, upsertRemotePlayState } from "./play-sync";

/** Trailing debounce for the DB upsert. Local writes stay instant; the DB only
 *  needs the latest state, and state changes on nearly every interaction. */
const DEBOUNCE_MS = 1800;

/**
 * Progress persistence for the player. Always writes localStorage instantly
 * (offline + zero-latency). When `syncToDb` (the real "play" slot, not the
 * admin demo/preview), it ALSO debounce-upserts to Supabase and flushes on tab
 * hide, and loads DB-first (cross-device) with a localStorage fallback.
 */
export function usePlayStateSync(slot: string, syncToDb: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<PlayState | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const s = pending.current;
    if (s && syncToDb) {
      pending.current = null;
      void upsertRemotePlayState(s);
    }
  }, [syncToDb]);

  // Flush the pending DB write when the tab is hidden / closed.
  useEffect(() => {
    if (!syncToDb) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [syncToDb, flush]);

  /** DB-first load (cross-device), falling back to the local save. */
  const load = useCallback(
    async (storyId: string): Promise<PlayState | null> => {
      if (syncToDb) {
        const remote = await loadRemotePlayState(storyId);
        if (remote) return remote;
      }
      return loadState(storyId, slot);
    },
    [slot, syncToDb],
  );

  /** Instant local write + debounced DB upsert. */
  const persist = useCallback(
    (state: PlayState) => {
      saveState(state, slot);
      if (!syncToDb) return;
      pending.current = state;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [slot, syncToDb, flush],
  );

  return { load, persist, flush };
}
