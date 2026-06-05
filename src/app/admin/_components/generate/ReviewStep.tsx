"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowsCounterClockwise } from "@phosphor-icons/react";

import type { DraftMetaT } from "@/data/schemas";
import type { ValidationIssue } from "../../_lib/validateStory";
import { commitDraftAction, validateDraftAction } from "../../_actions/generateDraft";
import { Card, ErrorNote, GhostButton, PrimaryButton } from "./shared";
import { useStageVisit } from "./useAutosave";

interface Props {
  draftId: string;
  meta: DraftMetaT;
  initialValidation: { errors: ValidationIssue[]; warnings: ValidationIssue[] };
}

export function ReviewStep({ draftId, meta, initialValidation }: Props) {
  const router = useRouter();
  const [val, setVal] = useState(initialValidation);
  const [busy, setBusy] = useState<"validate" | "commit" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [committed, setCommitted] = useState(meta.status === "committed");

  useStageVisit(draftId, meta, "review");

  async function revalidate() {
    setBusy("validate");
    setErr(null);
    const res = await validateDraftAction(draftId);
    if (res.ok) setVal({ errors: res.errors, warnings: res.warnings });
    else setErr(res.error);
    setBusy(null);
  }

  async function commit() {
    setBusy("commit");
    setErr(null);
    const res = await commitDraftAction(draftId);
    if (!res.ok) {
      setErr(res.error);
      setBusy(null);
      return;
    }
    setCommitted(true);
    setBusy(null);
    router.refresh();
  }

  const blocked = val.errors.length > 0;

  return (
    <Card
      title="Review & publish"
      actions={
        committed ? undefined : (
          <div className="flex items-center gap-2">
            <GhostButton onClick={revalidate} disabled={busy !== null}>
              <ArrowsCounterClockwise weight="bold" className="h-4 w-4" aria-hidden />
              {busy === "validate" ? "Validating…" : "Re-validate"}
            </GhostButton>
            <PrimaryButton onClick={commit} disabled={busy !== null || blocked}>
              {busy === "commit" ? "Publishing…" : "Publish story"}
            </PrimaryButton>
          </div>
        )
      }
    >
      {committed ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-card bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-500/20">
            ✓ Published. The story is registered and playable.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/play/${draftId}`}
              className="inline-flex items-center rounded-pill bg-accent-deep px-4 py-1.5 text-sm font-semibold text-paper hover:opacity-90"
            >
              ▶ Play /{draftId}
            </Link>
            <Link
              href={`/admin/stories/${draftId}/graph`}
              className="inline-flex items-center rounded-pill bg-paper-deep/60 px-4 py-1.5 text-sm font-medium text-ink ring-1 ring-ink-soft/10 hover:bg-paper-deep"
            >
              Story graph →
            </Link>
            <Link
              href={`/admin/stories/${draftId}/monsters`}
              className="inline-flex items-center rounded-pill bg-paper-deep/60 px-4 py-1.5 text-sm font-medium text-ink ring-1 ring-ink-soft/10 hover:bg-paper-deep"
            >
              Add battles / monsters →
            </Link>
          </div>
          <p className="text-xs text-ink-soft">
            Battles aren&apos;t auto-generated — add monsters/encounters in the
            Story Graph and they&apos;ll play in this story.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-soft">
            Validate the story graph, then publish to register it and make it
            playable. Errors block publishing; warnings are advisory.
          </p>

          {val.errors.length > 0 && (
            <div className="flex flex-col gap-1 rounded-card bg-ruby/10 px-3 py-2 ring-1 ring-ruby/20">
              <span className="text-xs font-semibold uppercase tracking-wide text-ruby">
                {val.errors.length} error{val.errors.length === 1 ? "" : "s"}
              </span>
              {val.errors.map((e, i) => (
                <span key={i} className="text-xs text-ruby">
                  • {e.where}: {e.message}
                </span>
              ))}
            </div>
          )}
          {val.warnings.length > 0 && (
            <div className="flex flex-col gap-1 rounded-card bg-amber-400/10 px-3 py-2 ring-1 ring-amber-400/20">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                {val.warnings.length} warning{val.warnings.length === 1 ? "" : "s"}
              </span>
              {val.warnings.map((w, i) => (
                <span key={i} className="text-xs text-amber-700">
                  • {w.where}: {w.message}
                </span>
              ))}
            </div>
          )}
          {val.errors.length === 0 && val.warnings.length === 0 && (
            <p className="rounded-card bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-500/20">
              ✓ No issues found.
            </p>
          )}

          {err && <ErrorNote>{err}</ErrorNote>}
        </>
      )}
    </Card>
  );
}
