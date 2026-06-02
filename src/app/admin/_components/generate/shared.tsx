"use client";

import Link from "next/link";
import type { DraftMetaT, DraftStageT } from "@/data/schemas";
import type { PoolStatus } from "./useGenerationPool";

/** Build the next meta after a stage completes — marks it done + advances the
 *  current stage. (storyId/updatedAt are re-stamped server-side.) */
export function advanceMeta(
  meta: DraftMetaT,
  doneStage: DraftStageT,
  nextStage: DraftStageT,
): DraftMetaT {
  return {
    ...meta,
    currentStage: nextStage,
    stageStatuses: { ...meta.stageStatuses, [doneStage]: "done" },
  };
}

/** POST JSON, throwing the server's `error` string on a non-2xx. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* keep status */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const STAGES: { id: DraftStageT; label: string }[] = [
  { id: "concept", label: "Concept" },
  { id: "storyboard", label: "Storyboard" },
  { id: "characters", label: "Characters" },
  { id: "scenes", label: "Scenes" },
  { id: "narration", label: "Narration" },
  { id: "images", label: "Images" },
  { id: "review", label: "Review" },
];

export function StepRail({
  draftId,
  current,
}: {
  draftId: string;
  current: DraftStageT;
}) {
  const curIdx = STAGES.findIndex((s) => s.id === current);
  return (
    <nav className="flex flex-wrap items-center gap-1.5">
      {STAGES.map((s, i) => {
        const active = s.id === current;
        const done = i < curIdx;
        return (
          <Link
            key={s.id}
            href={`/admin/generate/${draftId}/${s.id}`}
            className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
              active
                ? "bg-accent-deep text-paper"
                : done
                  ? "bg-paper-deep/60 text-ink"
                  : "bg-paper-deep/30 text-ink-soft/70 hover:bg-paper-deep/50"
            }`}
          >
            <span className="tabular-nums opacity-70">{i + 1}</span>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

const STATUS_COLOR: Record<PoolStatus, string> = {
  queued: "bg-ink-soft/30",
  running: "bg-amber-400 animate-pulse",
  done: "bg-emerald-500",
  failed: "bg-ruby",
};

export function StatusDot({ status }: { status: PoolStatus | undefined }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
        status ? STATUS_COLOR[status] : "bg-ink-soft/20"
      }`}
      aria-hidden
    />
  );
}

/** A bordered section card matching the admin look. */
export function Card({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card-lg bg-paper p-4 ring-1 ring-ink-soft/10">
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3">
          {title && (
            <h3 className="text-base font-semibold text-ink">{title}</h3>
          )}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1.5 rounded-pill bg-accent-deep px-4 py-1.5 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1.5 rounded-pill bg-paper-deep/60 px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-ink-soft/10 transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-card bg-ruby/10 px-3 py-2 text-sm text-ruby ring-1 ring-ruby/20">
      {children}
    </p>
  );
}
