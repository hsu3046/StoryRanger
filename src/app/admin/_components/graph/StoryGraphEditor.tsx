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
  type MedalT,
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
import { AssetThumb } from "../AssetThumb";
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
  /** Medal catalog used by the medal-id dropdowns. */
  medals: MedalT[];
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
  medals,
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

  // New scenes get their default position assigned in `addScene` directly,
  // so we don't need an effect to sync. Inline fallback in the node builder
  // covers the unlikely case of a scene appearing without a recorded
  // position (e.g. external file edit while admin is open).

  // Count of encounters attached per (sceneId, branchId) — drives the ⚔
  // chip on BranchEdge so authors can see at a glance which branches roll
  // a battle.
  const encounterCountByBranch = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of encounters) {
      const key = `${e.trigger.sceneId}__${e.trigger.branchId}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [encounters]);

  const dirty = useMemo(
    () =>
      JSON.stringify(initialStory) !== JSON.stringify(story) ||
      JSON.stringify(initialEncounters) !== JSON.stringify(encounters),
    [initialStory, story, initialEncounters, encounters],
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
  const sceneDataById = useMemo(() => {
    const map: Record<string, SceneNodeData> = {};
    for (const [id, scene] of Object.entries(story.scenes)) {
      map[id] = {
        sceneId: id,
        scene,
        isStart: id === story.startScene,
        storyId,
        heroId,
      };
    }
    return map;
  }, [story.scenes, story.startScene, storyId, heroId]);

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
        const data: BranchEdgeData = {
          branch: b,
          parallelIdx,
          parallelCount: arr.length,
          encounterCount:
            encounterCountByBranch.get(`${sourceId}__${b.id}`) ?? 0,
          storyId,
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
  }, [story.scenes, encounterCountByBranch, selection, storyId]);

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

  /** Clone the scene under a new id. Everything else (image, bgm, speaker,
   *  narration, branches, reward, ending, dialogueCharacters) is deep-copied
   *  verbatim. New id is `{sourceId}_2`, `_3`, ... — first unused suffix.
   *
   *  Encounters cascade too: every encounter tied to a branch of the
   *  source scene is cloned with `trigger.sceneId` rewritten to the new
   *  scene id (branchId stays — branch ids are scoped to their parent
   *  scene's `branches` array). New encounter id follows the existing
   *  `{sceneId}__{branchId}-battle[-N]` pattern so duplicates don't
   *  collide with the originals. */
  function duplicateScene(sceneId: string) {
    const src = story.scenes[sceneId];
    if (!src) return;
    let suffix = 2;
    let newId = `${sceneId}_${suffix}`;
    while (story.scenes[newId]) {
      suffix += 1;
      newId = `${sceneId}_${suffix}`;
    }
    // Deep clone via JSON to detach all nested refs (branches, reward, etc).
    const cloned = JSON.parse(JSON.stringify(src)) as SceneT;
    setStory((prev) => ({
      ...prev,
      scenes: {
        ...prev.scenes,
        [newId]: cloned,
      },
    }));

    // Cascade encounters tied to branches of the source scene.
    const sourceEncounters = encounters.filter(
      (e) => e.trigger.sceneId === sceneId,
    );
    if (sourceEncounters.length > 0) {
      // Build a fresh id-collision check that includes both the existing
      // catalog AND any duplicates we mint in this same pass.
      const existingIds = new Set(encounters.map((e) => e.id));
      const cloned: EncounterDefT[] = [];
      for (const e of sourceEncounters) {
        let baseId = `${newId}__${e.trigger.branchId}-battle`;
        let i = 0;
        while (existingIds.has(baseId)) {
          i += 1;
          baseId = `${newId}__${e.trigger.branchId}-battle-${i}`;
        }
        existingIds.add(baseId);
        cloned.push({
          ...(JSON.parse(JSON.stringify(e)) as EncounterDefT),
          id: baseId,
          trigger: { ...e.trigger, sceneId: newId },
        });
      }
      setEncounters((prev) => [...prev, ...cloned]);
    }

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
      title: "New Battle",
      trigger: { sceneId, branchId, count: 1 },
      intro: {
        bg: "forest-clearing",
        narration: "(intro narration)",
      },
      body: { kind: "battle", monsterIds: [] },
      rewards: {},
      outro: { victory: "(victory line)" },
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
            onInit={onInit}
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
                  items={items}
                  medals={medals}
                  sceneImages={sceneImages}
                  bgmOptions={bgmOptions}
                  onChange={(mut) => updateScene(selectedScene.id, mut)}
                  onAddBranch={() => addBranch(selectedScene.id)}
                  onDuplicate={() => duplicateScene(selectedScene.id)}
                  onDelete={() => deleteScene(selectedScene.id)}
                  onDeleteBranch={(branchId) =>
                    deleteBranch(selectedScene.id, branchId)
                  }
                  onPreview={() => setPreviewSceneId(selectedScene.id)}
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
                    branch={selectedBranch}
                    sourceScene={selectedScene.scene}
                    encounters={encounters.filter(
                      (e) =>
                        e.trigger.sceneId === selectedScene.id &&
                        e.trigger.branchId === selectedBranch.id,
                    )}
                    monsters={monsters}
                    backgrounds={backgrounds}
                    medals={medals}
                    bgmOptions={bgmOptions}
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
                    onPreview={() => setPreviewSceneId(selectedScene.id)}
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
        onClose={() => setPreviewSceneId(null)}
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
  items,
  medals,
  characters,
  sceneImages,
  bgmOptions,
  onChange,
  onAddBranch,
  onDuplicate,
  onDelete,
  onDeleteBranch,
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
  items: ItemDefT[];
  medals: MedalT[];
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
}) {
  const confirm = useConfirm();
  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="font-handwritten text-base text-accent-deep">Scene</p>
          <code className="text-sm text-ink">{sceneId}</code>
        </div>
        <div className="flex items-center gap-1">
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
          // stored value as a "(custom)" entry.
          options={[
            { value: "narrator", label: "narrator" },
            ...characters.map((c) => ({ value: c.id, label: c.name })),
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
        medals={medals}
        reward={scene.reward}
        onChange={(reward) => onChange((s) => ({ ...s, reward }))}
      />

      <Field label="Ending">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!scene.ending}
            onChange={async (e) => {
              const checked = e.target.checked;
              // Marking a scene as an ending stops the story here — gate it
              // behind the same custom confirm modal as deletes. Unchecking
              // needs no warning.
              if (checked) {
                const ok = await confirm({
                  title: "Mark as ending?",
                  message:
                    "This makes the scene a terminal ending — the story stops here and its branches won't be reachable in play. Mark it as an ending?",
                  confirmLabel: "Mark as ending",
                });
                if (!ok) return;
              }
              onChange((s) => ({
                ...s,
                ending: checked
                  ? s.ending ?? { id: sceneId, label: "" }
                  : undefined,
              }));
            }}
          />
          <span className="text-sm text-ink-soft">Terminal scene</span>
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

      {/* Branch choices + ask chips are authored together — the player sees
          both in the same choice area at runtime. */}
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
                className={`flex items-center justify-between gap-2 rounded-card px-2 py-1 text-xs ring-1 ${
                  missingTarget
                    ? "bg-ruby/10 ring-ruby/30"
                    : "bg-paper ring-ink-soft/10"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{b.label}</p>
                  <p className="text-[10px] text-ink-soft/70">
                    <code>{b.id}</code>{" "}
                    <span
                      className={missingTarget ? "text-ruby" : undefined}
                      title={
                        missingTarget
                          ? `Target scene "${b.next}" no longer exists — this branch is dangling. Use the delete button to clean it up.`
                          : undefined
                      }
                    >
                      → {missingTarget ? `⚠ ${b.next}` : b.next}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteBranch(b.id)}
                  title={`Delete branch "${b.id}"`}
                  aria-label={`Delete branch ${b.id}`}
                  className="shrink-0 rounded-pill bg-ruby/15 px-1.5 py-0.5 text-[10px] text-ruby hover:bg-ruby/25"
                >
                  ✕
                </button>
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
  medals,
  onChange,
  onDelete,
}: {
  storyId: string;
  encounter: EncounterDefT;
  monsters: MonsterStatsT[];
  backgrounds: BackgroundMetaT[];
  medals: MedalT[];
  onChange: (mut: (e: EncounterDefT) => EncounterDefT) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = encounter.trigger.count ?? 1;

  return (
    <li className="rounded-card bg-paper ring-1 ring-ink-soft/10">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left"
        >
          <p className="text-xs font-semibold text-ink">
            {encounter.title}
            {count > 1 && (
              <span className="ml-1 font-normal text-ink-soft">× {count}</span>
            )}
          </p>
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
          <MiniField label="Title">
            <input
              value={encounter.title}
              onChange={(e) =>
                onChange((x) => ({ ...x, title: e.target.value }))
              }
              className={inputClsSm}
            />
          </MiniField>
          <MiniField label="Number of battles">
            <input
              type="number"
              min={1}
              step={1}
              value={count}
              onChange={(e) => {
                const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                onChange((x) => ({
                  ...x,
                  trigger: {
                    ...x.trigger,
                    count: v === 1 ? undefined : v,
                  },
                }));
              }}
              className={inputClsSm}
            />
          </MiniField>
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
          </MiniField>
          <MiniField label="Narration">
            <textarea
              value={encounter.intro.narration}
              onChange={(e) =>
                onChange((x) => ({
                  ...x,
                  intro: { ...x.intro, narration: e.target.value },
                }))
              }
              rows={5}
              className={inputClsSm}
            />
            <CharCount value={encounter.intro.narration} />
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
            <p className="rounded-button bg-paper-deep/30 px-2 py-1.5 text-[11px] italic text-ink-soft/70">
              Battle drops are sourced from each monster&apos;s{" "}
              <code>drops</code> field — edit per monster on the Monsters
              page.
            </p>
          </MiniField>

          <MiniField label="Medal (optional)">
            <div className="flex flex-wrap gap-1">
              {medals.map((m) => {
                const on = encounter.rewards.medalId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      onChange((x) => ({
                        ...x,
                        rewards: {
                          ...x.rewards,
                          medalId: on ? undefined : m.id,
                        },
                      }))
                    }
                    className={`rounded-pill px-1.5 py-0.5 text-[10px] transition-colors ${
                      on
                        ? "bg-accent-deep text-paper"
                        : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                    }`}
                  >
                    {m.icon} {m.name}
                  </button>
                );
              })}
            </div>
          </MiniField>

          <MiniField label="Narration on victory">
            <textarea
              value={encounter.outro.victory}
              onChange={(e) =>
                onChange((x) => ({
                  ...x,
                  outro: { ...x.outro, victory: e.target.value },
                }))
              }
              rows={5}
              className={inputClsSm}
            />
            <CharCount value={encounter.outro.victory} />
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

