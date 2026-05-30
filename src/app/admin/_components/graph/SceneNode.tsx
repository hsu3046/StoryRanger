"use client";

import { memo } from "react";
import { Flag } from "@phosphor-icons/react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SceneT } from "@/data/schemas";
import type { SpeakerId } from "@/types/story";
import { AssetThumb } from "../AssetThumb";

export interface SceneNodeData {
  sceneId: string;
  scene: SceneT;
  isStart: boolean;
  /** Terminal/ending scene — derived from connectivity (no branch leads to an
   *  existing scene), not the manual flag. Computed by the graph editor. */
  isEnding: boolean;
  /** Story id — needed to resolve dialogue portrait paths. */
  storyId: string;
  /** The story's protagonist id — its dialogue portrait lives at `hero.*`. */
  heroId: SpeakerId;
  selected?: boolean;
  [key: string]: unknown;
}

function dialoguePortrait(
  storyId: string,
  id: SpeakerId,
  heroId: SpeakerId,
): string {
  // The hero's portrait lives under `hero.*` (generic-protagonist art);
  // every other character matches its id 1:1.
  const filename = id === heroId ? "hero" : id;
  return `/stories/${storyId}/dialogue/${filename}`;
}

export const SceneNode = memo(function SceneNode({ data, selected }: NodeProps) {
  const d = data as unknown as SceneNodeData;
  const { sceneId, scene, isStart, isEnding, storyId, heroId } = d;
  const dialogueChars = scene.dialogueCharacters ?? [];

  const accent = isEnding
    ? "bg-ruby text-paper"
    : isStart
      ? "bg-emerald text-paper"
      : "bg-paper-deep/30 text-ink-soft";

  // Top-right badge: ending / start take priority; otherwise the speaker —
  // but "narrator" is the default voice, so we hide it to cut visual noise.
  const speakerBadge = isEnding ? (
    <span className="inline-flex items-center gap-0.5">
      <Flag size={11} weight="fill" aria-hidden />
      Ending
    </span>
  ) : isStart ? (
    "▶ Start"
  ) : scene.speaker !== "narrator" ? (
    scene.speaker
  ) : null;

  return (
    // `transition-colors` (not `transition-all`): React Flow drags by
    // mutating CSS `transform: translate(...)`, and `transition-all` would
    // queue a CSS animation on every frame's transform change, fighting
    // the drag and causing visible flicker/jitter across the whole graph.
    // No `overflow-hidden` here — it would clip the connection dots (which sit
    // half outside the node border). Corner-rounding is re-established on the
    // banner (top) below; the bottom is plain `bg-paper` which the root's own
    // border-radius already clips.
    <div
      className={`group relative flex h-[240px] w-[280px] flex-col rounded-card-lg border-2 bg-paper shadow-card transition-colors ${
        selected
          ? "border-accent-deep ring-2 ring-accent/40"
          : "border-ink-soft/15"
      }`}
    >
      {/* Connection dots: hidden at rest, revealed on node hover (or while the
          node is selected) so the canvas stays clean. `!z-10` keeps them above
          the banner/text, which paint later in DOM order. */}
      <Handle
        type="target"
        position={Position.Left}
        className={`!z-10 !h-4 !w-4 !border-2 !border-paper !bg-ink-soft/50 !opacity-0 !transition-opacity !duration-150 group-hover:!opacity-100 ${
          selected ? "!opacity-100" : ""
        }`}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={`!z-10 !h-4 !w-4 !border-2 !border-paper !bg-accent-deep !opacity-0 !transition-opacity !duration-150 group-hover:!opacity-100 ${
          selected ? "!opacity-100" : ""
        }`}
      />

      {/* Image banner — generous height so 16:9-ish scene art reads clearly.
          `rounded-t-[18px]` (root 20px − 2px border) restores the card's top
          corners now that the root no longer clips with overflow-hidden. */}
      <div className="relative h-40 w-full overflow-hidden rounded-t-[18px] bg-paper-deep/40">
        <AssetThumb
          base={scene.image}
          alt={sceneId}
          className="h-full w-full"
          shape="banner"
          fit="cover"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-paper to-transparent" />
        <div className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1">
          <code className="rounded-pill bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-ink shadow-soft">
            {sceneId}
          </code>
        </div>
        {speakerBadge && (
          <div className="pointer-events-none absolute right-1.5 top-1.5">
            <span
              className={`inline-flex items-center justify-center rounded-pill px-1.5 py-0.5 text-[10px] font-semibold leading-none ${accent}`}
            >
              {speakerBadge}
            </span>
          </div>
        )}
      </div>

      {/* Text + footer */}
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="line-clamp-3 flex-1 text-[11px] leading-snug text-ink-soft">
          {scene.narration}
        </p>

        <div className="flex items-center justify-between gap-1 text-[10px] text-ink-soft/70">
          <span className="flex items-center gap-2">
            <span>
              {scene.branches.length} branch
              {scene.branches.length === 1 ? "" : "es"}
            </span>
            {(scene.asks?.length ?? 0) > 0 && (
              <span>
                {scene.asks!.length} ask
                {scene.asks!.length === 1 ? "" : "s"}
              </span>
            )}
          </span>
          {dialogueChars.length > 0 && (
            <div className="flex items-center gap-0.5">
              {dialogueChars.map((id) => (
                <AssetThumb
                  key={id}
                  base={dialoguePortrait(storyId, id, heroId)}
                  alt={id}
                  className="h-5 w-5"
                  shape="circle"
                  fit="cover"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
