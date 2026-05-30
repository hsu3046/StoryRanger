"use client";

import { memo, useRef } from "react";
import { Lock, PuzzlePiece } from "@phosphor-icons/react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import type { BranchT } from "@/data/schemas";
import { MONSTERS } from "@/data/monsters";
import { AssetThumb } from "../AssetThumb";

export interface BranchEdgeData {
  branch: BranchT;
  /** Index among parallel edges sharing the same (source, target) pair. */
  parallelIdx?: number;
  /** Total number of parallel edges in that group. */
  parallelCount?: number;
  /** Encounters triggered on this branch, each with its OWN battle count
   *  (`trigger.count`, default 1) + deduped monster ids. Rendered one group per
   *  encounter so the ×N reflects per-encounter battles, not encounter count. */
  encounters?: { count: number; monsterIds: string[] }[];
  /** Story id — needed to resolve companion portrait paths
   *  (`/stories/<storyId>/dialogue/<companion>.{webp,png,…}`). */
  storyId: string;
  /** Manual curve control-point offset (from the natural midpoint). When set,
   *  the edge bends through it — dragged via the handle shown when selected. */
  offset?: { x: number; y: number };
  /** Persist a dragged offset. `commit` = drag-end (write to storage); pass
   *  `offset:null` to reset to the default curve. */
  onOffsetChange?: (
    id: string,
    offset: { x: number; y: number } | null,
    commit: boolean,
  ) => void;
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
  const { screenToFlowPosition } = useReactFlow();
  const draggingRef = useRef(false);

  // Default bezier (its label point is the natural curve midpoint we measure
  // the manual offset against).
  const [defaultPath, bezMidX, bezMidY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const off = d?.offset;
  const onOffsetChange = d?.onOffsetChange;
  // The handle is the point the curve passes THROUGH (= natural midpoint +
  // manual offset), so it stays under the cursor while dragging. A quadratic's
  // apex sits halfway to its control point, so to make the curve pass through
  // the handle we solve the control point backwards: C = 2·handle − chordMid.
  const chordMidX = (sourceX + targetX) / 2;
  const chordMidY = (sourceY + targetY) / 2;
  const handleX = bezMidX + (off?.x ?? 0);
  const handleY = bezMidY + (off?.y ?? 0);
  const ctrlX = 2 * handleX - chordMidX;
  const ctrlY = 2 * handleY - chordMidY;
  const edgePath = off
    ? `M ${sourceX},${sourceY} Q ${ctrlX},${ctrlY} ${targetX},${targetY}`
    : defaultPath;
  const labelX = off ? handleX : bezMidX;
  const labelY = off ? handleY : bezMidY;

  function dragOffset(e: React.PointerEvent) {
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    return { x: p.x - bezMidX, y: p.y - bezMidY };
  }
  function onHandleDown(e: React.PointerEvent) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    draggingRef.current = true;
  }
  function onHandleMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    onOffsetChange?.(id, dragOffset(e), false);
  }
  function onHandleUp(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    onOffsetChange?.(id, dragOffset(e), true);
  }

  // Companion-join chip: a small pill carrying the companion's portrait
  // thumbnail + "join" label. Portrait comes from the same dialogue path
  // the SceneNode uses, kept in sync via AssetThumb's extension fallback.
  const companionId = branch?.addsCompanion ?? null;
  const storyId = d?.storyId;
  // Battle + puzzle indicators are rendered as bare icons (no background
  // pill) so they read as graphic markers, not labels. Both use the same
  // glyphs as the admin sidebar's Encounters / Puzzle items so authors
  // can map menu → graph at a glance.
  const encounterGroups = d?.encounters ?? [];
  const hasEncounters = encounterGroups.length > 0;
  const hasChallenge = !!branch?.challenge?.enabled;

  // Visibility gate marker — only when at least one clause is actually set.
  const condItems = branch?.condition?.hasItems ?? [];
  const condCompanions = branch?.condition?.hasCompanions ?? [];
  const hasCondition = condItems.length > 0 || condCompanions.length > 0;
  const conditionTitle = hasCondition
    ? `Shown only if: ${[...condItems, ...condCompanions].join(", ")}`
    : "";

  // Parallel-edge offset — when multiple branches connect the same source
  // and target, the bezier midpoints coincide. Spread labels vertically so
  // they don't stack on top of each other.
  const parallelIdx = d?.parallelIdx ?? 0;
  const parallelCount = d?.parallelCount ?? 1;
  // Spread parallel labels only on the default (un-bent) curve; a manually
  // bent edge already carries its label along the dragged control point.
  const offsetY =
    !off && parallelCount > 1
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
          className="flex flex-col items-center gap-2.5"
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
          {(companionId || hasEncounters || hasChallenge || hasCondition) && (
            <div className="flex max-w-[260px] flex-wrap items-center justify-center gap-2">
              {hasCondition && (
                <span
                  title={conditionTitle}
                  className="flex items-center text-accent-deep"
                >
                  <Lock size={18} weight="duotone" />
                </span>
              )}
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
              {/* One group per encounter. The ×N is THIS encounter's own
                  battle count (trigger.count, default 1) — not the number of
                  encounters — so it only shows when a single encounter repeats. */}
              {storyId &&
                encounterGroups.map((enc, gi) => (
                  <span
                    key={gi}
                    title={
                      enc.count > 1
                        ? `Encounter — ${enc.count} battles`
                        : "Encounter — 1 battle"
                    }
                    className="flex items-center gap-1 whitespace-nowrap text-ruby"
                  >
                    {/* Monster icons (red border) stand in for the old ⚔
                        marker. Capped so a big pool doesn't overflow. */}
                    {enc.monsterIds.slice(0, 4).map((mid) => (
                      <AssetThumb
                        key={mid}
                        base={
                          MONSTERS[mid]?.image ??
                          `/stories/${storyId}/monsters/${mid}`
                        }
                        alt={mid}
                        className="h-5 w-5"
                        shape="circle"
                        // Full-body monster sprites — `contain` shrinks the
                        // whole sprite to fit inside the small circle (cover
                        // cropped/oversized it). Paper fill + a little inner
                        // padding so the sprite sits on a clean disc and its
                        // corners aren't clipped by the round mask.
                        fit="contain"
                        ringColor="#b03333"
                        ringWidth={1.0}
                        bgColor="#fdf6e3"
                        pad={3}
                      />
                    ))}
                    {enc.count > 1 && (
                      <span className="text-[10px] font-semibold">
                        ×{enc.count}
                      </span>
                    )}
                  </span>
                ))}
              {hasChallenge && (
                <span
                  title="Educational challenge must be solved to take this branch"
                  className="flex items-center text-accent-deep"
                >
                  <PuzzlePiece size={20} weight="duotone" />
                </span>
              )}
            </div>
          )}
        </div>

        {/* Drag handle — appears when the edge is selected. Drag to push/pull
            the curve; double-click to reset to the default route. */}
        {selected && (
          <div
            title="Drag to bend · double-click to reset"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onOffsetChange?.(id, null, true);
            }}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${handleX}px, ${handleY}px)`,
              pointerEvents: "all",
              touchAction: "none",
              zIndex: 1001,
            }}
            // `nopan` stops React Flow's canvas-pan from hijacking the drag.
            className="nopan h-3.5 w-3.5 cursor-grab rounded-full border-2 border-paper bg-accent-deep shadow-soft active:cursor-grabbing active:scale-110"
          />
        )}
      </EdgeLabelRenderer>
    </>
  );
});
