"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Copy,
  Flag,
  GitBranch,
  PencilSimple,
  Play,
  Sparkle,
  TrashSimple,
  TreeStructure,
  X,
} from "@phosphor-icons/react";
import {
  Background,
  ControlButton,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  EncountersFileSchema,
  StorySchema,
  type BackgroundMetaT,
  type BranchT,
  type EncounterDefT,
  type ItemDefT,
  type MonsterStatsT,
  type SceneAskT,
  type SceneT,
  type StoryT,
} from "@/data/schemas";
import type {
  CharactersFile,
  CompanionId,
  MedalsFile,
  SpeakerId,
  Story,
} from "@/types/story";
import {
  saveEncountersAction,
  saveScenesAction,
} from "../../_actions/saveJson";
import { isTerminalScene } from "@/lib/story-engine";
import type { ChallengeCategory } from "@/lib/education";
import { AssetThumb } from "../AssetThumb";

/**
 * Dialogue-portrait fallback base = the character's in-scene sprite (honors
 * the `image` override). Used so a character lacking a dedicated
 * `/dialogue/<id>` head-shot (e.g. just added) still shows its sprite in the
 * graph chips instead of a "?" placeholder. The hero is never dialogue-able,
 * so the id slug needs no hero remap here.
 */
function dialogueFallbackBase(
  storyId: string,
  c: { id: string; image?: string },
): string {
  return c.image ?? `/stories/${storyId}/characters/${c.id}`;
}

/**
 * Primary dialogue-portrait base for a chip — the `dialogueImage` override if
 * set, else the `/dialogue/<id>` convention. Pair with `dialogueFallbackBase`
 * (the in-scene sprite) as the AssetThumb fallback.
 */
function dialoguePortraitBase(
  storyId: string,
  c: { id: string; dialogueImage?: string },
): string {
  return c.dialogueImage ?? `/stories/${storyId}/dialogue/${c.id}`;
}

/**
 * Companions in the party when the player ARRIVES at each scene — i.e. who has
 * joined (minus who has left) on a path from the start scene to that scene.
 * Computed as a graph fixpoint over branch `addsCompanion` / `removesCompanion`.
 *
 * Branching makes membership path-dependent, so this is the UNION across paths
 * ("possibly in the party here"). The branch editor uses it to show inherited
 * companions as already "joined" (→ clicking parts them) vs not-yet-joined
 * (→ clicking adds them). Either way the runtime is safe: re-adding a present
 * companion or removing an absent one is a no-op.
 */
function companionsArrivingByScene(
  scenes: Record<string, SceneT>,
  startScene: string,
): Record<string, Set<CompanionId>> {
  const arriving: Record<string, Set<CompanionId>> = {};
  if (scenes[startScene]) arriving[startScene] = new Set();
  let changed = true;
  let guard = 0;
  const maxPasses = Object.keys(scenes).length + 2;
  while (changed && guard < maxPasses) {
    changed = false;
    guard += 1;
    for (const [sid, scene] of Object.entries(scenes)) {
      const here = arriving[sid];
      if (!here) continue; // scene not yet reachable from start
      for (const b of scene.branches) {
        if (!scenes[b.next]) continue; // orphan target
        const leaving = new Set(here);
        if (b.addsCompanion) leaving.add(b.addsCompanion);
        if (b.removesCompanion) leaving.delete(b.removesCompanion);
        if (!arriving[b.next]) {
          arriving[b.next] = new Set();
          changed = true; // newly reachable → needs another pass
        }
        const target = arriving[b.next];
        for (const id of leaving) {
          if (!target.has(id)) {
            target.add(id);
            changed = true;
          }
        }
      }
    }
  }
  return arriving;
}
import { ItemChipPicker } from "../ItemChipPicker";
import { BgmSelectWithPreview } from "../BgmSelectWithPreview";
import { useAlert, useConfirm } from "../ConfirmDialog";
import { Field, StyledSelect, inputCls, inputClsSm } from "../form";
import { SceneNode, type SceneNodeData } from "./SceneNode";
import { BranchEdge, type BranchEdgeData } from "./BranchEdge";
import { computeLayout, computeLayoutConnected } from "./layout";
import { ScenePreviewModal } from "./ScenePreviewModal";

interface Props {
  storyId: string;
  initialStory: StoryT;
  initialEncounters: EncounterDefT[];
  /** For encounter authoring: monster + item catalogs used in dropdowns. */
  monsters: MonsterStatsT[];
  items: ItemDefT[];
  /** Background catalog used in the scene/encounter `bg` dropdowns. */
  backgrounds: BackgroundMetaT[];
  /** Scene image options — `value` = full path, `label` = short stem. */
  sceneImages: { value: string; label: string }[];
  /** BGM track keys discovered under /public/stories/<id>/audio/bgm/. */
  bgmOptions: string[];
  /** Runtime types passed straight through to the preview modal's
   *  StoryPlayer (the editor uses schema types `StoryT` for editing; the
   *  player wants the runtime `Story`/`MedalsFile`/`CharactersFile`). */
  runtimeStory: Story;
  runtimeMedalsFile: MedalsFile;
  runtimeCharactersFile: CharactersFile;
}

const nodeTypes = { scene: SceneNode };
const edgeTypes = { branch: BranchEdge };
// Module-level constants for ReactFlow props — passing inline literals
// (e.g. `proOptions={{ hideAttribution: true }}`) creates a fresh object
// on every render, which React Flow can't shallow-compare, leading to
// internal recomputation churn during drag.
const proOptions = { hideAttribution: true } as const;

type Selection =
  | { kind: "scene"; sceneId: string }
  | { kind: "branch"; sceneId: string; branchId: string }
  | null;

