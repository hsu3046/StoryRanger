"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type EdgeMouseHandler,
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
  type SceneT,
  type StoryT,
} from "@/data/schemas";
import {
  saveEncountersAction,
  saveScenesAction,
} from "../../_actions/saveJson";
import { AssetThumb } from "../AssetThumb";
import { SceneNode, type SceneNodeData } from "./SceneNode";
import { BranchEdge, type BranchEdgeData } from "./BranchEdge";
import { computeLayout } from "./layout";

interface Props {
  storyId: string;
  initialStory: StoryT;
  initialEncounters: EncounterDefT[];
  /** For encounter authoring: monster + item catalogs used in dropdowns. */
  monsters: MonsterStatsT[];
  items: ItemDefT[];
  /** Background catalog used in the scene/encounter `bg` dropdowns. */
  backgrounds: BackgroundMetaT[];
}

const nodeTypes = { scene: SceneNode };
const edgeTypes = { branch: BranchEdge };

type Selection =
  | { kind: "scene"; sceneId: string }
  | { kind: "branch"; sceneId: string; branchId: string }
  | null;

export function StoryGraphEditor({
  storyId,
  initialStory,
  initialEncounters,
  monsters,
  items,
  backgrounds,
}: Props) {
  const router = useRouter();
  const [story, setStory] = useState<StoryT>(initialStory);
  const [encounters, setEncounters] =
    useState<EncounterDefT[]>(initialEncounters);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
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
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration
        setPositions((prev) => ({ ...prev, ...saved }));
      }
    } catch {
      /* swallow malformed storage */
    }
    setPosHydrated(true);
  }, [positionKey]);

  useEffect(() => {
    if (!posHydrated) return;
    try {
      window.localStorage.setItem(positionKey, JSON.stringify(positions));
    } catch {
      /* swallow storage quota */
    }
  }, [positions, positionKey, posHydrated]);

  // New scenes get their default position assigned in `addScene` directly,
  // so we don't need an effect to sync. Inline fallback in the node builder
  // covers the unlikely case of a scene appearing without a recorded
  // position (e.g. external file edit while admin is open).

  const encounterSet = useMemo(
    () => new Set(encounters.map((e) => e.trigger.afterScene)),
    [encounters],
  );

  const dirty = useMemo(
    () =>
      JSON.stringify(initialStory) !== JSON.stringify(story) ||
      JSON.stringify(initialEncounters) !== JSON.stringify(encounters),
    [initialStory, story, initialEncounters, encounters],
  );

  // Build React Flow graph from story. Positions come from `positions`
  // state (drag-aware + localStorage-persisted), not recomputed every
  // render.
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = Object.entries(story.scenes).map(
      ([id, scene]) => {
        const data: SceneNodeData = {
          sceneId: id,
          scene,
          isStart: id === story.startScene,
          hasEncounter: encounterSet.has(id),
        };
        return {
          id,
          type: "scene",
          position: positions[id] ?? { x: 0, y: 0 },
          data: data as unknown as Record<string, unknown>,
          draggable: true,
          selected:
            selection?.kind === "scene" && selection.sceneId === id,
        };
      },
    );
    // First pass — group branches by (source, target) so we can assign
    // parallel-edge indices for label offsetting.
    type Pending = {
      sourceId: string;
      branch: BranchT;
    };
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

    const edges: Edge[] = [];
    for (const arr of groups.values()) {
      arr.forEach(({ sourceId, branch: b }, parallelIdx) => {
        const edgeId = `${sourceId}__${b.id}`;
        const data: BranchEdgeData = {
          branch: b,
          parallelIdx,
          parallelCount: arr.length,
        };
        edges.push({
          id: edgeId,
          source: sourceId,
          target: b.next,
          type: "branch",
          data: data as unknown as Record<string, unknown>,
          selected:
            selection?.kind === "branch" &&
            selection.sceneId === sourceId &&
            selection.branchId === b.id,
        });
      });
    }
    return { nodes, edges };
  }, [story, encounterSet, selection, positions]);

  // Drag handler — fold React Flow's position changes back into our
  // `positions` state, which then re-renders the nodes via the useMemo
  // below. We deliberately ignore non-position changes (selection etc.
  // are managed via onNodeClick / onEdgeClick / onPaneClick instead).
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    let touched = false;
    setPositions((prev) => {
      const next = { ...prev };
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          next[c.id] = { x: c.position.x, y: c.position.y };
          touched = true;
        }
      }
      return touched ? next : prev;
    });
  }, []);

  function runAutoLayout() {
    if (!confirm("Auto-layout all scenes? This overrides any manual positions.")) {
      return;
    }
    setPositions(computeLayout(story.scenes));
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
    // Place near canvas origin so the user can immediately find + drag it.
    setPositions((prev) => ({
      ...prev,
      [id]: { x: 80, y: 80 },
    }));
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

  function deleteBranch(sceneId: string, branchId: string) {
    if (!confirm(`Delete branch "${branchId}" from ${sceneId}?`)) return;
    updateScene(sceneId, (s) => ({
      ...s,
      branches: s.branches.filter((b) => b.id !== branchId),
    }));
    setSelection({ kind: "scene", sceneId });
  }

  function addEncounterForScene(
    sceneId: string,
    kind: "battle" | "story",
  ) {
    // Generate a non-colliding id from the scene + kind.
    let baseId = `${sceneId}-${kind}`;
    let suffix = 0;
    while (encounters.some((e) => e.id === baseId)) {
      suffix += 1;
      baseId = `${sceneId}-${kind}-${suffix}`;
    }
    const newEnc: EncounterDefT =
      kind === "battle"
        ? {
            id: baseId,
            title: "New Battle",
            trigger: {
              afterScene: sceneId,
              chance: 0.7,
              once: true,
            },
            intro: {
              bg: "forest-clearing",
              narration: "(intro narration)",
            },
            body: { kind: "battle", monsterIds: [] },
            rewards: {},
            outro: {
              victory: "(victory line)",
            },
          }
        : {
            id: baseId,
            title: "New Story Encounter",
            trigger: {
              afterScene: sceneId,
              chance: 0.8,
              once: true,
            },
            intro: {
              bg: "forest-clearing",
              narration: "(intro narration)",
            },
            body: { kind: "story", outcome: "auto-victory" },
            rewards: {},
            outro: {
              victory: "(victory line)",
            },
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

  function deleteEncounter(encId: string) {
    if (!confirm(`Delete encounter "${encId}"?`)) return;
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
    //   - every encounter.trigger.afterScene must point to an existing scene
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
      if (!sceneIds.has(enc.trigger.afterScene)) {
        setError(
          `encounter "${enc.id}" triggers after missing scene "${enc.trigger.afterScene}"`,
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- recover from stale selection
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
          <p className="font-handwritten text-base text-accent-deep">
            {storyId} / Story graph
          </p>
          <span className="rounded-pill bg-paper-deep/40 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
            {Object.keys(story.scenes).length}
          </span>
          <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 font-mono text-[10px] text-ink-soft/70">
            → scenes.json + encounters.json
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
            onClick={runAutoLayout}
            disabled={isPending}
            className="rounded-pill bg-paper-deep/60 px-3 py-1 text-sm text-ink-soft hover:bg-paper-deep disabled:opacity-50"
            title="Re-run dagre auto-layout (clears manual positions)"
          >
            Auto-layout
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
        <div className="relative flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            fitView
            minZoom={0.2}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} color="rgba(91,65,40,0.15)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {/* Inspector — auto-shows when a scene or branch is selected,
            auto-hides when selection is cleared (click empty canvas). */}
        {selection && (
          <aside className="flex w-96 shrink-0 flex-col overflow-hidden border-l border-ink-soft/10 bg-paper">
            <div className="flex-1 overflow-y-auto p-4">
              {selection?.kind === "scene" && selectedScene && (
                <SceneInspector
                  storyScenes={story.scenes}
                  sceneId={selectedScene.id}
                  scene={selectedScene.scene}
                  encounters={encounters.filter(
                    (e) => e.trigger.afterScene === selectedScene.id,
                  )}
                  monsters={monsters}
                  items={items}
                  backgrounds={backgrounds}
                  onChange={(mut) => updateScene(selectedScene.id, mut)}
                  onAddBranch={() => addBranch(selectedScene.id)}
                  onAddEncounter={(kind) =>
                    addEncounterForScene(selectedScene.id, kind)
                  }
                  onUpdateEncounter={(encId, mut) =>
                    updateEncounter(encId, mut)
                  }
                  onDeleteEncounter={(encId) => deleteEncounter(encId)}
                />
              )}

              {selection?.kind === "branch" &&
                selectedScene &&
                selectedBranch && (
                  <BranchInspector
                    storyScenes={story.scenes}
                    sceneId={selectedScene.id}
                    branch={selectedBranch}
                    sourceScene={selectedScene.scene}
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
                  />
                )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────

function SceneInspector({
  storyScenes,
  sceneId,
  scene,
  encounters,
  monsters,
  items,
  backgrounds,
  onChange,
  onAddBranch,
  onAddEncounter,
  onUpdateEncounter,
  onDeleteEncounter,
}: {
  storyScenes: Record<string, SceneT>;
  sceneId: string;
  scene: SceneT;
  encounters: EncounterDefT[];
  monsters: MonsterStatsT[];
  items: ItemDefT[];
  backgrounds: BackgroundMetaT[];
  onChange: (mut: (s: SceneT) => SceneT) => void;
  onAddBranch: () => void;
  onAddEncounter: (kind: "battle" | "story") => void;
  onUpdateEncounter: (
    encId: string,
    mut: (e: EncounterDefT) => EncounterDefT,
  ) => void;
  onDeleteEncounter: (encId: string) => void;
}) {
  void storyScenes;
  return (
    <div className="flex flex-col gap-3">
      <header>
        <p className="font-handwritten text-base text-accent-deep">Scene</p>
        <code className="text-sm text-ink">{sceneId}</code>
      </header>

      <ScenePreviewImage path={scene.image} alt={sceneId} />

      <Field label="Image path">
        <input
          value={scene.image}
          onChange={(e) => onChange((s) => ({ ...s, image: e.target.value }))}
          className={inputCls}
        />
      </Field>

      <Field label="BGM key">
        <input
          value={scene.bgm}
          onChange={(e) => onChange((s) => ({ ...s, bgm: e.target.value }))}
          className={inputCls}
        />
      </Field>

      <Field label="Speaker">
        <select
          value={scene.speaker}
          onChange={(e) =>
            onChange((s) => ({
              ...s,
              speaker: e.target.value as SceneT["speaker"],
            }))
          }
          className={inputCls}
        >
          {[
            "narrator",
            "dorothy",
            "scarecrow",
            "tinman",
            "lion",
            "wicked-witch",
            "glinda",
            "wizard",
          ].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Narration">
        <textarea
          value={scene.narration}
          onChange={(e) =>
            onChange((s) => ({ ...s, narration: e.target.value }))
          }
          rows={5}
          className={inputCls}
        />
      </Field>

      <Field label="Free input">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!scene.allowFreeInput}
            onChange={(e) =>
              onChange((s) => ({
                ...s,
                allowFreeInput: e.target.checked || undefined,
              }))
            }
          />
          <span className="text-sm text-ink-soft">Allow LLM free input</span>
        </label>
      </Field>

      {scene.allowFreeInput && (
        <Field label="Free input hint">
          <input
            value={scene.freeInputHint ?? ""}
            onChange={(e) =>
              onChange((s) => ({
                ...s,
                freeInputHint: e.target.value || undefined,
              }))
            }
            className={inputCls}
            placeholder="What does {{name}} do?"
          />
        </Field>
      )}

      <Field label="Ending">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!scene.ending}
            onChange={(e) =>
              onChange((s) => ({
                ...s,
                ending: e.target.checked
                  ? scene.ending ?? { id: sceneId, label: "" }
                  : undefined,
              }))
            }
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

      <div className="rounded-card bg-paper-deep/30 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-ink-soft">
            Branches ({scene.branches.length})
          </p>
          <button
            type="button"
            onClick={onAddBranch}
            className="rounded-pill bg-accent-deep px-2 py-0.5 text-xs text-paper hover:opacity-90"
          >
            + Add
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {scene.branches.map((b) => (
            <li
              key={b.id}
              className="rounded-card bg-paper px-2 py-1 text-xs ring-1 ring-ink-soft/10"
            >
              <code className="text-ink">{b.id}</code>{" "}
              <span className="text-ink-soft">→ {b.next}</span>
              <p className="text-ink-soft/70">{b.label}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Side encounters attached to this scene */}
      <div className="rounded-card bg-paper-deep/30 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-ink-soft">
            Encounters ({encounters.length})
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onAddEncounter("battle")}
              className="rounded-pill bg-ruby/15 px-2 py-0.5 text-xs font-semibold text-ruby hover:bg-ruby/25"
              title="Add new battle encounter triggered after this scene"
            >
              + Battle
            </button>
            <button
              type="button"
              onClick={() => onAddEncounter("story")}
              className="rounded-pill bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-deep hover:bg-accent/25"
              title="Add new story encounter triggered after this scene"
            >
              + Story
            </button>
          </div>
        </div>
        {encounters.length === 0 ? (
          <p className="px-1 py-2 text-xs text-ink-soft/60">
            No encounters trigger after this scene.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {encounters.map((enc) => (
              <EncounterCard
                key={enc.id}
                encounter={enc}
                monsters={monsters}
                items={items}
                backgrounds={backgrounds}
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

function EncounterCard({
  encounter,
  monsters,
  items,
  backgrounds,
  onChange,
  onDelete,
}: {
  encounter: EncounterDefT;
  monsters: MonsterStatsT[];
  items: ItemDefT[];
  backgrounds: BackgroundMetaT[];
  onChange: (mut: (e: EncounterDefT) => EncounterDefT) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const bodyKindLabel =
    encounter.body.kind === "battle"
      ? `⚔ battle (${encounter.body.monsterIds.length} monster${encounter.body.monsterIds.length === 1 ? "" : "s"})`
      : `📖 story${
          encounter.body.choices ? ` (${encounter.body.choices.length} choices)` : ""
        }`;

  return (
    <li className="rounded-card bg-paper ring-1 ring-ink-soft/10">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left"
        >
          <code className="text-xs text-ink">{encounter.id}</code>
          <p className="text-[11px] text-ink-soft">{encounter.title}</p>
          <p className="text-[10px] text-ink-soft/70">
            {bodyKindLabel} · chance {encounter.trigger.chance}
            {encounter.trigger.once ? " · once" : ""}
          </p>
        </button>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-pill bg-paper-deep/60 px-2 py-0.5 text-[10px] hover:bg-paper-deep"
          >
            {expanded ? "Hide" : "Edit"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-pill bg-ruby/15 px-2 py-0.5 text-[10px] text-ruby hover:bg-ruby/25"
          >
            Delete
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
          <div className="grid grid-cols-2 gap-2">
            <MiniField label="Chance (0–1)">
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={encounter.trigger.chance}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(1, Number(e.target.value)));
                  onChange((x) => ({
                    ...x,
                    trigger: { ...x.trigger, chance: v },
                  }));
                }}
                className={inputClsSm}
              />
            </MiniField>
            <MiniField label="Once / repeats">
              <label className="flex h-7 items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!encounter.trigger.once}
                  onChange={(e) =>
                    onChange((x) => ({
                      ...x,
                      trigger: {
                        ...x.trigger,
                        once: e.target.checked || undefined,
                      },
                    }))
                  }
                />
                <span className="text-ink-soft">once per save</span>
              </label>
            </MiniField>
          </div>
          <MiniField label="Intro background">
            <select
              value={encounter.intro.bg}
              onChange={(e) =>
                onChange((x) => ({
                  ...x,
                  intro: { ...x.intro, bg: e.target.value },
                }))
              }
              className={inputClsSm}
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
            </select>
          </MiniField>
          <MiniField label="Intro narration">
            <textarea
              value={encounter.intro.narration}
              onChange={(e) =>
                onChange((x) => ({
                  ...x,
                  intro: { ...x.intro, narration: e.target.value },
                }))
              }
              rows={2}
              className={inputClsSm}
            />
          </MiniField>

          {encounter.body.kind === "battle" ? (
            <MiniField label="Monsters (multi-select)">
              <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-button bg-paper-deep/40 p-1.5">
                {monsters.map((m) => {
                  const count = encounter.body.kind === "battle"
                    ? encounter.body.monsterIds.filter((id) => id === m.id).length
                    : 0;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onChange((x) => {
                          if (x.body.kind !== "battle") return x;
                          // Click adds, shift-click… not handled. Simple add.
                          return {
                            ...x,
                            body: {
                              ...x.body,
                              monsterIds: [...x.body.monsterIds, m.id],
                            },
                          };
                        });
                      }}
                      className={`rounded-pill px-1.5 py-0.5 text-[10px] transition-colors ${
                        count > 0
                          ? "bg-accent-deep text-paper"
                          : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                      }`}
                      title={`Click to add. Currently × ${count}.`}
                    >
                      {m.id}
                      {count > 1 && (
                        <span className="ml-1">×{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {encounter.body.monsterIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onChange((x) => {
                      if (x.body.kind !== "battle") return x;
                      // Pop last — quick undo
                      return {
                        ...x,
                        body: {
                          ...x.body,
                          monsterIds: x.body.monsterIds.slice(0, -1),
                        },
                      };
                    });
                  }}
                  className="mt-1 self-end rounded-pill bg-ruby/15 px-2 py-0.5 text-[10px] text-ruby hover:bg-ruby/25"
                >
                  ← Remove last
                </button>
              )}
            </MiniField>
          ) : (
            <p className="text-[10px] text-ink-soft/70">
              Story-type body. Choice + puzzle authoring lives on the
              <code className="ml-1">Encounters</code> page.
            </p>
          )}

          <MiniField label="Reward items (multi-select)">
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded-button bg-paper-deep/40 p-1.5">
              {items.map((it) => {
                const on = encounter.rewards.victoryItems?.includes(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() =>
                      onChange((x) => {
                        const set = new Set(x.rewards.victoryItems ?? []);
                        if (set.has(it.id)) set.delete(it.id);
                        else set.add(it.id);
                        return {
                          ...x,
                          rewards: {
                            ...x.rewards,
                            victoryItems:
                              set.size > 0 ? Array.from(set) : undefined,
                          },
                        };
                      })
                    }
                    className={`rounded-pill px-1.5 py-0.5 text-[10px] transition-colors ${
                      on
                        ? "bg-accent-deep text-paper"
                        : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                    }`}
                  >
                    {it.icon ?? "🎁"} {it.id}
                  </button>
                );
              })}
            </div>
          </MiniField>

          <MiniField label="Medal id (optional)">
            <input
              value={encounter.rewards.medalId ?? ""}
              onChange={(e) =>
                onChange((x) => ({
                  ...x,
                  rewards: {
                    ...x.rewards,
                    medalId: e.target.value || undefined,
                  },
                }))
              }
              className={inputClsSm}
              placeholder="e.g. wolf-slayer"
            />
          </MiniField>

          <MiniField label="Outro on victory">
            <textarea
              value={encounter.outro.victory}
              onChange={(e) =>
                onChange((x) => ({
                  ...x,
                  outro: { ...x.outro, victory: e.target.value },
                }))
              }
              rows={2}
              className={inputClsSm}
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

const inputClsSm =
  "w-full rounded-button bg-paper-deep/40 px-2 py-1 text-xs text-ink ring-1 ring-ink-soft/10 focus:outline-none focus:ring-accent/50";

function BranchInspector({
  storyScenes,
  sceneId,
  branch,
  sourceScene,
  onChange,
  onDelete,
}: {
  storyScenes: Record<string, SceneT>;
  sceneId: string;
  branch: BranchT;
  sourceScene: SceneT;
  onChange: (mut: (b: BranchT) => BranchT) => void;
  onDelete: () => void;
}) {
  const sceneIds = Object.keys(storyScenes);
  const targetScene = storyScenes[branch.next];

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-handwritten text-base text-accent-deep">Branch</p>
          <p className="text-xs text-ink-soft">
            from <code>{sceneId}</code>
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-pill bg-ruby/15 px-2 py-0.5 text-xs text-ruby hover:bg-ruby/25"
        >
          Delete
        </button>
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

      <Field label="ID">
        <code className="block rounded-button bg-paper-deep/40 px-3 py-1.5 text-sm text-ink">
          {branch.id}
        </code>
      </Field>

      <Field label="Label">
        <input
          value={branch.label}
          onChange={(e) => onChange((b) => ({ ...b, label: e.target.value }))}
          className={inputCls}
        />
      </Field>

      <Field label="Next scene">
        <select
          value={branch.next}
          onChange={(e) => onChange((b) => ({ ...b, next: e.target.value }))}
          className={inputCls}
        >
          {sceneIds.map((sid) => (
            <option key={sid} value={sid}>
              {sid}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Adds companion">
        <select
          value={branch.addsCompanion ?? ""}
          onChange={(e) =>
            onChange((b) => ({
              ...b,
              addsCompanion: (e.target.value ||
                undefined) as BranchT["addsCompanion"],
            }))
          }
          className={inputCls}
        >
          <option value="">(none)</option>
          <option value="scarecrow">scarecrow</option>
          <option value="tinman">tinman</option>
          <option value="lion">lion</option>
        </select>
      </Field>

      <Field label="Medal trigger (id, optional)">
        <input
          value={branch.medalTrigger ?? ""}
          onChange={(e) =>
            onChange((b) => ({
              ...b,
              medalTrigger: e.target.value || null,
            }))
          }
          className={inputCls}
          placeholder="e.g. ruby_slippers"
        />
      </Field>

      <Field label="BGM override (optional)">
        <input
          value={branch.bgmOverride ?? ""}
          onChange={(e) =>
            onChange((b) => ({
              ...b,
              bgmOverride: e.target.value || undefined,
            }))
          }
          className={inputCls}
          placeholder="(none — uses target scene's bgm)"
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-button bg-paper-deep/40 px-3 py-1.5 text-sm text-ink ring-1 ring-ink-soft/10 focus:outline-none focus:ring-accent/50";

// ─────────────────────────────────────────────────────────────────

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
  const height = small ? "h-16" : "h-32";
  return (
    <AssetThumb
      base={path}
      alt={alt}
      className={`${height} w-full`}
      shape="square"
      fit="cover"
    />
  );
}
