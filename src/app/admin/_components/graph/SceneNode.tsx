"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SceneT } from "@/data/schemas";
import type { SpeakerId } from "@/types/story";
import { AssetThumb } from "../AssetThumb";

export interface SceneNodeData {
  sceneId: string;
  scene: SceneT;
  isStart: boolean;
  /** Story id — needed to resolve dialogue portrait paths. */
  storyId: string;
  selected?: boolean;
  [key: string]: unknown;
}

function dialoguePortrait(storyId: string, id: SpeakerId): string {
  // Hero (speakerId "dorothy") lives under `hero.*` per the player's
  // convention; every other character matches its id 1:1.
  const filename = id === "dorothy" ? "hero" : id;
  return `/stories/${storyId}/dialogue/${filename}`;
}

export const SceneNode = memo(function SceneNode({ data, selected }: NodeProps) {
  const d = data as unknown as SceneNodeData;
  const { sceneId, scene, isStart, storyId } = d;
  const isEnding = !!scene.ending;
  const dialogueChars = scene.dialogueCharacters ?? [];

  const accent = isEnding
    ? "bg-accent-deep text-paper"
    : isStart
      ? "bg-emerald text-paper"
      : "bg-paper-deep/30 text-ink-soft";

  return (
    // `transition-colors` (not `transition-all`): React Flow drags by
    // mutating CSS `transform: translate(...)`, and `transition-all` would
    // queue a CSS animation on every frame's transform change, fighting
    // the drag and causing visible flicker/jitter across the whole graph.
    <div
      className={`flex h-[240px] w-[280px] flex-col overflow-hidden rounded-card-lg border-2 bg-paper shadow-card transition-colors ${
        selected
          ? "border-accent-deep ring-2 ring-accent/40"
          : "border-ink-soft/15"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !bg-ink-soft/40"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !bg-accent-deep"
      />

      {/* Image banner — generous height so 16:9-ish scene art reads clearly */}
      <div className="relative h-40 w-full overflow-hidden bg-paper-deep/40">
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
        <div className="pointer-events-none absolute right-1.5 top-1.5">
          <span
            className={`rounded-pill px-1.5 py-0.5 text-[10px] font-semibold ${accent}`}
          >
            {isEnding ? "🏁 ending" : isStart ? "▶ Start" : scene.speaker}
          </span>
        </div>
      </div>

      {/* Text + footer */}
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="line-clamp-3 flex-1 text-[11px] leading-snug text-ink-soft">
          {scene.narration}
        </p>

        <div className="flex items-center justify-between gap-1 text-[10px] text-ink-soft/70">
          <span>
            {scene.branches.length} branch
            {scene.branches.length === 1 ? "" : "es"}
          </span>
          {dialogueChars.length > 0 && (
            <div className="flex items-center gap-0.5">
              {dialogueChars.map((id) => (
                <AssetThumb
                  key={id}
                  base={dialoguePortrait(storyId, id)}
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
