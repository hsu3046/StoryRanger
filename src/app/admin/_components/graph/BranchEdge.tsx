"use client";

import { memo } from "react";
import { PuzzlePiece, Sword } from "@phosphor-icons/react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { BranchT } from "@/data/schemas";
import { AssetThumb } from "../AssetThumb";

export interface BranchEdgeData {
  branch: BranchT;
  /** Index among parallel edges sharing the same (source, target) pair. */
  parallelIdx?: number;
  /** Total number of parallel edges in that group. */
  parallelCount?: number;
  /** How many battle encounters trigger on this branch. Drives the ⚔ chip. */
  encounterCount?: number;
  /** Story id — needed to resolve companion portrait paths
   *  (`/stories/<storyId>/dialogue/<companion>.{webp,png,…}`). */
  storyId: string;
  [key: string]: unknown;
}

export const BranchEdge = memo(function BranchEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    data,
    markerEnd,
  } = props;
  const d = (data as unknown as BranchEdgeData) ?? null;
  const branch = d?.branch;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  // Companion-join chip: a small pill carrying the companion's portrait
  // thumbnail + "join" label. Portrait comes from the same dialogue path
  // the SceneNode uses, kept in sync via AssetThumb's extension fallback.
  const companionId = branch?.addsCompanion ?? null;
  const storyId = d?.storyId;
  // Battle + puzzle indicators are rendered as bare icons (no background
  // pill) so they read as graphic markers, not labels. Both use the same
  // glyphs as the admin sidebar's Encounters / Puzzle items so authors
  // can map menu → graph at a glance.
  const encounterCount = d?.encounterCount ?? 0;
  const hasPuzzle = !!branch?.puzzle;

  // Parallel-edge offset — when multiple branches connect the same source
  // and target, the bezier midpoints coincide. Spread labels vertically so
  // they don't stack on top of each other.
  const parallelIdx = d?.parallelIdx ?? 0;
  const parallelCount = d?.parallelCount ?? 1;
  // Centre the group around the path midpoint, then space rows by 70px.
  const offsetY =
    parallelCount > 1
      ? (parallelIdx - (parallelCount - 1) / 2) * 70
      : 0;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? "#7a4f0e" : "rgba(91,65,40,0.45)",
          strokeWidth: selected ? 2 : 1.2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + offsetY}px)`,
            pointerEvents: "all",
            // React Flow's default node z-index is 1; bump labels well above
            // so they never get hidden when the dagre layout routes edges
            // close to / through nodes.
            zIndex: 1000,
          }}
          className="flex flex-col items-center gap-1"
        >
          {branch && (
            // No `backdrop-blur` here — the filter forces the browser to
            // re-rasterize + re-blur the canvas content behind every label
            // on every drag frame, which lights up GPU compositing and
            // produces visible whole-graph flicker. Solid bg + shadow is
            // enough to keep labels legible over node art.
            <span
              className={`max-w-[200px] truncate rounded-pill px-2.5 py-1 text-[11px] font-semibold shadow-card ring-1 ${
                selected
                  ? "bg-accent-deep text-paper ring-accent"
                  : "bg-paper text-ink ring-ink-soft/20"
              }`}
              title={branch.label}
            >
              {branch.label}
            </span>
          )}
          {(companionId || encounterCount > 0 || hasPuzzle) && (
            <div className="flex max-w-[260px] flex-wrap items-center justify-center gap-2">
              {companionId && storyId && (
                <span
                  title={`${companionId} joins party`}
                  className="flex items-center gap-1 whitespace-nowrap rounded-pill bg-accent/20 py-0.5 pl-0.5 pr-2 text-[10px] font-semibold text-accent-deep shadow-soft"
                >
                  <AssetThumb
                    base={`/stories/${storyId}/dialogue/${companionId}`}
                    alt={companionId}
                    className="h-5 w-5"
                    shape="circle"
                    fit="cover"
                    ringWidth={0}
                  />
                  Join
                </span>
              )}
              {encounterCount > 0 && (
                <span
                  title={
                    encounterCount === 1
                      ? "1 battle encounter triggers on this branch"
                      : `${encounterCount} battle encounters trigger on this branch`
                  }
                  className="flex items-center gap-0.5 whitespace-nowrap text-ruby"
                >
                  <Sword size={20} weight="duotone" />
                  {encounterCount > 1 && (
                    <span className="text-[10px] font-semibold">×{encounterCount}</span>
                  )}
                </span>
              )}
              {hasPuzzle && (
                <span
                  title="Gating puzzle must be solved to take this branch"
                  className="flex items-center text-accent-deep"
                >
                  <PuzzlePiece size={20} weight="duotone" />
                </span>
              )}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
