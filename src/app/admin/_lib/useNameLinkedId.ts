"use client";

import { useState } from "react";
import { slugify } from "./slugify";
import { uniqueId } from "./uniqueId";

/**
 * Keeps a freshly-created object's id in sync with the name/label the author
 * types — `slugify(name)` deduped with `_2/_3` — UNTIL either:
 *   • the author edits the id by hand (`detach`), or
 *   • the object is saved (`reset`).
 *
 * Saved / pre-existing ids are never auto-changed, because an id doubles as a
 * stable reference (scene.speaker, branch.addsCompanions, …) and an asset-path
 * slug (`characters/<id>`, `dialogue/<id>`); rewriting one post-save would
 * break those. Field-agnostic — works for `id` or `key`.
 *
 * Usage in an editor:
 *   const link = useNameLinkedId();
 *   // on "+ Add": link.register(newDraftId)
 *   // name onChange: const nid = link.fromName(cur.id, value, otherIds);
 *   //                update({ ...cur, name: value, ...(nid && { id: nid }) })
 *   // id onChange (manual): link.detach(cur.id); update({ ...cur, id: slug })
 *   // save() success / discard: link.reset()
 */
export function useNameLinkedId() {
  // The ids still tracking their name. Stored as state so re-renders see the
  // current set; mutated only via functional updates.
  const [autoIds, setAutoIds] = useState<Set<string>>(() => new Set());

  /** Mark a just-created id as auto-following its name. */
  function register(id: string) {
    setAutoIds((s) => new Set(s).add(id));
  }

  /** Stop auto-following (author took manual control of the id). */
  function detach(id: string) {
    setAutoIds((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }

  /** Freeze every tracked id (call after a successful save / on discard). */
  function reset() {
    setAutoIds((s) => (s.size ? new Set() : s));
  }

  /**
   * Name changed: if `currentId` is still auto-linked, return the id derived
   * from `name` (deduped against `otherIds` — pass every id EXCEPT this one).
   * Returns `null` when the id should be left alone (not linked, or unchanged).
   */
  function fromName(
    currentId: string,
    name: string,
    otherIds: Iterable<string>,
  ): string | null {
    if (!autoIds.has(currentId)) return null;
    const next = uniqueId(slugify(name) || currentId, otherIds);
    if (next === currentId) return null;
    setAutoIds((s) => {
      const updated = new Set(s);
      updated.delete(currentId);
      updated.add(next);
      return updated;
    });
    return next;
  }

  return { register, detach, reset, fromName };
}