// `useNodesState`/`useEdgesState`/`useReactFlow` require a ReactFlowProvider
// ancestor. The exported `StoryGraphEditor` below wraps this inner component
// so callers don't have to think about it.
function StoryGraphEditorInner({
  storyId,
  initialStory,
  initialEncounters,
  monsters,
  items,
  backgrounds,
  sceneImages,
  bgmOptions,
  runtimeStory,
  runtimeMedalsFile,
  runtimeCharactersFile,
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const alert = useAlert();
  const [story, setStory] = useState<StoryT>(initialStory);
  const [encounters, setEncounters] =
    useState<EncounterDefT[]>(initialEncounters);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Per-scene preview modal target. Set by the Demo button in Scene /
  // Branch Inspector. null → modal closed.
  const [previewSceneId, setPreviewSceneId] = useState<string | null>(null);
  // When previewing a BRANCH (not a whole scene), the preview opens right after
  // this branch's choice. Null = scene preview / closed.
  const [previewBranchId, setPreviewBranchId] = useState<string | null>(null);
  // Held in a ref (not state) because we only need it inside event handlers
  // — putting it in state would re-render on init for no rendering reason.
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  // Manual node positions. Initialised from dagre auto-layout; overridden
  // by drag-to-move and persisted to localStorage so layouts stick across
  // reloads. "Auto-layout" button re-runs dagre.
  const positionKey = `storyranger:graph-positions:${storyId}`;
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >(() => computeLayout(initialStory.scenes));
  const [posHydrated, setPosHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(positionKey);
      if (raw) {
        const saved = JSON.parse(raw) as Record<
          string,
          { x: number; y: number }
        >;
        // Merge — saved positions win; new scenes still get dagre default
        setPositions((prev) => ({ ...prev, ...saved }));
      }
    } catch {
      /* swallow malformed storage */
    }
    setPosHydrated(true);
  }, [positionKey]);

  // Persist positions to localStorage — called from event handlers
  // (drag-end, auto-layout, addScene), NOT from a `positions`-effect.
  // Writing on every `positions` change would run `JSON.stringify` +
  // synchronous `localStorage.setItem` on every drag frame (~60 Hz),
  // blocking the main thread and causing visible flicker across the
  // whole editor.
  const persistPositions = useCallback(
    (next: Record<string, { x: number; y: number }>) => {
      if (!posHydrated) return;
      try {
        window.localStorage.setItem(positionKey, JSON.stringify(next));
      } catch {
        /* swallow storage quota */
      }
    },
    [positionKey, posHydrated],
  );

  // Manual edge-curve control points — dragging a selected edge's handle bends
  // it (push/pull) so authors can untangle loops by hand. Stored as a perp/free
  // offset from the edge's natural midpoint, persisted to localStorage like
  // node positions (and only on drag-end, not every frame).
  const edgeOffsetKey = `storyranger:graph-edge-offsets:${storyId}`;
  const [edgeOffsets, setEdgeOffsets] = useState<
    Record<string, { x: number; y: number }>
  >({});
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(edgeOffsetKey);
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration
        setEdgeOffsets(JSON.parse(raw));
      }
    } catch {
      /* swallow malformed storage */
    }
  }, [edgeOffsetKey]);

  /** Update one edge's curve offset. `commit` persists to localStorage (call on
   *  drag-end); pass `offset: null` to reset the edge to its default curve. */
  const setEdgeOffset = useCallback(
    (id: string, offset: { x: number; y: number } | null, commit: boolean) => {
      setEdgeOffsets((prev) => {
        const next = { ...prev };
        if (offset === null) delete next[id];
        else next[id] = offset;
        if (commit) {
          try {
            window.localStorage.setItem(edgeOffsetKey, JSON.stringify(next));
          } catch {
            /* swallow quota */
          }
        }
        return next;
      });
    },
    [edgeOffsetKey],
  );

  // New scenes get their default position assigned in `addScene` directly,
  // so we don't need an effect to sync. Inline fallback in the node builder
  // covers the unlikely case of a scene appearing without a recorded
  // position (e.g. external file edit while admin is open).

  // Per-branch list of encounters, each carrying its monster icons WITH a
  // per-monster count (so a battle with 3× Will-o-Wisp shows ×3) — drives the
  // battle marker on BranchEdge. Order = first appearance; one battle per
  // encounter, each rendered as its own enemy group.
  const encounterInfoByBranch = useMemo(() => {
    const map = new Map<
      string,
      { monsters: { id: string; count: number }[] }[]
    >();
    for (const e of encounters) {
      const key = `${e.trigger.sceneId}__${e.trigger.branchId}`;
      const arr = map.get(key) ?? [];
      const ids = e.displayMonsters ?? e.body.monsterIds;
      const counts = new Map<string, number>();
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
      arr.push({
        monsters: [...counts].map(([id, count]) => ({ id, count })),
      });
      map.set(key, arr);
    }
    return map;
  }, [encounters]);

  const dirty = useMemo(
    () =>
      JSON.stringify(initialStory) !== JSON.stringify(story) ||
      JSON.stringify(initialEncounters) !== JSON.stringify(encounters),
    [initialStory, story, initialEncounters, encounters],
  );

  // Who's already in the party arriving at each scene (from prior branches) —
  // lets the branch editor show inherited companions as "joined".
  const partyArrivingByScene = useMemo(
    () => companionsArrivingByScene(story.scenes, story.startScene),
    [story.scenes, story.startScene],
  );

  // Per-scene `data` objects — memo'd separately from `positions` so
  // dragging (which fires position changes every frame) doesn't churn the
  // SceneNode `data` prop identity. Without this, every drag frame would
  // hand each SceneNode a brand-new `data` object → React.memo bails →
  // every node re-renders → AssetThumb img remounts → flicker.
  const heroId = useMemo(
    () =>
      runtimeCharactersFile.characters.find((c) => c.isHero)?.id ?? "dorothy",
    [runtimeCharactersFile],
  );
  // Dialogue-portrait fallback base per character id (the in-scene sprite,
  // honoring `image`). Built once and shared by SceneNode / BranchEdge — which
  // only carry character ids — so a character without a dedicated
  // `/dialogue/<id>` head-shot still shows its sprite instead of a "?".
  const spriteBaseById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of runtimeCharactersFile.characters) {
      map[c.id] = dialogueFallbackBase(storyId, c);
    }
    return map;
  }, [runtimeCharactersFile, storyId]);
  // Primary dialogue-portrait base per id (honors `dialogueImage`). Paired
  // with spriteBaseById as the fallback when no head-shot file exists.
  const dialogueBaseById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of runtimeCharactersFile.characters) {
      map[c.id] = dialoguePortraitBase(storyId, c);
    }
    return map;
  }, [runtimeCharactersFile, storyId]);
  // Scenes that are the target of at least one branch — used to gate the Start
  // flag the same way `isTerminalScene` gates Ending (mirror image: no incoming
  // ↔ no outgoing).
  const incomingTargets = useMemo(() => {
    const set = new Set<string>();
    for (const sc of Object.values(story.scenes)) {
      for (const b of sc.branches) {
        if (story.scenes[b.next]) set.add(b.next);
      }
    }
    return set;
  }, [story.scenes]);
  const sceneDataById = useMemo(() => {
    const map: Record<string, SceneNodeData> = {};
    for (const [id, scene] of Object.entries(story.scenes)) {
      map[id] = {
        sceneId: id,
        scene,
        // Start = the designated start scene AND an entry point (nothing leads
        // into it). The no-incoming gate hides the flag once a branch connects
        // back to it — mirror of how Ending hides once a branch leads onward.
        isStart: id === story.startScene && !incomingTargets.has(id),
        // Ending = manually marked AND terminal (no branch leads onward). The
        // terminal gate hides the badge automatically once a branch connects;
        // requiring the manual flag keeps orphan/WIP nodes from all reading as
        // endings.
        isEnding: !!scene.ending && isTerminalScene(scene, story.scenes),
        storyId,
        heroId,
        spriteBaseById,
        dialogueBaseById,
      };
    }
    return map;
  }, [
    story.scenes,
    story.startScene,
    storyId,
    heroId,
    incomingTargets,
    spriteBaseById,
    dialogueBaseById,
  ]);

  // ─── Source-of-truth: story + positions + selection → Node[] / Edge[] ───
  //
  // Building these as memos is fine — they only rebuild when the *content*
  // actually changes (story edit, selection change, scene added). They do
  // NOT rebuild during drag, because drag mutates React Flow's internal
  // node state via `useNodesState` below, NOT our `positions` state.
  const sourceNodes: Node[] = useMemo(() => {
    return Object.entries(story.scenes).map(([id]) => ({
      id,
      type: "scene",
      position: positions[id] ?? { x: 0, y: 0 },
      data: sceneDataById[id] as unknown as Record<string, unknown>,
      draggable: true,
      selected: selection?.kind === "scene" && selection.sceneId === id,
    }));
  }, [story.scenes, sceneDataById, selection, positions]);

  const sourceEdges: Edge[] = useMemo(() => {
    // First pass — group branches by (source, target) so we can assign
    // parallel-edge indices for label offsetting.
    type Pending = { sourceId: string; branch: BranchT };
    const groups = new Map<string, Pending[]>();
    for (const [sourceId, scene] of Object.entries(story.scenes)) {
      for (const b of scene.branches) {
        if (!story.scenes[b.next]) continue; // orphan ref
        const key = `${sourceId}->${b.next}`;
        const arr = groups.get(key) ?? [];
        arr.push({ sourceId, branch: b });
        groups.set(key, arr);
      }
    }
    const out: Edge[] = [];
    for (const arr of groups.values()) {
      arr.forEach(({ sourceId, branch: b }, parallelIdx) => {
        const edgeId = `${sourceId}__${b.id}`;
        const encInfo = encounterInfoByBranch.get(`${sourceId}__${b.id}`);
        const data: BranchEdgeData = {
          branch: b,
          parallelIdx,
          parallelCount: arr.length,
          encounters: encInfo ?? [],
          storyId,
          companionDialogueBase: b.addsCompanion
            ? dialogueBaseById[b.addsCompanion]
            : undefined,
          companionSpriteBase: b.addsCompanion
            ? spriteBaseById[b.addsCompanion]
            : undefined,
          leavingCompanionDialogueBase: b.removesCompanion
            ? dialogueBaseById[b.removesCompanion]
            : undefined,
          leavingCompanionSpriteBase: b.removesCompanion
            ? spriteBaseById[b.removesCompanion]
            : undefined,
          offset: edgeOffsets[edgeId],
          onOffsetChange: setEdgeOffset,
        };
        const isSelected =
          selection?.kind === "branch" &&
          selection.sceneId === sourceId &&
          selection.branchId === b.id;
        out.push({
          id: edgeId,
          source: sourceId,
          target: b.next,
          type: "branch",
          data: data as unknown as Record<string, unknown>,
          selected: isSelected,
          // Only the arrowhead (target) end is draggable — reconnecting
          // repoints the branch's `next` to a different scene. The source end
          // is fixed (a branch belongs to its scene); moving it would mean
          // relocating the choice + cascading its encounters.
          reconnectable: "target",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: isSelected ? "#7a4f0e" : "rgba(91,65,40,0.55)",
          },
        });
      });
    }
    return out;
  }, [
    story.scenes,
    encounterInfoByBranch,
    selection,
    storyId,
    spriteBaseById,
    dialogueBaseById,
    edgeOffsets,
    setEdgeOffset,
  ]);

  // React Flow internal state — the actual props handed to <ReactFlow>.
  // The `onNodesChange` returned here handles ALL change kinds (position
  // every drag frame, dimensions, select, etc.) entirely inside React
  // Flow's store. During drag, our React tree does not re-render at all
  // — only the dragged node's transform updates internally.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(sourceNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(sourceEdges);

  // Push from source-of-truth into RF state only when the memo's identity
  // actually changes. Refs (vs deps) so this fires once per real change,
  // not once per render. Without this guard, React Flow's internal node
  // state would be overwritten on every render and lose drag positions.
  const lastSourceNodesRef = useRef(sourceNodes);
  const lastSourceEdgesRef = useRef(sourceEdges);
  useEffect(() => {
    if (lastSourceNodesRef.current !== sourceNodes) {
      lastSourceNodesRef.current = sourceNodes;
      setNodes(sourceNodes);
    }
    if (lastSourceEdgesRef.current !== sourceEdges) {
      lastSourceEdgesRef.current = sourceEdges;
      setEdges(sourceEdges);
    }
  }, [sourceNodes, sourceEdges, setNodes, setEdges]);

  // Commit drag position to our persistent `positions` state + localStorage
  // — fires ONCE per drag, not 60×/sec like the old per-frame path did.
  const handleNodeDragStop = useCallback(
    (_evt: React.MouseEvent | MouseEvent, node: Node) => {
      setPositions((prev) => {
        const next = { ...prev, [node.id]: { x: node.position.x, y: node.position.y } };
        persistPositions(next);
        return next;
      });
    },
    [persistPositions],
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfInstanceRef.current = instance;
  }, []);

  async function runAutoLayout() {
    const ok = await confirm({
      title: "Auto-layout",
      message:
        "Auto-layout connected scenes? Disconnected scenes keep their current position.",
      confirmLabel: "Run",
      tone: "default",
    });
    if (!ok) return;
    // Only re-place scenes that participate in an edge. Orphans (drafts
    // the author parked off to the side) keep their coordinates — merge
    // the new connected-only layout on top of the existing positions.
    const layouted = computeLayoutConnected(story.scenes);
    setPositions((prev) => {
      const next = { ...prev, ...layouted };
      persistPositions(next);
      return next;
    });
  }

  function addScene() {
    const rawId = prompt(
      "New scene id (kebab-case, e.g. s10b_secret_grove):",
    );
    if (!rawId) return;
    const id = rawId.trim();
    if (!/^[a-z0-9_-]+$/i.test(id)) {
      setError(
        "Scene id must be alphanumeric / dash / underscore only",
      );
      return;
    }
    if (story.scenes[id]) {
      setError(`Scene id "${id}" already exists`);
      return;
    }
    setError(null);
    const newScene: SceneT = {
      image: `/stories/${storyId}/scenes/${id}.jpeg`,
      bgm: "yellow-road",
      speaker: "narrator",
      narration: "(Write the narration for this new scene.)",
      branches: [],
    };
    setStory((prev) => ({
      ...prev,
      scenes: { ...prev.scenes, [id]: newScene },
    }));
    // Drop the new scene at the current viewport centre (minus half the
    // SceneNode box so the node sits centred, not anchored top-left).
    // SceneNode is 280×240 — see SceneNode.tsx. Falls back to canvas
    // origin if the ReactFlow instance isn't ready yet (shouldn't happen
    // after the editor has mounted, but be defensive).
    const NODE_W = 280;
    const NODE_H = 240;
    let pos = { x: 80, y: 80 };
    const rf = rfInstanceRef.current;
    const wrapper = flowWrapperRef.current;
    if (rf && wrapper) {
      const rect = wrapper.getBoundingClientRect();
      const centre = rf.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      pos = { x: centre.x - NODE_W / 2, y: centre.y - NODE_H / 2 };
    }
    setPositions((prev) => {
      const next = { ...prev, [id]: pos };
      persistPositions(next);
      return next;
    });
    setSelection({ kind: "scene", sceneId: id });
  }

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelection({ kind: "scene", sceneId: node.id });
  }, []);

  const onEdgeClick: EdgeMouseHandler = useCallback((_, edge) => {
    const [sourceId, branchId] = edge.id.split("__");
    if (sourceId && branchId) {
      setSelection({ kind: "branch", sceneId: sourceId, branchId });
    }
  }, []);

  const onPaneClick = useCallback(() => setSelection(null), []);

  // Delete/Backspace removes the selected scene or branch. We route through a
  // ref so the window listener (subscribed once) always sees the latest
  // selection + handlers without re-subscribing every render. Returns whether
  // it acted, so we only swallow the keystroke when something was deleted.
  const deleteSelectedRef = useRef<() => boolean>(() => false);
  useEffect(() => {
    deleteSelectedRef.current = () => {
      if (!selection) return false;
      if (selection.kind === "scene") void deleteScene(selection.sceneId);
      else void deleteBranch(selection.sceneId, selection.branchId);
      return true;
    };
  });
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      // Don't hijack the key while typing in the inspector's fields.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      if (deleteSelectedRef.current()) e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function updateScene(sceneId: string, mut: (s: SceneT) => SceneT) {
    setStory((prev) => ({
      ...prev,
      scenes: {
        ...prev.scenes,
        [sceneId]: mut(prev.scenes[sceneId]),
      },
    }));
  }

  function updateBranch(
    sceneId: string,
    branchId: string,
    mut: (b: BranchT) => BranchT,
  ) {
    updateScene(sceneId, (s) => ({
      ...s,
      branches: s.branches.map((b) => (b.id === branchId ? mut(b) : b)),
    }));
  }

  async function deleteScene(sceneId: string) {
    if (sceneId === story.startScene) {
      await alert({
        title: "Cannot delete scene",
        message: `"${sceneId}" is the start scene. Change the start scene first.`,
      });
      return;
    }
    // Inbound branches: branches in OTHER scenes that point at this scene.
    // They'd dangle (next → a scene that no longer exists), so we remove
    // them together with the scene rather than leaving manual cleanup.
    const inbound: { sid: string; branchId: string }[] = [];
    for (const [sid, s] of Object.entries(story.scenes)) {
      if (sid === sceneId) continue;
      for (const b of s.branches) {
        if (b.next === sceneId) inbound.push({ sid, branchId: b.id });
      }
    }
    // Encounters removed: those triggered FROM this scene, plus those tied
    // to any inbound branch we're about to strip (encounters key on the
    // (sceneId, branchId) pair).
    const removedEncounters = encounters.filter(
      (e) =>
        e.trigger.sceneId === sceneId ||
        inbound.some(
          (ib) =>
            e.trigger.sceneId === ib.sid &&
            e.trigger.branchId === ib.branchId,
        ),
    );

    const warnings: string[] = [];
    if (inbound.length > 0) {
      warnings.push(
        `${inbound.length} branch(es) pointing here will be removed: ${inbound
          .slice(0, 3)
          .map((ib) => `${ib.sid}.${ib.branchId}`)
          .join(", ")}${inbound.length > 3 ? "…" : ""}`,
      );
    }
    if (removedEncounters.length > 0) {
      warnings.push(
        `${removedEncounters.length} encounter(s) will be deleted.`,
      );
    }
    const msg = warnings.map((w) => `\n• ${w}`).join("");
    const ok = await confirm({
      title: "Delete scene",
      message: `Delete scene "${sceneId}"?${msg}`,
    });
    if (!ok) return;

    setStory((prev) => {
      const next = { ...prev.scenes };
      delete next[sceneId];
      // Strip any branch in the remaining scenes that pointed at the deleted
      // scene, so no dangling links are left behind.
      for (const sid of Object.keys(next)) {
        const s = next[sid];
        if (s.branches.some((b) => b.next === sceneId)) {
          next[sid] = {
            ...s,
            branches: s.branches.filter((b) => b.next !== sceneId),
          };
        }
      }
      return { ...prev, scenes: next };
    });
    if (removedEncounters.length > 0) {
      const removedIds = new Set(removedEncounters.map((e) => e.id));
      setEncounters((prev) => prev.filter((e) => !removedIds.has(e.id)));
    }
    setSelection(null);
  }

  /** Clone the scene under a new id. The scene's OWN content (image, bgm,
   *  speaker, narration, reward, ending, dialogueCharacters, asks) is deep-
   *  copied — but its `branches` are NOT: a duplicate starts disconnected, with
   *  no outgoing choices (and therefore no branch encounters to cascade). New
   *  id is `{sourceId}_2`, `_3`, … — first unused suffix. */
  function duplicateScene(sceneId: string) {
    const src = story.scenes[sceneId];
    if (!src) return;
    let suffix = 2;
    let newId = `${sceneId}_${suffix}`;
    while (story.scenes[newId]) {
      suffix += 1;
      newId = `${sceneId}_${suffix}`;
    }
    // Deep clone via JSON to detach nested refs (reward, ending, asks, …),
    // then drop the branches — duplicating a scene copies only its own content,
    // not its outgoing connections (so there are no branch encounters to clone).
    const cloned = JSON.parse(JSON.stringify(src)) as SceneT;
    cloned.branches = [];
    setStory((prev) => ({
      ...prev,
      scenes: {
        ...prev.scenes,
        [newId]: cloned,
      },
    }));

    // Drop the duplicate near the source on the canvas so it doesn't land
    // at the origin and stack on top of other nodes.
    const srcPos = positions[sceneId] ?? { x: 0, y: 0 };
    setPositions((prev) => {
      const next = {
        ...prev,
        [newId]: { x: srcPos.x + 60, y: srcPos.y + 60 },
      };
      persistPositions(next);
      return next;
    });
    setSelection({ kind: "scene", sceneId: newId });
  }

  async function deleteBranch(sceneId: string, branchId: string) {
    // Cascade — encounters live on (sceneId, branchId), so any tied to
    // this branch would become dangling refs after the delete. Surface
    // them in the confirm prompt and remove together.
    const triggeredEncounters = encounters.filter(
      (e) => e.trigger.sceneId === sceneId && e.trigger.branchId === branchId,
    );
    const warning =
      triggeredEncounters.length > 0
        ? `\n• ${triggeredEncounters.length} encounter(s) trigger on this branch and will be deleted: ${triggeredEncounters
            .map((e) => e.id)
            .slice(0, 3)
            .join(", ")}${triggeredEncounters.length > 3 ? "…" : ""}`
        : "";
    const ok = await confirm({
      title: "Delete branch",
      message: `Delete branch "${branchId}" from ${sceneId}?${warning}`,
    });
    if (!ok) return;
    updateScene(sceneId, (s) => ({
      ...s,
      branches: s.branches.filter((b) => b.id !== branchId),
    }));
    if (triggeredEncounters.length > 0) {
      setEncounters((prev) =>
        prev.filter(
          (e) =>
            !(e.trigger.sceneId === sceneId && e.trigger.branchId === branchId),
        ),
      );
    }
    setSelection({ kind: "scene", sceneId });
  }

  function addEncounterForBranch(sceneId: string, branchId: string) {
    // Generate a non-colliding id from the (scene, branch) pair.
    let baseId = `${sceneId}__${branchId}-battle`;
    let suffix = 0;
    while (encounters.some((e) => e.id === baseId)) {
      suffix += 1;
      baseId = `${sceneId}__${branchId}-battle-${suffix}`;
    }
    const newEnc: EncounterDefT = {
      id: baseId,
      trigger: { sceneId, branchId },
      intro: {
        bg: "forest-clearing",
      },
      body: { kind: "battle", monsterIds: [] },
      rewards: {},
    };
    setEncounters((prev) => [...prev, newEnc]);
  }

  function updateEncounter(
    encId: string,
    mut: (e: EncounterDefT) => EncounterDefT,
  ) {
    setEncounters((prev) =>
      prev.map((e) => (e.id === encId ? mut(e) : e)),
    );
  }

  async function deleteEncounter(encId: string) {
    const ok = await confirm({
      title: "Delete encounter",
      message: `Delete encounter "${encId}"?\nThis cannot be undone.`,
    });
    if (!ok) return;
    setEncounters((prev) => prev.filter((e) => e.id !== encId));
  }

  function addBranch(sceneId: string) {
    const newId = `branch_${Math.random().toString(36).slice(2, 7)}`;
    const targets = Object.keys(story.scenes);
    const first = targets.find((t) => t !== sceneId) ?? sceneId;
    updateScene(sceneId, (s) => ({
      ...s,
      branches: [
        ...s.branches,
        {
          id: newId,
          label: "New choice",
          next: first,
        } satisfies BranchT,
      ],
    }));
    setSelection({ kind: "branch", sceneId, branchId: newId });
  }

  /** Drag-to-connect handler. Adds a branch from `source` → `target`. */
  const onConnect = useCallback(
    (conn: Connection) => {
      const { source, target } = conn;
      if (!source || !target) return;
      // No self-loops — disorienting in the graph and not useful as a real
      // narrative choice.
      if (source === target) return;
      if (!story.scenes[source] || !story.scenes[target]) return;
      const newId = `branch_${Math.random().toString(36).slice(2, 7)}`;
      setStory((prev) => ({
        ...prev,
        scenes: {
          ...prev.scenes,
          [source]: {
            ...prev.scenes[source],
            branches: [
              ...prev.scenes[source].branches,
              {
                id: newId,
                label: "New choice",
                next: target,
              } satisfies BranchT,
            ],
          },
        },
      }));
      setSelection({ kind: "branch", sceneId: source, branchId: newId });
    },
    [story.scenes],
  );

  /** Edge reconnect (arrowhead dragged to another node) — repoints the
   *  branch's `next` to the new target scene. Only the target end is
   *  reconnectable (see the `reconnectable: "target"` on each edge), so the
   *  source scene never changes here. */
  const onReconnect = useCallback(
    (oldEdge: Edge, newConn: Connection) => {
      const [sourceId, branchId] = oldEdge.id.split("__");
      const target = newConn.target;
      if (!sourceId || !branchId || !target) return;
      if (target === sourceId) return; // no self-loop
      if (!story.scenes[sourceId] || !story.scenes[target]) return;
      setStory((prev) => {
        const scene = prev.scenes[sourceId];
        if (!scene) return prev;
        return {
          ...prev,
          scenes: {
            ...prev.scenes,
            [sourceId]: {
              ...scene,
              branches: scene.branches.map((b) =>
                b.id === branchId ? { ...b, next: target } : b,
              ),
            },
          },
        };
      });
      setSelection({ kind: "branch", sceneId: sourceId, branchId });
    },
    [story.scenes],
  );

  function save() {
    setError(null);
    const parsedStory = StorySchema.safeParse(story);
    if (!parsedStory.success) {
      setError(
        parsedStory.error.issues[0]?.message ?? "Scene validation failed",
      );
      return;
    }
    const parsedEnc = EncountersFileSchema.safeParse({ encounters });
    if (!parsedEnc.success) {
      setError(
        parsedEnc.error.issues[0]?.message ??
          "Encounter validation failed",
      );
      return;
    }
    // Referential integrity:
    //   - every branch.next must point to an existing scene
    //   - every encounter.trigger.(sceneId, branchId) must resolve
    const sceneIds = new Set(Object.keys(story.scenes));
    for (const [sid, s] of Object.entries(story.scenes)) {
      for (const b of s.branches) {
        if (!sceneIds.has(b.next)) {
          setError(
            `branch "${b.id}" in ${sid} points to missing scene "${b.next}"`,
          );
          return;
        }
      }
    }
    for (const enc of encounters) {
      const srcScene = story.scenes[enc.trigger.sceneId];
      if (!srcScene) {
        setError(
          `encounter "${enc.id}" triggers from missing scene "${enc.trigger.sceneId}"`,
        );
        return;
      }
      if (!srcScene.branches.some((b) => b.id === enc.trigger.branchId)) {
        setError(
          `encounter "${enc.id}" triggers on missing branch "${enc.trigger.branchId}" of scene "${enc.trigger.sceneId}"`,
        );
        return;
      }
    }

    const sceneDirty =
      JSON.stringify(initialStory) !== JSON.stringify(story);
    const encDirty =
      JSON.stringify(initialEncounters) !== JSON.stringify(encounters);

    startTransition(async () => {
      if (sceneDirty) {
        const res = await saveScenesAction(storyId, story);
        if (!res.ok) {
          setError(res.error);
          return;
        }
      }
      if (encDirty) {
        const res = await saveEncountersAction(storyId, { encounters });
        if (!res.ok) {
          setError(res.error);
          return;
        }
      }
      router.refresh();
    });
  }

  // Derive selected scene/branch defensively — guard against stale selection
  // pointing at a scene that was deleted (e.g. via Discard rollback or a
  // future delete-scene UI). When the underlying data disappears the
  // effect below clears the selection on the next render.
  const selectedScene = useMemo(() => {
    if (!selection) return null;
    const scene = story.scenes[selection.sceneId];
    if (!scene) return null;
    return { id: selection.sceneId, scene };
  }, [selection, story.scenes]);

  const selectedBranch = useMemo(() => {
    if (selection?.kind !== "branch" || !selectedScene) return null;
    return (
      selectedScene.scene.branches.find((b) => b.id === selection.branchId) ??
      null
    );
  }, [selection, selectedScene]);

  // Auto-clear selection that no longer points at real data so Inspector
  // doesn't render against undefined.
  useEffect(() => {
    if (!selection) return;
    const sceneExists = !!story.scenes[selection.sceneId];
    if (!sceneExists) {
      setSelection(null);
      return;
    }
    if (selection.kind === "branch") {
      const found = story.scenes[selection.sceneId].branches.some(
        (b) => b.id === selection.branchId,
      );
      if (!found) {
        // Stay on the parent scene rather than blanking the panel.
        setSelection({ kind: "scene", sceneId: selection.sceneId });
      }
    }
  }, [selection, story.scenes]);

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p
            className="font-handwritten text-base text-accent-deep"
            title={storyId}
          >
            {story.title} / Story Graph
          </p>
          <span className="rounded-pill bg-paper-deep/40 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
            {Object.keys(story.scenes).length}
          </span>
          <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 font-mono text-[10px] text-ink-soft/70">
            scenes.json + encounters.json
          </code>
          {dirty && (
            <span className="rounded-pill bg-accent/15 px-2 py-0.5 text-xs text-accent-deep">
              unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-sm text-ruby">⚠ {error}</span>}
          <button
            type="button"
            onClick={addScene}
            disabled={isPending}
            className="rounded-pill bg-accent-deep px-3 py-1 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
          >
            + Scene
          </button>
          <button
            type="button"
            onClick={() => {
              setStory(initialStory);
              setEncounters(initialEncounters);
              setSelection(null);
              setError(null);
            }}
            disabled={!dirty || isPending}
            className="rounded-pill bg-paper-deep/60 px-3 py-1 text-sm text-ink-soft hover:bg-paper-deep disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || isPending}
            className="rounded-pill bg-emerald px-3 py-1 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div ref={flowWrapperRef} className="relative flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={handleNodeDragStop}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onInit={onInit}
            // Disable React Flow's built-in delete — we handle Delete/Backspace
            // ourselves (below) so deletes go through the cascade + confirm
            // logic instead of silently mutating RF's internal node/edge arrays.
            deleteKeyCode={null}
            fitView
            minZoom={0.2}
            maxZoom={1.5}
            proOptions={proOptions}
          >
            <Background gap={24} size={1} color="rgba(91,65,40,0.15)" />
            <Controls showInteractive={false}>
              <ControlButton
                onClick={runAutoLayout}
                title="Auto-layout (re-run dagre — overrides manual positions)"
                aria-label="Auto-layout"
              >
                <TreeStructure size={14} weight="bold" />
              </ControlButton>
            </Controls>
          </ReactFlow>
        </div>

        {/* Inspector — auto-shows when a scene or branch is selected,
            auto-hides when selection is cleared (click empty canvas). */}
        {selection && (
          <aside className="flex w-96 shrink-0 flex-col overflow-hidden border-l border-ink-soft/10 bg-paper">
            <div className="flex-1 overflow-y-auto p-4">
              {selection?.kind === "scene" && selectedScene && (
                <SceneInspector
                  storyId={storyId}
                  storyLanguage={story.language}
                  storyTitle={story.title}
                  storyPremise={story.subtitle ?? ""}
                  storyScenes={story.scenes}
                  characters={runtimeCharactersFile.characters}
                  sceneId={selectedScene.id}
                  scene={selectedScene.scene}
                  isStart={selectedScene.id === story.startScene}
                  hasIncoming={incomingTargets.has(selectedScene.id)}
                  items={items}
                  sceneImages={sceneImages}
                  bgmOptions={bgmOptions}
                  onChange={(mut) => updateScene(selectedScene.id, mut)}
                  onAddBranch={() => addBranch(selectedScene.id)}
                  onDuplicate={() => duplicateScene(selectedScene.id)}
                  onDelete={() => deleteScene(selectedScene.id)}
                  onDeleteBranch={(branchId) =>
                    deleteBranch(selectedScene.id, branchId)
                  }
                  onEditBranch={(branchId) =>
                    setSelection({
                      kind: "branch",
                      sceneId: selectedScene.id,
                      branchId,
                    })
                  }
                  onPreview={() => {
                    setPreviewBranchId(null);
                    setPreviewSceneId(selectedScene.id);
                  }}
                  onSetStart={() =>
                    setStory((prev) => ({
                      ...prev,
                      startScene: selectedScene.id,
                    }))
                  }
                />
              )}

              {selection?.kind === "branch" &&
                selectedScene &&
                selectedBranch && (
                  <BranchInspector
                    storyId={storyId}
                    storyLanguage={story.language}
                    storyTitle={story.title}
                    storyPremise={story.subtitle ?? ""}
                    storyScenes={story.scenes}
                    sceneId={selectedScene.id}
                    inheritedCompanions={[
                      ...(partyArrivingByScene[selectedScene.id] ?? []),
                    ]}
                    branch={selectedBranch}
                    sourceScene={selectedScene.scene}
                    encounters={encounters.filter(
                      (e) =>
                        e.trigger.sceneId === selectedScene.id &&
                        e.trigger.branchId === selectedBranch.id,
                    )}
                    monsters={monsters}
                    backgrounds={backgrounds}
                    items={items}
                    characters={runtimeCharactersFile.characters}
                    onChange={(mut) =>
                      updateBranch(
                        selectedScene.id,
                        selectedBranch.id,
                        mut,
                      )
                    }
                    onDelete={() =>
                      deleteBranch(selectedScene.id, selectedBranch.id)
                    }
                    onAddEncounter={() =>
                      addEncounterForBranch(
                        selectedScene.id,
                        selectedBranch.id,
                      )
                    }
                    onUpdateEncounter={(encId, mut) =>
                      updateEncounter(encId, mut)
                    }
                    onDeleteEncounter={(encId) => deleteEncounter(encId)}
                    onPreview={() => {
                      // Preview from RIGHT AFTER this branch's choice.
                      setPreviewBranchId(selectedBranch.id);
                      setPreviewSceneId(selectedScene.id);
                    }}
                  />
                )}
            </div>
          </aside>
        )}
      </div>
      <ScenePreviewModal
        story={runtimeStory}
        medals={runtimeMedalsFile}
        characters={runtimeCharactersFile}
        sceneId={previewSceneId}
        branchId={previewBranchId}
        onClose={() => {
          setPreviewSceneId(null);
          setPreviewBranchId(null);
        }}
      />
    </div>
  );
}

