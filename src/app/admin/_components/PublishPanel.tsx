"use client";

import { useEffect, useState, useTransition } from "react";

import {
  commitContentAction,
  getPublishStatusAction,
  syncR2Action,
  type PublishStatus,
} from "../_actions/publishContent";

/**
 * Dashboard "Publish" panel — one-click commit / push / R2-sync for authored
 * content, replacing the manual `git add … && git commit && git push &&
 * ./scripts/sync-r2.sh` chain. Scoped to content paths (see _lib/git.ts), so
 * a commit here never touches code.
 *
 * Push is a deliberate opt-in (default off) because pushing the default
 * branch deploys to production. Asset sync is independent of git.
 */
export function PublishPanel() {
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [push, setPush] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [syncOut, setSyncOut] = useState<string | null>(null);
  const [loadingPending, startLoading] = useTransition();
  const [commitPending, startCommit] = useTransition();
  const [syncPending, startSync] = useTransition();

  function refresh() {
    setError(null);
    startLoading(async () => {
      const res = await getPublishStatusAction();
      if (!res.ok) {
        setError(res.error);
        setStatus(null);
        return;
      }
      setStatus(res.status);
      // Only seed the message while the author hasn't typed their own.
      setMessage((m) => m || res.status.suggestedMessage);
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only load of git status (deferred via startTransition)
    refresh();
  }, []);

  function commit() {
    setError(null);
    setResult(null);
    startCommit(async () => {
      const res = await commitContentAction({ message, push });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(
        `Committed ${res.oid} (${res.files.length} file${res.files.length === 1 ? "" : "s"})${res.pushed ? " · pushed" : ""}.`,
      );
      setMessage("");
      refresh();
    });
  }

  function sync(dryRun: boolean) {
    setError(null);
    setSyncOut(null);
    startSync(async () => {
      const res = await syncR2Action({ dryRun });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSyncOut(res.output || "(no output)");
    });
  }

  const changeCount = status?.changes.length ?? 0;
  const busy = loadingPending || commitPending || syncPending;

  return (
    <div className="flex flex-col gap-3 rounded-card-lg bg-paper p-4 ring-1 ring-ink-soft/10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-ink">Publish</h3>
          <span className="rounded-pill bg-paper-deep/60 px-2 py-0.5 text-xs text-ink-soft">
            {status ? `${changeCount} content change${changeCount === 1 ? "" : "s"}` : "…"}
          </span>
          {status && (
            <code className="rounded-pill bg-paper-deep/40 px-2 py-0.5 text-xs text-ink-soft">
              {status.branch}
            </code>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="rounded-pill bg-paper-deep/70 px-3 py-1 text-sm text-ink-soft hover:bg-paper-deep disabled:opacity-50"
        >
          ↻ Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {result && <p className="text-sm text-emerald-700">{result}</p>}

      {/* Changed files */}
      {status && changeCount > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-card bg-paper-deep/30 p-2 text-xs">
          {status.changes.map((c) => (
            <li key={c.path} className="flex gap-2 font-mono text-ink-soft">
              <span className="w-6 shrink-0 text-accent-deep">{c.status.trim() || "·"}</span>
              <span className="truncate">{c.path}</span>
            </li>
          ))}
        </ul>
      )}
      {status && changeCount === 0 && (
        <p className="text-sm text-ink-soft">No uncommitted content changes.</p>
      )}

      {/* Commit form */}
      {changeCount > 0 && (
        <div className="flex flex-col gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="content: describe the change"
            disabled={busy}
            className="rounded-card bg-paper px-4 py-2 text-base text-ink ring-1 ring-ink-soft/15 outline-none placeholder:text-ink-soft/50 focus:ring-accent/50"
            aria-label="Commit message"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={push}
                onChange={(e) => setPush(e.target.checked)}
                disabled={busy}
                className="h-4 w-4 accent-accent-deep"
              />
              Push after commit{" "}
              <span className="text-ruby">(deploys {status?.branch} to production)</span>
            </label>
            <button
              type="button"
              onClick={commit}
              disabled={busy || !message.trim()}
              className="inline-flex items-center rounded-pill bg-accent-deep px-5 py-2 text-base font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {commitPending ? "Committing" : push ? "Commit & Push" : "Commit"}
            </button>
          </div>
        </div>
      )}

      {/* Asset sync — independent of git */}
      <div className="flex flex-wrap items-center gap-2 border-t border-ink-soft/10 pt-3">
        <span className="text-sm text-ink-soft">Assets (R2 mirror):</span>
        <button
          type="button"
          onClick={() => sync(true)}
          disabled={busy}
          className="rounded-pill bg-paper-deep/70 px-4 py-2 text-sm text-ink-soft hover:bg-paper-deep disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => sync(false)}
          disabled={busy}
          className="rounded-pill bg-accent-deep/90 px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
        >
          {syncPending ? "Syncing" : "Sync to R2"}
        </button>
      </div>
      {syncOut && (
        <pre className="max-h-40 overflow-auto rounded-card bg-paper-deep/30 p-2 text-xs text-ink-soft">
          {syncOut}
        </pre>
      )}
    </div>
  );
}
