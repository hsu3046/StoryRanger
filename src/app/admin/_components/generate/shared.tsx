"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
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
  { id: "scene", label: "Scene" },
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
    <nav className="flex w-full items-center gap-1">
      {STAGES.map((s, i) => {
        const active = s.id === current;
        const done = i < curIdx;
        return (
          <Fragment key={s.id}>
            <Link
              href={`/admin/generate/${draftId}/${s.id}`}
              className={`inline-flex flex-1 items-center justify-center rounded-pill px-2 py-1 text-xs font-semibold transition-colors ${
                active
                  ? "bg-accent-deep text-paper"
                  : done
                    ? "bg-paper-deep/60 text-ink"
                    : "bg-paper-deep/30 text-ink-soft/70 hover:bg-paper-deep/50"
              }`}
            >
              {s.label}
            </Link>
            {i < STAGES.length - 1 && (
              <ArrowRight
                weight="bold"
                className="h-3.5 w-3.5 shrink-0 text-ink-soft/40"
                aria-hidden
              />
            )}
          </Fragment>
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
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3">
          {title &&
            (typeof title === "string" ? (
              <h3 className="text-base font-semibold text-ink">{title}</h3>
            ) : (
              <div className="flex items-center gap-3 text-base font-semibold text-ink">
                {title}
              </div>
            ))}
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
      className="inline-flex items-center justify-center gap-1.5 rounded-pill bg-accent-deep px-4 py-1.5 text-sm font-semibold text-paper transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
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
      className="inline-flex items-center justify-center gap-1.5 rounded-pill bg-paper-deep/60 px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-ink-soft/10 transition hover:bg-paper-deep active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
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
