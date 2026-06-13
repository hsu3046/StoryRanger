"use server";

import {
  commitContent,
  contentStatus,
  currentBranch,
  pushCurrent,
  syncR2,
  type ContentChange,
} from "../_lib/git";
import { ensureDev, errorMessage } from "../_lib/contentFs";

/**
 * "Publish" server actions — turn the manual git-commit → push → R2-sync chain
 * into one-click operations from the admin dashboard. Dev-only (same gate as
 * every content write; the filesystem is read-only on Vercel anyway).
 */

export interface PublishStatus {
  branch: string;
  changes: ContentChange[];
  /** A sensible default commit message derived from the changed story ids. */
  suggestedMessage: string;
}

/** Derive `content(<ids>): update authored content` from the changed paths,
 *  pulling each story id out of `.../stories/<id>/...`. Falls back to a
 *  generic message when only global content changed. */
function suggestMessage(changes: ContentChange[]): string {
  const ids = new Set<string>();
  let touchedGlobal = false;
  for (const c of changes) {
    const m = c.path.match(/stories\/([a-z0-9_-]+)\//);
    if (m) ids.add(m[1]);
    else if (c.path.includes("src/data/global/")) touchedGlobal = true;
  }
  const scope = [...ids].slice(0, 3).join(", ") || (touchedGlobal ? "global" : "");
  return scope
    ? `content(${scope}): update authored content`
    : "content: update authored content";
}

export async function getPublishStatusAction(): Promise<
  { ok: true; status: PublishStatus } | { ok: false; error: string }
> {
  ensureDev();
  try {
    const [branch, changes] = await Promise.all([
      currentBranch(),
      contentStatus(),
    ]);
    return {
      ok: true,
      status: { branch, changes, suggestedMessage: suggestMessage(changes) },
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function commitContentAction(input: {
  message: string;
  /** Push the branch after committing. Off by default — pushing the default
   *  branch triggers a production deploy, so it must be a deliberate opt-in. */
  push?: boolean;
}): Promise<
  { ok: true; oid: string; files: string[]; pushed: boolean } | { ok: false; error: string }
> {
  ensureDev();
  try {
    const message = input.message.trim();
    if (!message) return { ok: false, error: "Commit message is required." };
    const changes = await contentStatus();
    if (changes.length === 0) {
      return { ok: false, error: "No content changes to commit." };
    }
    const { oid, files } = await commitContent(message);
    let pushed = false;
    if (input.push) {
      await pushCurrent();
      pushed = true;
    }
    return { ok: true, oid, files, pushed };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function syncR2Action(input?: {
  dryRun?: boolean;
}): Promise<{ ok: true; output: string } | { ok: false; error: string }> {
  ensureDev();
  try {
    const output = await syncR2(input?.dryRun ?? false);
    return { ok: true, output };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
