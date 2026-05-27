/**
 * Auto-layout for the story graph using dagre.
 * Returns positions keyed by scene id. Inputs are the scene graph; outputs
 * are pixel x/y for each node.
 */

import dagre from "@dagrejs/dagre";
import type { SceneT } from "@/data/schemas";

const NODE_WIDTH = 280;
const NODE_HEIGHT = 240;
const NODE_SEP = 160;
const RANK_SEP = 260;

export function computeLayout(
  scenes: Record<string, SceneT>,
): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: NODE_SEP, ranksep: RANK_SEP });
  g.setDefaultEdgeLabel(() => ({}));

  for (const id of Object.keys(scenes)) {
    g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const [id, scene] of Object.entries(scenes)) {
    for (const b of scene.branches) {
      if (scenes[b.next]) g.setEdge(id, b.next);
    }
  }

  dagre.layout(g);

  const out: Record<string, { x: number; y: number }> = {};
  for (const id of Object.keys(scenes)) {
    const n = g.node(id) as { x: number; y: number } | undefined;
    if (n) out[id] = { x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 };
  }
  return out;
}

export const SCENE_NODE_SIZE = {
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
};