export function StoryGraphEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <StoryGraphEditorInner {...props} />
    </ReactFlowProvider>
  );
}

// ─────────────────────────────────────────────────────────────────

function SceneInspector({
  storyId,
  storyLanguage,
  storyTitle,
  storyPremise,
  storyScenes,
  sceneId,
  scene,
  isStart,
  hasIncoming,
  items,
  characters,
  sceneImages,
  bgmOptions,
  onChange,
  onAddBranch,
  onDuplicate,
  onDelete,
  onDeleteBranch,
  onEditBranch,
  onPreview,
  onSetStart,
}: {
  storyId: string;
  /** Story language code + title + premise — passed to the narration AI so
   *  it writes in the story's language and tone. */
  storyLanguage: string;
  storyTitle: string;
  storyPremise: string;
  storyScenes: Record<string, SceneT>;
  sceneId: string;
  scene: SceneT;
  /** Whether this scene is the story's start scene — disables Delete. */
  isStart: boolean;
  /** Whether any branch leads INTO this scene. The "set as start" flag is
   *  hidden once a scene has an incoming branch (it can't be an entry point) —
   *  mirror of how the Ending toggle only shows on terminal scenes. */
  hasIncoming: boolean;
  items: ItemDefT[];
  /** Character catalog — chips display `name` instead of raw `id`; the
   *  Asks editor reads `persona` to limit answerers. */
  characters: CharactersFile["characters"];
  sceneImages: { value: string; label: string }[];
  bgmOptions: string[];
  onChange: (mut: (s: SceneT) => SceneT) => void;
  onAddBranch: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPreview: () => void;
  /** Promote this scene to story.startScene (the entry point). */
  onSetStart: () => void;
  /** Per-branch quick-delete from the inline branch list — needed for
   *  the dangling-branch cleanup case where the user removed the target
   *  scene first and the now-orphan branch only shows up here (no edge
   *  to click on in the graph). */
  onDeleteBranch: (branchId: string) => void;
  /** Open a branch's full editor (selects it → BranchInspector). */
  onEditBranch: (branchId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="font-handwritten text-base text-accent-deep">Scene</p>
          <code className="text-sm text-ink">{sceneId}</code>
        </div>
        <div className="flex items-center gap-1">
          {/* Start flag — only on entry-point scenes (no incoming branch), or
              the current start. Mirror of the Ending toggle, which only shows
              on terminal scenes. */}
          {(isStart || !hasIncoming) && (
            <button
              type="button"
              onClick={onSetStart}
              disabled={isStart}
              title={
                isStart
                  ? "This is the story's start scene"
                  : "Mark this as the story's start scene"
              }
              aria-label={isStart ? "Start scene" : "Set as start scene"}
              className={`flex h-6 w-6 items-center justify-center rounded-pill transition-colors ${
                isStart
                  ? "bg-accent-deep text-paper"
                  : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
              }`}
            >
              <Flag size={12} weight={isStart ? "fill" : "regular"} />
            </button>
          )}
          <button
            type="button"
            onClick={onPreview}
            title="Play this scene in a preview modal"
            aria-label="Preview scene"
            className="flex h-6 w-6 items-center justify-center rounded-pill bg-emerald/20 text-emerald hover:bg-emerald/30"
          >
            <Play size={12} weight="fill" />
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicate this scene under a new id (_2, _3, …)"
            aria-label="Duplicate scene"
            className="flex h-6 w-6 items-center justify-center rounded-pill bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
          >
            <Copy size={12} weight="bold" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isStart}
            title={
              isStart
                ? "Start scene cannot be deleted"
                : "Delete this scene"
            }
            aria-label="Delete scene"
            className="flex h-6 w-6 items-center justify-center rounded-pill bg-ruby/15 text-ruby hover:bg-ruby/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <TrashSimple size={12} weight="bold" />
          </button>
        </div>
      </header>

      <ScenePreviewImage path={scene.image} alt={sceneId} />

      <Field label="Image">
        <SelectWithCustom
          value={scene.image}
          options={sceneImages}
          placeholder="(no scene images found on disk)"
          onChange={(v) => onChange((s) => ({ ...s, image: v }))}
        />
      </Field>

      <Field label="BGM">
        <BgmSelectWithPreview
          value={scene.bgm}
          options={bgmOptions}
          storyId={storyId}
          placeholder="(no BGM tracks found on disk)"
          onChange={(v) => onChange((s) => ({ ...s, bgm: v }))}
        />
      </Field>

      <Field label="Narrator">
        <SelectWithCustom
          value={scene.speaker}
          // Derived from the character catalog (+ the narrator) so each story
          // offers its own cast; SelectWithCustom still surfaces any unknown
          // stored value as a "(custom)" entry. Narrator is prepended once even
          // when the catalog also defines a "narrator" character (avoid a
          // duplicate option key).
          options={[
            { value: "narrator", label: "narrator" },
            ...characters
              .filter((c) => c.id !== "narrator")
              .map((c) => ({ value: c.id, label: c.name })),
          ]}
          onChange={(v) =>
            onChange((s) => ({
              ...s,
              speaker: v as SceneT["speaker"],
            }))
          }
        />
      </Field>

      <SceneNarrationEditor
        storyId={storyId}
        storyLanguage={storyLanguage}
        storyTitle={storyTitle}
        storyPremise={storyPremise}
        storyScenes={storyScenes}
        sceneId={sceneId}
        scene={scene}
        characters={characters}
        onChange={onChange}
      />

      <DialogueCharactersEditor
        storyId={storyId}
        characters={characters}
        scene={scene}
        onChange={onChange}
      />

      <RewardEditor
        label="Reward"
        items={items}
        reward={scene.reward}
        onChange={(reward) => onChange((s) => ({ ...s, reward }))}
      />

      {/* Ending is a MANUAL mark, shown only while the scene is terminal (no
          branch leads to an existing scene). Connecting a branch onward hides
          this whole section automatically; the stored `ending` data is kept
          (dormant) so medal references can't dangle. Orphan/WIP nodes stay
          unmarked until the author checks them. */}
      {isTerminalScene(scene, storyScenes) && (
        <Field label="Ending">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!scene.ending}
              onChange={(e) =>
                onChange((s) => ({
                  ...s,
                  ending: e.target.checked
                    ? s.ending ?? { id: sceneId, label: "" }
                    : undefined,
                }))
              }
            />
            <span className="text-sm text-ink-soft">
              Terminal scene (story ends here)
            </span>
          </label>
          {scene.ending && (
            <div className="mt-2 flex flex-col gap-2 rounded-card bg-paper-deep/30 p-2">
              <input
                value={scene.ending.id}
                onChange={(e) =>
                  onChange((s) => ({
                    ...s,
                    ending: { ...s.ending!, id: e.target.value },
                  }))
                }
                placeholder="ending id"
                className={inputCls}
              />
              <input
                value={scene.ending.label}
                onChange={(e) =>
                  onChange((s) => ({
                    ...s,
                    ending: { ...s.ending!, label: e.target.value },
                  }))
                }
                placeholder="ending label"
                className={inputCls}
              />
            </div>
          )}
        </Field>
      )}

      {/* Branch choices + ask chips are authored together — the player sees
          both in the same choice area at runtime. */}
      <hr className="border-0 border-t border-ink-soft/15" />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAddBranch}
          className="rounded-pill bg-accent-deep px-3 py-1 text-xs font-semibold text-paper hover:opacity-90"
        >
          + Add branch
        </button>
        <button
          type="button"
          onClick={() =>
            onChange((s) => ({
              ...s,
              asks: [
                ...(s.asks ?? []),
                newAsk(characters.filter((c) => !!c.persona)),
              ],
            }))
          }
          className="rounded-pill bg-paper-deep/60 px-3 py-1 text-xs font-semibold text-ink-soft hover:bg-paper-deep"
        >
          + Add ask
        </button>
      </div>

      <SceneAsksEditor
        storyId={storyId}
        characters={characters}
        scene={scene}
        onChange={onChange}
      />

      {scene.branches.length > 0 && (
        <ul className="flex flex-col gap-1">
          {scene.branches.map((b) => {
            const missingTarget = !storyScenes[b.next];
            return (
              <li
                key={b.id}
                className={`flex items-center justify-between gap-2 rounded-card px-2 py-1.5 text-xs ring-1 ${
                  missingTarget
                    ? "bg-ruby/10 ring-ruby/30"
                    : "bg-paper ring-ink-soft/10"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <GitBranch
                    size={14}
                    weight="bold"
                    className={`shrink-0 ${missingTarget ? "text-ruby" : "text-ink-soft/60"}`}
                  />
                  <span
                    className="truncate text-sm text-ink"
                    title={
                      missingTarget
                        ? `Target scene "${b.next}" no longer exists — this branch is dangling. Delete it or repoint it.`
                        : b.label
                    }
                  >
                    {b.label}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEditBranch(b.id)}
                    title="Edit branch"
                    aria-label={`Edit branch ${b.id}`}
                    className="flex h-5 w-5 items-center justify-center rounded-pill bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                  >
                    <PencilSimple size={10} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteBranch(b.id)}
                    title={`Delete branch "${b.id}"`}
                    aria-label={`Delete branch ${b.id}`}
                    className="flex h-5 w-5 items-center justify-center rounded-pill bg-ruby/15 text-ruby hover:bg-ruby/25"
                  >
                    <TrashSimple size={10} weight="bold" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EncounterCard({
  storyId,
  encounter,
  monsters,
  backgrounds,
  items,
  onChange,
  onDelete,
}: {
  storyId: string;
  encounter: EncounterDefT;
  monsters: MonsterStatsT[];
  backgrounds: BackgroundMetaT[];
  items: ItemDefT[];
  onChange: (mut: (e: EncounterDefT) => EncounterDefT) => void;
  onDelete: () => void;
}) {
  // Battles open expanded by default — when a branch has a battle, its editor
  // shows the setup straight away (collapse manually via the header).
  const [expanded, setExpanded] = useState(true);

  return (
    <li className="rounded-card bg-paper ring-1 ring-ink-soft/10">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left"
        >
          <p className="text-xs font-semibold text-ink">Battle</p>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Hide details" : "Edit encounter"}
            aria-label={expanded ? "Hide details" : "Edit encounter"}
            className="flex h-5 w-5 items-center justify-center rounded-pill bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
          >
            <PencilSimple size={10} weight="bold" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete encounter"
            aria-label="Delete encounter"
            className="flex h-5 w-5 items-center justify-center rounded-pill bg-ruby/15 text-ruby hover:bg-ruby/25"
          >
            <TrashSimple size={10} weight="bold" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 border-t border-ink-soft/10 px-2 py-2">
          <MiniField label="Background">
            <StyledSelect
              compact
              value={encounter.intro.bg}
              onChange={(e) =>
                onChange((x) => ({
                  ...x,
                  intro: { ...x.intro, bg: e.target.value },
                }))
              }
            >
              {/* Surface the saved value even if it's not in the catalog yet
                  (e.g. typo or pre-catalog data). */}
              {!backgrounds.some((b) => b.key === encounter.intro.bg) &&
                encounter.intro.bg && (
                  <option value={encounter.intro.bg}>
                    {encounter.intro.bg} (not in catalog)
                  </option>
                )}
              {backgrounds.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label} ({b.key})
                </option>
              ))}
            </StyledSelect>
            {/* Preview the picked background — small banner under the select. */}
            {encounter.intro.bg && (
              <AssetThumb
                base={`/stories/${storyId}/backgrounds/${encounter.intro.bg}`}
                alt={encounter.intro.bg}
                className="mt-1.5 h-20 w-full"
                shape="banner"
                fit="cover"
              />
            )}
          </MiniField>

          <MiniField label="Monsters">
            <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
              {monsters.map((m) => {
                const monsterCount = encounter.body.monsterIds.filter(
                  (id) => id === m.id,
                ).length;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onChange((x) => ({
                        ...x,
                        body: {
                          ...x.body,
                          monsterIds: [...x.body.monsterIds, m.id],
                        },
                      }));
                    }}
                    className={`flex items-center gap-1 rounded-pill py-0.5 pl-0.5 pr-2 text-[10px] transition-colors ${
                      monsterCount > 0
                        ? "bg-accent-deep text-paper"
                        : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                    }`}
                    title={`Click to add. Currently × ${monsterCount}.`}
                  >
                    <AssetThumb
                      base={`/stories/${storyId}/monsters/${m.id}`}
                      alt={m.name}
                      className="h-5 w-5"
                      shape="circle"
                      fit="cover"
                      ringWidth={0}
                    />
                    <span>{m.name}</span>
                    {monsterCount > 1 && <span>×{monsterCount}</span>}
                  </button>
                );
              })}
            </div>
            {encounter.body.monsterIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onChange((x) => ({
                    ...x,
                    body: {
                      ...x.body,
                      monsterIds: x.body.monsterIds.slice(0, -1),
                    },
                  }));
                }}
                className="mt-1 self-end rounded-pill bg-ruby/15 px-2 py-0.5 text-[10px] text-ruby hover:bg-ruby/25"
              >
                ← Remove last
              </button>
            )}
          </MiniField>

          <MiniField label="Reward items">
            <ItemChipPicker
              catalog={items}
              selected={encounter.rewards.items ?? []}
              onToggle={(id) =>
                onChange((x) => {
                  const set = new Set(x.rewards.items ?? []);
                  if (set.has(id)) set.delete(id);
                  else set.add(id);
                  return {
                    ...x,
                    rewards: {
                      ...x.rewards,
                      items: set.size > 0 ? [...set] : undefined,
                    },
                  };
                })
              }
            />
          </MiniField>

        </div>
      )}
    </li>
  );
}

function MiniField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Small right-aligned character counter ("123 / 250"). The limit is a
 *  soft guideline — saving is still allowed over it; the count just turns
 *  red to flag an overly long passage. */
function CharCount({ value, limit = 250 }: { value: string; limit?: number }) {
  const over = value.length > limit;
  return (
    <div
      className={`text-right text-[10px] tabular-nums ${
        over ? "font-semibold text-ruby" : "text-ink-soft/50"
      }`}
    >
      {value.length} / {limit}
    </div>
  );
}


const COMPANION_OPTIONS: { id: CompanionId }[] = [
  { id: "scarecrow" },
  { id: "tinman" },
  { id: "lion" },
];

/** Merge a clause patch into a branch's `condition`, dropping the whole
 *  `condition` object when no clause remains — keeps saved JSON minimal and
 *  `isBranchVisible` treats "no condition" as always-visible. */
function withCondition(
  b: BranchT,
  patch: Partial<NonNullable<BranchT["condition"]>>,
): BranchT {
  const merged = { ...b.condition, ...patch };
  const hasItems =
    merged.hasItems && merged.hasItems.length > 0 ? merged.hasItems : undefined;
  const hasCompanions =
    merged.hasCompanions && merged.hasCompanions.length > 0
      ? merged.hasCompanions
      : undefined;
  if (!hasItems && !hasCompanions) {
    const next = { ...b };
    delete next.condition;
    return next;
  }
  return { ...b, condition: { hasItems, hasCompanions } };
}

function BranchInspector({
  storyId,
  storyLanguage,
  storyTitle,
  storyPremise,
  storyScenes,
  sceneId,
  inheritedCompanions,
  branch,
  sourceScene,
  encounters,
  monsters,
  backgrounds,
  items,
  characters,
  onChange,
  onDelete,
  onAddEncounter,
  onUpdateEncounter,
  onDeleteEncounter,
  onPreview,
}: {
  storyId: string;
  /** Story language code + title + premise — passed to the outcome AI so it
   *  writes in the story's language and tone. */
  storyLanguage: string;
  storyTitle: string;
  storyPremise: string;
  storyScenes: Record<string, SceneT>;
  sceneId: string;
  /** Companions already in the party arriving at this branch's scene (joined on
   *  a prior branch). Shown as "joined" — clicking them parts them here. */
  inheritedCompanions: CompanionId[];
  branch: BranchT;
  sourceScene: SceneT;
  encounters: EncounterDefT[];
  monsters: MonsterStatsT[];
  backgrounds: BackgroundMetaT[];
  /** Item catalog — for the per-encounter reward-items picker. */
  items: ItemDefT[];
  /** Character catalog — Add-companion chips show `name` not raw id. */
  characters: { id: string; name: string }[];
  onChange: (mut: (b: BranchT) => BranchT) => void;
  onDelete: () => void;
  /** Adds a battle encounter to this branch. */
  onAddEncounter: () => void;
  onUpdateEncounter: (
    encId: string,
    mut: (e: EncounterDefT) => EncounterDefT,
  ) => void;
  onDeleteEncounter: (encId: string) => void;
  /** Play the source scene in the preview modal — branches don't exist
   *  standalone so "play this branch" means "play the scene the branch
   *  is presented on, then click through". */
  onPreview: () => void;
}) {
  const targetScene = storyScenes[branch.next];

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="font-handwritten text-base text-accent-deep">Branch</p>
          <code className="text-sm text-ink">{branch.id}</code>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPreview}
            title="Play the source scene in a preview modal"
            aria-label="Preview branch"
            className="flex h-6 w-6 items-center justify-center rounded-pill bg-emerald/20 text-emerald hover:bg-emerald/30"
          >
            <Play size={12} weight="fill" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete branch"
            aria-label="Delete branch"
            className="flex h-6 w-6 items-center justify-center rounded-pill bg-ruby/15 text-ruby hover:bg-ruby/25"
          >
            <TrashSimple size={12} weight="bold" />
          </button>
        </div>
      </header>

      {/* From → To scene image preview pair */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-semibold uppercase text-ink-soft">
            From
          </p>
          <ScenePreviewImage path={sourceScene.image} alt={sceneId} small />
          <code className="truncate text-[10px] text-ink-soft">{sceneId}</code>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-semibold uppercase text-ink-soft">
            To
          </p>
          {targetScene ? (
            <>
              <ScenePreviewImage
                path={targetScene.image}
                alt={branch.next}
                small
              />
              <code className="truncate text-[10px] text-ink-soft">
                {branch.next}
              </code>
            </>
          ) : (
            <div className="flex h-16 items-center justify-center rounded-card bg-ruby/10 text-[10px] text-ruby">
              missing: {branch.next}
            </div>
          )}
        </div>
      </div>

      <Field label="Label">
        <input
          value={branch.label}
          onChange={(e) => onChange((b) => ({ ...b, label: e.target.value }))}
          className={inputCls}
        />
      </Field>

      <Field label="Companions">
        <div className="flex flex-wrap gap-1">
          {COMPANION_OPTIONS.map((c) => {
            // Is this companion already in the party arriving here (joined on a
            // prior branch)? That decides whether clicking parts them (leave)
            // or recruits them (join).
            const inParty = inheritedCompanions.includes(c.id);
            const joins = branch.addsCompanion === c.id; // recruited HERE
            const leaves = branch.removesCompanion === c.id; // parts HERE
            // Display state (priority): leaves > joined(inherited) > joins.
            const state: "leaves" | "joined" | "joins" | "none" = leaves
              ? "leaves"
              : inParty
                ? "joined"
                : joins
                  ? "joins"
                  : "none";
            const name = characters.find((ch) => ch.id === c.id)?.name ?? c.id;
            return (
              <button
                key={c.id}
                type="button"
                // In-party companion → toggle Leave. Otherwise → toggle Join.
                // Clearing the opposite op keeps the data unambiguous.
                onClick={() =>
                  onChange((b) =>
                    inParty
                      ? {
                          ...b,
                          removesCompanion: leaves ? undefined : c.id,
                          addsCompanion:
                            b.addsCompanion === c.id
                              ? undefined
                              : b.addsCompanion,
                        }
                      : {
                          ...b,
                          addsCompanion: joins ? undefined : c.id,
                          removesCompanion:
                            b.removesCompanion === c.id
                              ? undefined
                              : b.removesCompanion,
                        },
                  )
                }
                title={
                  state === "leaves"
                    ? `${name} leaves the party here`
                    : state === "joined"
                      ? `${name} is already in the party — click to make them leave here`
                      : state === "joins"
                        ? `${name} joins the party here`
                        : `${name} — click to make them join here`
                }
                className={`flex items-center gap-1 rounded-pill py-0.5 pl-0.5 pr-2 text-[11px] transition-colors ${
                  state === "leaves"
                    ? "bg-ruby text-paper"
                    : state === "joined"
                      ? "bg-emerald/20 text-emerald ring-1 ring-emerald/30"
                      : state === "joins"
                        ? "bg-accent-deep text-paper"
                        : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                }`}
              >
                <AssetThumb
                  base={dialoguePortraitBase(storyId, c)}
                  fallbackBase={dialogueFallbackBase(storyId, c)}
                  alt={name}
                  className="h-5 w-5"
                  shape="circle"
                  fit="cover"
                  ringWidth={0}
                />
                {name}
                {state !== "none" && (
                  <span className="text-[9px] font-bold uppercase opacity-90">
                    {state}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Field>

      <BranchOutcomeEditor
        storyId={storyId}
        storyLanguage={storyLanguage}
        storyTitle={storyTitle}
        storyPremise={storyPremise}
        storyScenes={storyScenes}
        sceneId={sceneId}
        sourceScene={sourceScene}
        branch={branch}
        targetScene={targetScene}
        onChange={onChange}
      />

      <hr className="my-1 border-t border-ink-soft/15" />

      {/* Condition — branch only appears as a choice when the player meets
          every clause (AND). Empty clauses = always shown. */}
      <Field label="Condition">
        <div className="flex flex-col gap-2">
          <div>
            <p className="mb-1 text-[11px] font-medium text-ink-soft/80">
              Requires items
            </p>
            <ItemChipPicker
              catalog={items}
              selected={branch.condition?.hasItems ?? []}
              onToggle={(id) =>
                onChange((b) => {
                  const set = new Set(b.condition?.hasItems ?? []);
                  if (set.has(id)) set.delete(id);
                  else set.add(id);
                  return withCondition(b, {
                    hasItems: set.size > 0 ? [...set] : undefined,
                  });
                })
              }
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-ink-soft/80">
              Requires companions
            </p>
            <div className="flex flex-wrap gap-1">
              {COMPANION_OPTIONS.map((c) => {
                const on = (branch.condition?.hasCompanions ?? []).includes(
                  c.id,
                );
                const name =
                  characters.find((ch) => ch.id === c.id)?.name ?? c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      onChange((b) => {
                        const set = new Set(b.condition?.hasCompanions ?? []);
                        if (set.has(c.id)) set.delete(c.id);
                        else set.add(c.id);
                        return withCondition(b, {
                          hasCompanions: set.size > 0 ? [...set] : undefined,
                        });
                      })
                    }
                    className={`flex items-center gap-1 rounded-pill py-0.5 pl-0.5 pr-2 text-[11px] transition-colors ${
                      on
                        ? "bg-accent-deep text-paper"
                        : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                    }`}
                  >
                    <AssetThumb
                      base={dialoguePortraitBase(storyId, c)}
                      fallbackBase={dialogueFallbackBase(storyId, c)}
                      alt={name}
                      className="h-5 w-5"
                      shape="circle"
                      fit="cover"
                      ringWidth={0}
                    />
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Field>

      {/* Encounters rolled when the player takes THIS branch.
          The gating educational challenge is conceptually one of these — it
          lives in `branch.challenge` (not the encounters JSON) but renders as a
          card here alongside battle encounters. */}
      <hr className="my-1 border-t border-ink-soft/15" />
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-ink-soft">
            Encounters ({encounters.length + (branch.challenge?.enabled ? 1 : 0)})
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onAddEncounter()}
              className="rounded-pill bg-ruby/15 px-2 py-0.5 text-xs font-semibold text-ruby hover:bg-ruby/25"
              title="Add a battle that may roll when this branch is taken"
            >
              + Battle
            </button>
            <button
              type="button"
              disabled={!!branch.challenge?.enabled}
              onClick={() =>
                onChange((b) => ({
                  ...b,
                  challenge: b.challenge ?? {
                    enabled: true,
                    category: "auto",
                    count: 1,
                  },
                }))
              }
              className="rounded-pill bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-deep hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
              title={
                branch.challenge?.enabled
                  ? "This branch already has a gating challenge"
                  : "Add an educational challenge players must solve to take this branch"
              }
            >
              + Challenge
            </button>
          </div>
        </div>
        {encounters.length === 0 && !branch.challenge?.enabled ? (
          <p className="px-1 py-2 text-xs text-ink-soft/60">
            No encounters trigger on this branch.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {branch.challenge?.enabled && (
              <BranchChallengeCard
                branch={branch}
                onChange={onChange}
                onRemove={() =>
                  onChange((b) => ({
                    ...b,
                    challenge: undefined,
                  }))
                }
              />
            )}
            {encounters.map((enc) => (
              <EncounterCard
                key={enc.id}
                storyId={storyId}
                encounter={enc}
                monsters={monsters}
                backgrounds={backgrounds}
                items={items}
                onChange={(mut) => onUpdateEncounter(enc.id, mut)}
                onDelete={() => onDeleteEncounter(enc.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Outcome narration editor. Shows a textarea + a "Generate" button that
 * asks the LLM to draft a one-line outcome line from the branch label
 * and the next scene's narration. The author can keep, edit, or clear it.
 */
function BranchOutcomeEditor({
  storyId,
  storyLanguage,
  storyTitle,
  storyPremise,
  storyScenes,
  sceneId,
  sourceScene,
  branch,
  targetScene,
  onChange,
}: {
  storyId: string;
  storyLanguage: string;
  storyTitle: string;
  storyPremise: string;
  storyScenes: Record<string, SceneT>;
  sceneId: string;
  sourceScene: SceneT;
  branch: BranchT;
  targetScene: SceneT | undefined;
  onChange: (mut: (b: BranchT) => BranchT) => void;
}) {
  const [loading, setLoading] = useState(false);
  const confirm = useConfirm();

  async function generate() {
    // Guard an accidental overwrite: if there's already text, confirm first.
    // (The current text is still sent as the request, then replaced.)
    if ((branch.outcome ?? "").trim().length > 0) {
      const ok = await confirm({
        title: "Generate over current text?",
        message:
          "This replaces the Narration below with a fresh AI generation. Your current text is sent as the request to steer it, then overwritten.",
        confirmLabel: "Generate",
        tone: "default",
      });
      if (!ok) return;
    }
    setLoading(true);
    try {
      // Lead-up context: scenes whose branches point INTO this source scene,
      // tagged with the choice label that arrives here (cap a few).
      const incoming = Object.values(storyScenes)
        .flatMap((s) =>
          s.branches
            .filter((b) => b.next === sceneId)
            .map((b) => ({ label: b.label, narration: s.narration })),
        )
        .slice(0, 3);
      // The author's own text doubles as the request/draft — empty means
      // "just generate from the system prompt + context".
      const authorRequest = (branch.outcome ?? "").trim();
      const res = await fetch("/api/branch-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId,
          language: storyLanguage,
          storyTitle,
          storyPremise,
          branchLabel: branch.label,
          sourceNarration: sourceScene.narration,
          nextNarration: targetScene?.narration ?? "",
          nextChoices: targetScene?.branches.map((b) => b.label) ?? [],
          incoming,
          authorRequest: authorRequest || undefined,
        }),
      });
      if (!res.ok) throw new Error(`branch-outcome ${res.status}`);
      const data = (await res.json()) as { outcome: string };
      onChange((b) => ({ ...b, outcome: data.outcome }));
    } catch (err) {
      console.warn("[branch-outcome] generate failed", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Field label="Narration">
      <textarea
        value={branch.outcome ?? ""}
        onChange={(e) =>
          onChange((b) => ({
            ...b,
            outcome: e.target.value || undefined,
          }))
        }
        rows={4}
        placeholder="e.g. {{name}} nods and steps through. {{They}} feel {{their}} pack settle on {{their}} shoulders. (leave empty for no outcome line)"
        className={inputCls}
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <CharCount value={branch.outcome ?? ""} />
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-pill bg-accent/15 px-3 py-1 text-xs font-semibold text-accent-deep hover:bg-accent/25 disabled:opacity-50"
        >
          <Sparkle size={12} weight="fill" />
          {loading ? "Generating…" : "Generate"}
        </button>
      </div>
    </Field>
  );
}

/**
 * Scene narration editor — the scene's main prose, with a "Generate" button
 * that drafts it from the story tone, the lead-up scenes, the scene's speaker,
 * and the choices this scene offers. Mirrors BranchOutcomeEditor (confirm
 * before overwriting, current text doubles as the request).
 */
function SceneNarrationEditor({
  storyId,
  storyLanguage,
  storyTitle,
  storyPremise,
  storyScenes,
  sceneId,
  scene,
  characters,
  onChange,
}: {
  storyId: string;
  storyLanguage: string;
  storyTitle: string;
  storyPremise: string;
  storyScenes: Record<string, SceneT>;
  sceneId: string;
  scene: SceneT;
  characters: CharactersFile["characters"];
  onChange: (mut: (s: SceneT) => SceneT) => void;
}) {
  const [loading, setLoading] = useState(false);
  const confirm = useConfirm();

  async function generate() {
    // Guard an accidental overwrite of existing narration (the current text
    // is still sent as the request, then replaced).
    if (scene.narration.trim().length > 0) {
      const ok = await confirm({
        title: "Generate over current text?",
        message:
          "This replaces the Narration below with a fresh AI generation. Your current text is sent as the request to steer it, then overwritten.",
        confirmLabel: "Generate",
        tone: "default",
      });
      if (!ok) return;
    }
    setLoading(true);
    try {
      // Lead-up context: scenes whose branches point INTO this scene.
      const incoming = Object.values(storyScenes)
        .flatMap((s) =>
          s.branches
            .filter((b) => b.next === sceneId)
            .map((b) => ({ label: b.label, narration: s.narration })),
        )
        .slice(0, 3);
      const speakerName =
        characters.find((c) => c.id === scene.speaker)?.name ?? scene.speaker;
      const authorRequest = scene.narration.trim();
      const res = await fetch("/api/scene-narration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId,
          language: storyLanguage,
          storyTitle,
          storyPremise,
          speaker: scene.speaker,
          speakerName,
          choices: scene.branches.map((b) => b.label),
          incoming,
          authorRequest: authorRequest || undefined,
        }),
      });
      if (!res.ok) throw new Error(`scene-narration ${res.status}`);
      const data = (await res.json()) as { narration: string };
      onChange((s) => ({ ...s, narration: data.narration }));
    } catch (err) {
      console.warn("[scene-narration] generate failed", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Field label="Narration">
      <textarea
        value={scene.narration}
        onChange={(e) =>
          onChange((s) => ({ ...s, narration: e.target.value }))
        }
        rows={8}
        placeholder="e.g. {{name}} pauses at the gate. {{They}} grip {{their}} pack tighter — {{themself}} alone now."
        className={inputCls}
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <CharCount value={scene.narration} />
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-pill bg-accent/15 px-3 py-1 text-xs font-semibold text-accent-deep hover:bg-accent/25 disabled:opacity-50"
        >
          <Sparkle size={12} weight="fill" />
          {loading ? "Generating…" : "Generate"}
        </button>
      </div>
    </Field>
  );
}

/** Challenge category options for the branch-gate picker. `auto` lets the
 *  generator pick an age-appropriate category at runtime (the default). */
const CHALLENGE_CATEGORIES: { value: "auto" | ChallengeCategory; label: string }[] = [
  { value: "auto", label: "Auto (Mixed)" },
  { value: "counting", label: "Counting" },
  { value: "shape", label: "Shapes" },
  { value: "compare", label: "Compare" },
  { value: "odd-one-out", label: "Odd one out" },
  { value: "pattern", label: "Number pattern" },
  { value: "add", label: "Addition" },
  { value: "sub", label: "Subtraction" },
  { value: "multiply", label: "Multiplication" },
  { value: "divide", label: "Division" },
  { value: "missing", label: "Missing number" },
  { value: "fraction", label: "Fractions" },
  { value: "decimal", label: "Decimals" },
  { value: "percentage", label: "Percentage" },
  { value: "ratio", label: "Ratio" },
  { value: "money", label: "Money" },
  { value: "time", label: "Time" },
  { value: "measure", label: "Area / perimeter / volume" },
  { value: "geometry", label: "Geometry / angles" },
  { value: "average", label: "Average" },
  { value: "factors", label: "Factors & multiples" },
  { value: "algebra", label: "Algebra" },
  { value: "speed", label: "Speed" },
  { value: "word", label: "Word / thinking" },
];

function BranchChallengeCard({
  branch,
  onChange,
  onRemove,
}: {
  branch: BranchT;
  onChange: (mut: (b: BranchT) => BranchT) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const challenge = branch.challenge;
  if (!challenge?.enabled) return null;
  return (
    <li className="rounded-card bg-paper ring-1 ring-ink-soft/10">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left"
        >
          <p className="text-xs font-semibold text-ink">Challenge</p>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Hide details" : "Edit challenge"}
            aria-label={expanded ? "Hide details" : "Edit challenge"}
            className="flex h-5 w-5 items-center justify-center rounded-pill bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
          >
            <PencilSimple size={10} weight="bold" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Remove challenge"
            aria-label="Remove challenge"
            className="flex h-5 w-5 items-center justify-center rounded-pill bg-ruby/15 text-ruby hover:bg-ruby/25"
          >
            <TrashSimple size={10} weight="bold" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-ink-soft/10 p-3">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-ink-soft">Type:</span>
              <StyledSelect
                className="flex-1"
                value={challenge.category}
                onChange={(e) =>
                  onChange((b) =>
                    b.challenge?.enabled
                      ? {
                          ...b,
                          challenge: {
                            ...b.challenge,
                            category: e.target.value as
                              | "auto"
                              | ChallengeCategory,
                          },
                        }
                      : b,
                  )
                }
              >
                {CHALLENGE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </StyledSelect>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="text-ink-soft">Problems:</span>
              <input
                type="number"
                min={1}
                max={10}
                value={challenge.count ?? 1}
                onChange={(e) =>
                  onChange((b) =>
                    b.challenge?.enabled
                      ? {
                          ...b,
                          challenge: {
                            ...b.challenge,
                            count: Math.max(
                              1,
                              Math.min(10, Math.floor(Number(e.target.value) || 1)),
                            ),
                          },
                        }
                      : b,
                  )
                }
                className={`${inputCls} max-w-[5rem] tabular-nums`}
              />
            </label>
          </div>
        </div>
      )}
    </li>
  );
}

function RewardEditor({
  label,
  items,
  reward,
  onChange,
}: {
  label: string;
  items: ItemDefT[];
  reward?: { items?: string[] };
  onChange: (reward: { items?: string[] } | undefined) => void;
}) {
  const itemSet = new Set(reward?.items ?? []);
  function commit(next: { items?: string[] }) {
    onChange(
      next.items && next.items.length > 0 ? { items: next.items } : undefined,
    );
  }
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-ink-soft">
        {label}
      </p>
      <div className="flex flex-col gap-2">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase text-ink-soft/70">
            Item
          </p>
          <div className="flex flex-wrap gap-1">
            {items.map((it) => {
              const on = itemSet.has(it.id);
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    const set = new Set(reward?.items ?? []);
                    if (set.has(it.id)) set.delete(it.id);
                    else set.add(it.id);
                    commit({ items: set.size > 0 ? [...set] : undefined });
                  }}
                  className={`rounded-pill px-1.5 py-0.5 text-[10px] transition-colors ${
                    on
                      ? "bg-accent-deep text-paper"
                      : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                  }`}
                >
                  {it.icon ?? "🎁"} {it.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────

/**
 * Multi-select editor for `Scene.dialogueCharacters`. Tap a chip to
 * toggle whether that character is available on the dialogue rail for
 * this scene (in addition to active companions + the scene speaker).
 */
function DialogueCharactersEditor({
  storyId,
  characters,
  scene,
  onChange,
}: {
  storyId: string;
  characters: CharactersFile["characters"];
  scene: SceneT;
  onChange: (mut: (s: SceneT) => SceneT) => void;
}) {
  const selected = new Set(scene.dialogueCharacters ?? []);
  // Dialogue-able = characters that hold a persona (only they can chat). Derived
  // from the story's own catalog so every story offers its own cast.
  const ableChars = characters.filter((c) => !!c.persona);
  function toggle(id: SpeakerId) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange((s) => ({
      ...s,
      dialogueCharacters:
        next.size > 0 ? (Array.from(next) as SceneT["dialogueCharacters"]) : undefined,
    }));
  }
  return (
    <Field label="Interactive Character">
      <div className="flex flex-wrap gap-1">
        {ableChars.map((c) => {
          const id = c.id;
          const on = selected.has(id);
          const name = c.name;
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className={`flex items-center gap-1 rounded-pill py-0.5 pl-0.5 pr-2 text-[11px] transition-colors ${
                on
                  ? "bg-accent-deep text-paper"
                  : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
              }`}
            >
              <AssetThumb
                base={dialoguePortraitBase(storyId, c)}
                fallbackBase={dialogueFallbackBase(storyId, c)}
                alt={name}
                className="h-5 w-5"
                shape="circle"
                fit="cover"
                ringWidth={0}
              />
              {name}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/**
 * Scene "asks" editor — authored questions surfaced in the choice area,
 * each answered in-character. Answerers are limited to persona-bearing
 * characters (only they can hold a dialogue).
 */
/** Default-shaped ask appended by the "+ Add ask" button. */
function newAsk(askable: { id: string }[]): SceneAskT {
  return {
    id: `ask_${Math.random().toString(36).slice(2, 7)}`,
    label: "",
    characterId: (askable[0]?.id ?? "narrator") as SceneAskT["characterId"],
  };
}

/**
 * Ask rows shown alongside the branch list (the player sees branch choices
 * and ask chips together). The "+ Add ask" button lives in the branch
 * header next to "+ Add branch"; this only renders the existing rows.
 */
/**
 * A single ask, collapsed by default (like an EncounterCard). The header shows
 * the answerer portrait + label; the pencil expands the editor (label input,
 * answerer picker, char count).
 */
function AskRow({
  ask,
  storyId,
  askable,
  onUpdate,
  onRemove,
}: {
  ask: SceneAskT;
  storyId: string;
  askable: CharactersFile["characters"];
  onUpdate: (mut: (a: SceneAskT) => SceneAskT) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const answerer = askable.find((c) => c.id === ask.characterId);
  return (
    <div className="rounded-card bg-paper-deep/30">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {answerer && (
            <AssetThumb
              base={dialoguePortraitBase(storyId, answerer)}
              fallbackBase={dialogueFallbackBase(storyId, answerer)}
              alt={answerer.name}
              className="h-5 w-5 shrink-0"
              shape="circle"
              fit="cover"
              ringWidth={0}
            />
          )}
          <span className="truncate text-xs font-semibold text-ink">
            {ask.label || "(untitled ask)"}
          </span>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Hide details" : "Edit ask"}
            aria-label={expanded ? "Hide details" : "Edit ask"}
            className="flex h-5 w-5 items-center justify-center rounded-pill bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
          >
            <PencilSimple size={10} weight="bold" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Remove ask"
            aria-label="Remove ask"
            className="flex h-5 w-5 items-center justify-center rounded-pill bg-ruby/15 text-ruby hover:bg-ruby/25"
          >
            <TrashSimple size={10} weight="bold" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="flex flex-col gap-1 border-t border-ink-soft/10 p-2">
          <input
            value={ask.label}
            onChange={(e) => onUpdate((a) => ({ ...a, label: e.target.value }))}
            placeholder="e.g. What is a cyclone?"
            className={inputClsSm}
          />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-ink-soft/60">
              Answered by
            </span>
            {/* Single-select portrait chips — mirrors the Interactive
                Character picker, but exactly one answerer at a time. */}
            <div className="flex flex-wrap gap-1">
              {askable.map((c) => {
                const on = ask.characterId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      onUpdate((a) => ({
                        ...a,
                        characterId: c.id as SceneAskT["characterId"],
                      }))
                    }
                    className={`flex items-center gap-1 rounded-pill py-0.5 pl-0.5 pr-2 text-[11px] transition-colors ${
                      on
                        ? "bg-accent-deep text-paper"
                        : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                    }`}
                  >
                    <AssetThumb
                      base={dialoguePortraitBase(storyId, c)}
                      fallbackBase={dialogueFallbackBase(storyId, c)}
                      alt={c.name}
                      className="h-5 w-5"
                      shape="circle"
                      fit="cover"
                      ringWidth={0}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
          <CharCount value={ask.label} limit={120} />
        </div>
      )}
    </div>
  );
}

function SceneAsksEditor({
  storyId,
  characters,
  scene,
  onChange,
}: {
  storyId: string;
  characters: CharactersFile["characters"];
  scene: SceneT;
  onChange: (mut: (s: SceneT) => SceneT) => void;
}) {
  const asks = scene.asks ?? [];
  const askable = characters.filter((c) => !!c.persona);

  function setAsks(next: SceneAskT[]) {
    onChange((s) => ({ ...s, asks: next.length > 0 ? next : undefined }));
  }

  if (asks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {asks.map((ask, i) => (
        <AskRow
          key={ask.id}
          ask={ask}
          storyId={storyId}
          askable={askable}
          onUpdate={(mut) => setAsks(asks.map((a, j) => (j === i ? mut(a) : a)))}
          onRemove={() => setAsks(asks.filter((_, j) => j !== i))}
        />
      ))}
    </div>
  );
}

type SelectOption = string | { value: string; label: string };

/**
 * Native select styled to match the other admin inputs. The default
 * browser dropdown arrow is replaced with a Phosphor chevron pinned
 * slightly inside the right edge.
 *
 * - `options` accepts strings or `{value, label}` objects so callers can
 *   show a short label (e.g. file basename) while keeping the full path
 *   as the stored value.
 * - If `value` is not in `options`, it is surfaced as a top "(custom)"
 *   entry so we never silently drop existing data.
 * - `allowEmpty` adds a top sentinel for the empty value
 *   (e.g. `(no medal)` on optional fields).
 */
function SelectWithCustom({
  value,
  options,
  onChange,
  placeholder,
  allowEmpty,
}: {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  allowEmpty?: string;
}) {
  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  const knownValues = new Set(normalized.map((o) => o.value));
  const showCustom = !!value && !knownValues.has(value);
  return (
    <StyledSelect value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {normalized.length === 0 && !allowEmpty && placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {showCustom && <option value={value}>{value} (custom)</option>}
      {normalized.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </StyledSelect>
  );
}

/**
 * Scene image preview — uses the shared AssetThumb so the extension
 * fallback chain (.webp → .png → .jpeg → .jpg + uppercase) stays
 * consistent everywhere admin renders an image.
 */
function ScenePreviewImage({
  path,
  alt,
  small,
}: {
  path: string;
  alt: string;
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const height = small ? "h-16" : "h-32";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${alt} preview`}
        className={`${height} w-full overflow-hidden rounded-card transition-opacity hover:opacity-90`}
      >
        <AssetThumb
          base={path}
          alt={alt}
          className="h-full w-full"
          shape="square"
          fit="cover"
        />
      </button>
      {open && <ImageLightbox path={path} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Fullscreen image preview portal. Click backdrop or press ESC to close.
 * Uses the same extension fallback chain as the inline thumbnails so the
 * lightbox can never disagree with what the small preview was showing.
 */
function ImageLightbox({
  path,
  alt,
  onClose,
}: {
  path: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof window === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/85"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute right-4 top-4 z-[91] flex h-9 w-9 items-center justify-center rounded-pill bg-paper/85 text-ink shadow-button ring-1 ring-ink-soft/20 hover:bg-paper"
      >
        <X size={16} weight="bold" />
      </button>
      <div
        className="relative max-h-[92vh] max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <AssetThumb
          base={path}
          alt={alt}
          className="max-h-[92vh] max-w-[92vw]"
          shape="square"
          fit="contain"
        />
      </div>
    </div>,
    document.body,
  );
}
