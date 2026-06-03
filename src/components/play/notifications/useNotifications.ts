"use client";

import { useCallback, useRef, useState } from "react";
import type { Notif } from "./types";

/**
 * Input to `push` — everything on Notif except the generated `id`, plus:
 *  - `id` (optional): supply a stable id (e.g. `medal:<id>`) so the same event
 *    pushed twice is idempotent and distinct ones stack.
 *  - `replace` (optional): when true, any existing notification of the SAME
 *    kind is removed first — the latest-wins / single-slot feel used by item
 *    and companion (medals omit it so several medals stack).
 */
export type NotifInput = Omit<Notif, "id"> & { id?: string; replace?: boolean };

/**
 * One in-memory queue for ALL top notifications (medal / item / companion).
 * Replaces the former three separate useState slots + their hardcoded vertical
 * stack offsets — NotificationStack renders this queue as a single column.
 */
export function useNotifications() {
  const [queue, setQueue] = useState<Notif[]>([]);
  const idRef = useRef(0);

  const push = useCallback((input: NotifInput) => {
    const { id: explicitId, replace, ...rest } = input;
    // Generate the id OUTSIDE the updater so a StrictMode double-invoke of the
    // updater can't desync it; explicit ids keep same-event pushes idempotent.
    const id = explicitId ?? `${rest.kind}:${idRef.current++}`;
    setQueue((q) => {
      const base = replace
        ? q.filter((n) => n.kind !== rest.kind)
        : q.filter((n) => n.id !== id);
      return [...base, { id, ...rest }];
    });
  }, []);

  const dismiss = useCallback(
    (id: string) => setQueue((q) => q.filter((n) => n.id !== id)),
    [],
  );

  const clear = useCallback(() => setQueue([]), []);

  return { queue, push, dismiss, clear };
}