function BranchInspector({
  storyId,
  storyLanguage,
  storyTitle,
  storyPremise,
  storyScenes,
  sceneId,
  branch,
  sourceScene,
  encounters,
  monsters,
  backgrounds,
  medals,
  characters,
  bgmOptions,
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
  branch: BranchT;
  sourceScene: SceneT;
  encounters: EncounterDefT[];
  monsters: MonsterStatsT[];
  backgrounds: BackgroundMetaT[];
  medals: MedalT[];
  /** Character catalog — Add-companion chips show `name` not raw id. */
  characters: { id: string; name: string }[];
  bgmOptions: string[];
  onChange: (mut: (b: BranchT) => BranchT) => void;
  onDelete: () => void;
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
      <header className="flex items-center justify-between">
        <div>
          <p className="font-handwritten text-base text-accent-deep">Branch</p>
          <code className="text-xs text-ink-soft">{branch.id}</code>
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

      <Field label="Add companion">
        <div className="flex flex-wrap gap-1">
          {COMPANION_OPTIONS.map((c) => {
            const on = branch.addsCompanion === c.id;
            const name = characters.find((ch) => ch.id === c.id)?.name ?? c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  onChange((b) => ({
                    ...b,
                    addsCompanion: on ? undefined : c.id,
                  }))
                }
                className={`flex items-center gap-1 rounded-pill py-0.5 pl-0.5 pr-2 text-[11px] transition-colors ${
                  on
                    ? "bg-accent-deep text-paper"
                    : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                }`}
              >
                <AssetThumb
                  base={`/stories/${storyId}/dialogue/${c.id}`}
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

      <Field label="BGM override (optional)">
        <BgmSelectWithPreview
          value={branch.bgmOverride ?? ""}
          options={bgmOptions}
          storyId={storyId}
          allowEmpty="Default (Scene's BGM)"
          onChange={(v) =>
            onChange((b) => ({
              ...b,
              bgmOverride: v || undefined,
            }))
          }
        />
      </Field>

      {/* Encounters rolled when the player takes THIS branch.
          The gating puzzle is conceptually one of these — it lives in
          `branch.puzzle` (not the encounters JSON) but renders as a card
          here alongside battle encounters. */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-ink-soft">
            Encounters ({encounters.length + (branch.puzzle ? 1 : 0)})
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
              disabled={!!branch.puzzle}
              onClick={() =>
                onChange((b) => ({
                  ...b,
                  puzzle: b.puzzle ?? DEFAULT_BRANCH_PUZZLE,
                  onFailMode: b.onFailMode ?? "retry",
                }))
              }
              className="rounded-pill bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-deep hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
              title={
                branch.puzzle
                  ? "This branch already has a gating puzzle"
                  : "Add a gating puzzle players must solve to take this branch"
              }
            >
              + Puzzle
            </button>
          </div>
        </div>
        {encounters.length === 0 && !branch.puzzle ? (
          <p className="px-1 py-2 text-xs text-ink-soft/60">
            No encounters trigger on this branch.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {branch.puzzle && (
              <BranchPuzzleCard
                branch={branch}
                onChange={onChange}
                onRemove={() =>
                  onChange((b) => ({
                    ...b,
                    puzzle: undefined,
                    onFailMode: undefined,
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
                medals={medals}
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
        rows={5}
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
        rows={5}
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

/** Default puzzle shape used when the author clicks "+ Puzzle". */
const DEFAULT_BRANCH_PUZZLE = {
  kind: "sequence" as const,
  title: "Repeat the pattern",
  symbols: ["🔵", "🟡", "🔴"],
  sequence: [0, 1, 2],
};

function BranchPuzzleCard({
  branch,
  onChange,
  onRemove,
}: {
  branch: BranchT;
  onChange: (mut: (b: BranchT) => BranchT) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const puzzle = branch.puzzle;
  if (!puzzle) return null;
  return (
    <li className="rounded-card bg-paper ring-1 ring-ink-soft/10">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left"
        >
          <code className="text-xs text-ink">puzzle</code>
          <p className="text-[11px] text-ink-soft">{puzzle.title}</p>
          <p className="text-[10px] text-ink-soft/70">
            🧩 pattern memory · {puzzle.symbols.length} symbol
            {puzzle.symbols.length === 1 ? "" : "s"} · {puzzle.sequence.length} step
            {puzzle.sequence.length === 1 ? "" : "s"}
          </p>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Hide details" : "Edit puzzle"}
            aria-label={expanded ? "Hide details" : "Edit puzzle"}
            className="flex h-5 w-5 items-center justify-center rounded-pill bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
          >
            <PencilSimple size={10} weight="bold" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Remove puzzle"
            aria-label="Remove puzzle"
            className="flex h-5 w-5 items-center justify-center rounded-pill bg-ruby/15 text-ruby hover:bg-ruby/25"
          >
            <TrashSimple size={10} weight="bold" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-ink-soft/10 p-3">
          <div className="flex flex-col gap-2">
          <input
            value={puzzle.title}
            onChange={(e) =>
              onChange((b) =>
                b.puzzle
                  ? { ...b, puzzle: { ...b.puzzle, title: e.target.value } }
                  : b,
              )
            }
            className={inputCls}
            placeholder="puzzle title (in-world framing)"
          />
          <input
            value={puzzle.symbols.join(" ")}
            onChange={(e) =>
              onChange((b) =>
                b.puzzle
                  ? {
                      ...b,
                      puzzle: {
                        ...b.puzzle,
                        symbols: e.target.value
                          .split(/\s+/)
                          .filter((s) => s.length > 0),
                      },
                    }
                  : b,
              )
            }
            className={inputCls}
            placeholder="symbols (space-separated emojis)"
          />
          <input
            value={puzzle.sequence.join(",")}
            onChange={(e) =>
              onChange((b) =>
                b.puzzle
                  ? {
                      ...b,
                      puzzle: {
                        ...b.puzzle,
                        sequence: e.target.value
                          .split(",")
                          .map((s) => Number(s.trim()))
                          .filter((n) => Number.isFinite(n)),
                      },
                    }
                  : b,
              )
            }
            className={inputCls}
            placeholder="sequence as indices (e.g. 0,1,2,1)"
          />
          <label className="flex items-center gap-2 text-xs">
            <span className="text-ink-soft">On fail:</span>
            <StyledSelect
              className="flex-1"
              value={branch.onFailMode ?? "retry"}
              onChange={(e) =>
                onChange((b) => ({
                  ...b,
                  onFailMode: e.target.value as "retry" | "skip",
                }))
              }
            >
              <option value="retry">Retry until solved</option>
              <option value="skip">Skip — proceed without reward</option>
            </StyledSelect>
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
  medals,
  reward,
  onChange,
}: {
  label: string;
  items: ItemDefT[];
  medals: MedalT[];
  reward?: { items?: string[]; medalId?: string };
  onChange: (reward: { items?: string[]; medalId?: string } | undefined) => void;
}) {
  const itemSet = new Set(reward?.items ?? []);
  function commit(next: { items?: string[]; medalId?: string }) {
    const cleaned: { items?: string[]; medalId?: string } = {};
    if (next.items && next.items.length > 0) cleaned.items = next.items;
    if (next.medalId) cleaned.medalId = next.medalId;
    onChange(Object.keys(cleaned).length > 0 ? cleaned : undefined);
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
                    commit({
                      items: set.size > 0 ? [...set] : undefined,
                      medalId: reward?.medalId,
                    });
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
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase text-ink-soft/70">
            Medal
          </p>
          <div className="flex flex-wrap gap-1">
            {medals.map((m) => {
              const on = reward?.medalId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    commit({
                      items: reward?.items,
                      medalId: on ? undefined : m.id,
                    });
                  }}
                  className={`rounded-pill px-1.5 py-0.5 text-[10px] transition-colors ${
                    on
                      ? "bg-accent-deep text-paper"
                      : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                  }`}
                >
                  {m.icon} {m.name}
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
                base={`/stories/${storyId}/dialogue/${id}`}
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
  function update(i: number, mut: (a: SceneAskT) => SceneAskT) {
    setAsks(asks.map((a, j) => (j === i ? mut(a) : a)));
  }

  if (asks.length === 0) return null;

  return (
    <Field label="Asks">
      <div className="flex flex-col gap-2">
        {asks.map((ask, i) => (
          <div
            key={ask.id}
            className="flex flex-col gap-1 rounded-card bg-paper-deep/30 p-2"
          >
            <div className="flex items-center gap-1.5">
              <input
                value={ask.label}
                onChange={(e) =>
                  update(i, (a) => ({ ...a, label: e.target.value }))
                }
                placeholder="e.g. What is a cyclone?"
                className={inputClsSm}
              />
              <button
                type="button"
                onClick={() => setAsks(asks.filter((_, j) => j !== i))}
                aria-label="Remove ask"
                className="shrink-0 rounded-pill bg-ruby/15 px-2 py-1 text-xs text-ruby hover:bg-ruby/25"
              >
                ✕
              </button>
            </div>
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
                        update(i, (a) => ({
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
                        base={`/stories/${storyId}/dialogue/${c.id}`}
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
        ))}
      </div>
    </Field>
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
