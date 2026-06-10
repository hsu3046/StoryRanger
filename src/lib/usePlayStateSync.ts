"use client";

import { useCallback, useEffect, useRef } from "react";

import type { PlayState } from "@/types/story";
import { loadState, saveState } from "./storage";
import {
  loadRemotePlayState,
  upsertRemotePlayState,
  flushRemotePlayState,
  claimLocalCacheOwnership,
  migrateLocalToRemoteOnce,
  reconcileReview,
} from "./play-sync";

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
      // keepalive variant — flush fires on pagehide/unmount, where a normal
      // fetch (and the getUser() round-trip before it) is aborted with the
      // closing tab and the last debounce window of progress never lands.
      void flushRemotePlayState(s);
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

  /** Load progress, newest-wins. The DB is the cross-device source of truth,
   *  but a failed prior upsert or offline play can leave a FRESHER local save —
   *  so compare `updatedAt` and don't let a stale remote copy clobber newer
   *  local progress. When local wins, re-upload so the DB catches up. */
  const load = useCallback(
    async (storyId: string): Promise<PlayState | null> => {
      if (!syncToDb) return loadState(storyId, slot);
      // Wipe a previous account's local cache (shared browser) BEFORE reading it,
      // so stale local can't win over / upload to this user's remote save.
      await claimLocalCacheOwnership();
      // A direct /play deep-link after login bypasses the home screen's
      // migration — run it here too so a first-login local save + review reaches
      // the DB before we read local. Idempotent (one-time flag + in-flight guard).
      await migrateLocalToRemoteOnce();
      // Fold this story's local misses into a state-only / empty-review remote
      // row (the home screen does this for all stories; direct /play needs it
      // per-story). Fire-and-forget — review is independent of the play state.
      void reconcileReview(storyId);
      const remote = await loadRemotePlayState(storyId);
      const local = loadState(storyId, slot);
      if (remote && local) {
        const localT = Date.parse(local.updatedAt ?? "") || 0;
        const remoteT = Date.parse(remote.updatedAt ?? "") || 0;
        if (localT > remoteT) {
          void upsertRemotePlayState(local);
          return local;
        }
      }
      if (remote) {
        // Mirror the chosen remote into the local slot so a later offline /
        // signed-out load keeps it (StoryPlayer skips persisting the just-loaded
        // object, so without this the localStorage copy would stay stale). No DB
        // re-upsert — the DB already has this exact state.
        saveState(remote, slot);
        return remote;
      }
      return local;
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
