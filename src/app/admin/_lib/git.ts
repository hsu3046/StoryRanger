/**
 * Git + asset-sync helpers for the admin "Publish" panel (dev-only).
 *
 * The admin content actions write JSON/images to disk, but reflecting them
 * requires git commit → push → R2 sync — three manual steps that are easy to
 * forget (a saved-but-uncommitted edit silently vanishes on branch switch).
 * These helpers turn those steps into one-click server actions.
 *
 * Scope discipline: every git op is restricted to CONTENT_PATHS, so a commit
 * from this panel can NEVER sweep in unrelated code changes. Plain server
 * utilities (not a "use server" module) so the action layer composes them.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pExecFile = promisify(execFile);

/** The only paths the Publish panel ever stages. `src/stories` covers the
 *  per-story JSON + `index.ts` + `_registry.generated.ts`; `src/data/global`
 *  covers medals/voices/art-styles; `public/stories` covers all media. */
export const CONTENT_PATHS = [
  "src/stories",
  "src/data/global",
  "public/stories",
] as const;

/** Run a git subcommand at the repo root (process.cwd()). Throws with stderr
 *  on non-zero exit. maxBuffer raised for large `status` / `push` output. */
async function git(args: string[]): Promise<string> {
  const { stdout } = await pExecFile("git", args, {
    cwd: process.cwd(),
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout;
}

export interface ContentChange {
  /** Two-char porcelain status (e.g. " M", "??", "A "). */
  status: string;
  path: string;
}

/** Parse `git status --porcelain` lines (scoped to CONTENT_PATHS) into a
 *  typed list. Renames ("R  old -> new") report the new path. */
export async function contentStatus(): Promise<ContentChange[]> {
  const out = await git([
    "status",
    "--porcelain",
    "--",
    ...CONTENT_PATHS,
  ]);
  const changes: ContentChange[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2);
    let path = line.slice(3);
    const arrow = path.indexOf(" -> ");
    if (arrow !== -1) path = path.slice(arrow + 4); // rename → new path
    changes.push({ status, path });
  }
  return changes;
}

export async function currentBranch(): Promise<string> {
  return (await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
}

/** Stage CONTENT_PATHS and commit. Returns the new commit's short oid + the
 *  files it touched. Caller MUST check `contentStatus()` first — committing
 *  with nothing staged throws ("nothing to commit"). */
export async function commitContent(
  message: string,
): Promise<{ oid: string; files: string[] }> {
  await git(["add", "--", ...CONTENT_PATHS]);
  // `--only` so even a dirty index outside CONTENT_PATHS can't ride along.
  await git(["commit", "--only", "-m", message, "--", ...CONTENT_PATHS]);
  const oid = (await git(["rev-parse", "--short", "HEAD"])).trim();
  const files = (
    await git(["show", "--name-only", "--pretty=format:", "HEAD"])
  )
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return { oid, files };
}

/** Push the current branch to its upstream (or set it on first push). */
export async function pushCurrent(): Promise<string> {
  const branch = await currentBranch();
  // -u so a brand-new branch gets its upstream; harmless on an existing one.
  return git(["push", "-u", "origin", branch]);
}

/** Run the repo's R2 mirror script (scripts/sync-r2.sh). `aws s3 sync` only
 *  uploads changed files, so after the first run this is fast. Returns the
 *  tail of its output for display. */
export async function syncR2(dryRun = false): Promise<string> {
  const args = ["scripts/sync-r2.sh"];
  if (dryRun) args.push("--dryrun");
  const { stdout, stderr } = await pExecFile("bash", args, {
    cwd: process.cwd(),
    maxBuffer: 16 * 1024 * 1024,
  });
  const combined = `${stdout}\n${stderr}`.trim();
  // Keep the last ~40 lines — the sync list can be long.
  return combined.split("\n").slice(-40).join("\n");
}
