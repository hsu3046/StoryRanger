"use client";

import { useCallback, useRef, useState } from "react";

export type PoolStatus = "queued" | "running" | "done" | "failed";
export interface PoolEntry {
  status: PoolStatus;
  error?: string;
}

/**
 * Bounded-concurrency runner for the fan-out stages (narration, images). Tracks
 * per-key status so the UI can render a live grid/list with per-item retry.
 */
export function useGenerationPool() {
  const [entries, setEntries] = useState<Record<string, PoolEntry>>({});
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  const update = useCallback((key: string, patch: Partial<PoolEntry>) => {
    setEntries((prev) => {
      const existing: PoolEntry = prev[key] ?? { status: "queued" };
      return { ...prev, [key]: { ...existing, ...patch } };
    });
  }, []);

  const setStatus = useCallback(
    (map: Record<string, PoolEntry>) => setEntries(map),
    [],
  );

  const run = useCallback(
    async (
      keys: string[],
      worker: (key: string) => Promise<void>,
      concurrency = 3,
    ) => {
      cancelRef.current = false;
      setRunning(true);
      setEntries((prev) => {
        const next = { ...prev };
        for (const k of keys) next[k] = { status: "queued" };
        return next;
      });
      let idx = 0;
      const loop = async () => {
        while (idx < keys.length && !cancelRef.current) {
          const k = keys[idx++];
          update(k, { status: "running", error: undefined });
          try {
            await worker(k);
            update(k, { status: "done" });
          } catch (e) {
            update(k, {
              status: "failed",
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      };
      const n = Math.max(1, Math.min(concurrency, keys.length || 1));
      await Promise.all(Array.from({ length: n }, () => loop()));
      setRunning(false);
    },
    [update],
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const markDone = useCallback((keys: string[]) => {
    setEntries((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = { status: "done" };
      return next;
    });
  }, []);

  return { entries, running, run, cancel, update, setStatus, markDone };
}
