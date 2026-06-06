"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaretDown,
  CaretUp,
  CircleNotch,
  DotsSixVertical,
  ImageSquare,
  Lock,
  LockOpen,
  Pause,
  Play,
} from "@phosphor-icons/react";

import type { ConceptT, DraftMetaT, DraftSceneMetaT, StoryboardT } from "@/data/schemas";
import type { CharactersFile, Scene, Story } from "@/types/story";
import {
  saveDraftMetaAction,
  saveDraftSceneMetaAction,
  saveDraftScenesAction,
} from "../../_actions/generateDraft";
import { BgmSelectWithPreview } from "../BgmSelectWithPreview";
import { inputCls, inputClsSm } from "../form";
import { ImagePreview } from "./ImagePreview";
import { RegenerateButton } from "./RegenerateButton";
import { Card, ErrorNote, postJson, PrimaryButton } from "./shared";
import { useAutosave, useStageVisit } from "./useAutosave";
import { useGenerationPool } from "./useGenerationPool";

const PAGE_MIN = 12;
const PAGE_MAX = 40;

/** Rebuild the linear chain after a reorder: each page's single "continue"
 *  branch points to the next page, the last page becomes the ending, and
 *  startScene follows the new order. Narration / image / bgm stay with their id. */
function relink(story: Story, ids: string[]): Story {
  const label = Object.values(story.scenes).flatMap((s) => s.branches)[0]?.label ?? "Continue";
  const scenes: Record<string, Scene> = {};
  ids.forEach((id, i) => {
    const s = story.scenes[id];
    const isLast = i === ids.length - 1;
    if (isLast) {
      scenes[id] = { ...s, branches: [], ending: s.ending ?? { id, label: "The End" } };
    } else {
      const rest: Scene = { ...s, branches: [{ id: "continue", label, next: ids[i + 1] }] };
      delete rest.ending;
      scenes[id] = rest;
    }
  });
  return { ...story, startScene: ids[0] ?? story.startScene, scenes };
}

/** Compact custom dropdown (iOS-safe backdrop pattern) to pick a scene's
 *  speaker from the cast. */
/** Speaker (page narrator/character) picker with a per-row voice preview —
 *  plays each character's ElevenLabs sample via /api/voice-preview (free, no TTS
 *  credits), mirroring VoiceSelectWithPreview but keyed on the speaker. */
function SpeakerSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; name: string; voiceId: string }[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"down" | "up">("down");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Resolved preview URLs cached per voice id (a voice may be shared by cast).
  const urlCache = useRef<Map<string, string>>(new Map());
  // The character row the user last intended to hear — a newer click (or close)
  // supersedes any in-flight fetch so a slow response can't play late.
  const reqRef = useRef<string | null>(null);
  const current = options.find((o) => o.id === value);

  // Open above the trigger when there isn't room below (cards run tall).
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const NEEDED = 280; // max-h-64 (256px) + breathing room.
    setDirection(spaceBelow < NEEDED && spaceAbove > spaceBelow ? "up" : "down");
  }, [open]);

  const stop = () => {
    reqRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
    setLoadingId(null);
  };
  // Stop preview when popover closes or component unmounts.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- stop audio when the popover closes
    if (!open) stop();
  }, [open]);
  useEffect(() => () => stop(), []);

  function playUrl(rowId: string, url: string) {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audio.volume = 0.7;
    audio.onended = () => setPlayingId(null);
    audioRef.current = audio;
    // Flip to "playing" only once playback actually starts; a newer preview may
    // have superseded this one before the promise resolves.
    audio
      .play()
      .then(() => {
        if (reqRef.current === rowId) setPlayingId(rowId);
      })
      .catch(() => {
        if (audioRef.current === audio) {
          audioRef.current = null;
          setPlayingId(null);
        }
      });
  }
  async function preview(rowId: string, voiceId: string) {
    if (!voiceId) return;
    if (playingId === rowId) {
      stop();
      return;
    }
    reqRef.current = rowId; // new intent supersedes any in-flight fetch
    audioRef.current?.pause();
    setPlayingId(null);
    const cached = urlCache.current.get(voiceId);
    if (cached) {
      if (reqRef.current === rowId) playUrl(rowId, cached);
      return;
    }
    setLoadingId(rowId);
    try {
      const res = await fetch(`/api/voice-preview?voiceId=${encodeURIComponent(voiceId)}`);
      const data = (await res.json().catch(() => ({}))) as { previewUrl?: string };
      if (!res.ok || !data.previewUrl) throw new Error("preview failed");
      urlCache.current.set(voiceId, data.previewUrl);
      if (reqRef.current === rowId) playUrl(rowId, data.previewUrl);
    } catch {
      /* silent — the row still selects fine */
    } finally {
      setLoadingId((cur) => (cur === rowId ? null : cur));
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex w-full items-center justify-between pr-9 text-left`}
      >
        <span className="truncate">{current?.name ?? value}</span>
      </button>
      <CaretDown
        size={14}
        weight="bold"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft"
      />
      {open && (
        <>
          {/* Transparent click-trap — the only reliable outside-tap-to-close
              pattern on iOS Safari (document mousedown is ignored there). */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <ul
            className={`absolute left-0 right-0 z-50 max-h-64 overflow-y-auto rounded-card bg-paper py-1 shadow-overlay ring-1 ring-ink-soft/15 ${
              direction === "up" ? "bottom-full mb-1" : "top-full mt-1"
            }`}
          >
            {options.map((o) => {
              const isPlaying = playingId === o.id;
              const isLoading = loadingId === o.id;
              return (
                <li key={o.id} className="flex items-center gap-1 pr-2">
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    className={`flex min-w-0 flex-1 items-center px-3 py-1.5 text-left text-sm hover:bg-paper-deep/40 ${
                      value === o.id ? "bg-paper-deep/30 font-semibold" : ""
                    }`}
                    title={`${o.name} — ${o.id}`}
                  >
                    <span className="min-w-0 truncate">{o.name}</span>
                  </button>
                  {o.voiceId ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void preview(o.id, o.voiceId);
                      }}
                      disabled={isLoading}
                      title={isPlaying ? "Stop preview" : "Preview voice"}
                      aria-label={isPlaying ? "Stop preview" : "Preview voice"}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-pill transition-colors ${
                        isPlaying
                          ? "bg-emerald text-paper"
                          : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
                      }`}
                    >
                      {isLoading ? (
                        <CircleNotch size={10} weight="bold" className="animate-spin" />
                      ) : isPlaying ? (
                        <Pause size={10} weight="fill" />
                      ) : (
                        <Play size={10} weight="fill" />
                      )}
                    </button>
                  ) : (
                    /* spacer keeps the label column aligned with rows that have
                       a preview button (h-6 w-6). */
                    <span className="h-6 w-6 shrink-0" aria-hidden />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

interface Props {
  draftId: string;
  concept: ConceptT;
  storyboard: StoryboardT;
  characters: CharactersFile;
  meta: DraftMetaT;
  /** Generated pages (re-visit), or null before the first "Generate pages". */
  initialScenes: Story | null;
  initialSceneMeta: DraftSceneMetaT | null;
  bgmOptions: string[];
  presence: { sceneStems: string[]; cover: boolean };
}

export function ScenesStep({
  draftId,
  concept,
  storyboard,
  characters,
  meta,
  initialScenes,
  initialSceneMeta,
  bgmOptions,
  presence,
}: Props) {
  const beatCount = storyboard.beats.length;
  const defaultPages = Math.max(PAGE_MIN, Math.min(PAGE_MAX, beatCount * 3));

  const [story, setStory] = useState<Story | null>(initialScenes);
  const storyRef = useRef<Story | null>(initialScenes);
  const [sceneMeta, setSceneMeta] = useState<DraftSceneMetaT>(
    initialSceneMeta ?? { scenes: {} },
  );
  const [pageCount, setPageCount] = useState(
    initialScenes ? Object.keys(initialScenes.scenes).length : defaultPages,
  );
  const [busy, setBusy] = useState<"gen" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverDone, setCoverDone] = useState(presence.cover);
  const [coverVer, setCoverVer] = useState(0);
  const [coverDesc, setCoverDesc] = useState(meta.coverDescription ?? "");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  // Scenes the author locked — kept verbatim when Generate re-writes the rest.
  const [locks, setLocks] = useState<Record<string, boolean>>({});
  const toggleLock = (id: string) => setLocks((l) => ({ ...l, [id]: !l[id] }));

  // Two independent pools — narration prose vs page illustrations.
  const nar = useGenerationPool();
  const img = useGenerationPool();
  const imgDoneRef = useRef<Set<string>>(new Set());

  const sceneIds = useMemo(
    () => (story ? Object.keys(story.scenes) : []),
    [story],
  );
  // Scene images already on disk at mount (read in render — a plain Set, not a
  // ref). Newly-generated ones surface via the pool's "done" status instead.
  const initialImgDone = useMemo(
    () => new Set(presence.sceneStems),
    [presence],
  );
  const nameOf = (id: string) =>
    characters.characters.find((c) => c.id === id)?.name ?? id;
  const speakerOptions = useMemo(
    () => characters.characters.map((c) => ({ id: c.id, name: c.name, voiceId: c.voice })),
    [characters],
  );

  useEffect(() => {
    storyRef.current = story;
  }, [story]);

  // Resume: narration that's already written + images already on disk → done.
  useEffect(() => {
    if (!story) return;
    const narrated = Object.keys(story.scenes).filter(
      (id) => (story.scenes[id].narration ?? "").trim().length > 0,
    );
    if (narrated.length) nar.markDone(narrated);
    const imgDone = presence.sceneStems.filter((s) => story.scenes[s]);
    if (imgDone.length) {
      imgDoneRef.current = new Set(imgDone);
      img.markDone(imgDone);
    }
    // Run once on mount for the loaded story.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave narration / bgm edits + per-scene image prompts (sceneMeta).
  useAutosave(story, (s) => (s ? saveDraftScenesAction(draftId, s) : undefined), {
    enabled: !!story,
  });
  useAutosave(sceneMeta, (m) => saveDraftSceneMetaAction(draftId, m), {
    enabled: !!story,
  });
  // Persist the cover description to draft meta so it survives navigation.
  // (useAutosave skips the seed value, so clearing back to "" still saves.)
  useAutosave(coverDesc, (t) =>
    saveDraftMetaAction(draftId, { coverDescription: t }),
  );
  useStageVisit(draftId, meta, "scene");

  function applyScene(id: string, patch: Partial<Story["scenes"][string]>) {
    setStory((prev) =>
      prev
        ? { ...prev, scenes: { ...prev.scenes, [id]: { ...prev.scenes[id], ...patch } } }
        : prev,
    );
  }
  function moveScene(from: number, to: number) {
    setStory((prev) => {
      if (!prev || from === to) return prev;
      const ids = Object.keys(prev.scenes);
      const [m] = ids.splice(from, 1);
      ids.splice(to, 0, m);
      return relink(prev, ids);
    });
  }
  function setImagePrompt(id: string, setting: string) {
    setSceneMeta((prev) => {
      const cur = prev.scenes[id] ?? { setting: "", synopsis: "", parentBeatId: "" };
      return { scenes: { ...prev.scenes, [id]: { ...cur, setting } } };
    });
  }
  function bump(id: string) {
    setVersions((v) => ({ ...v, [id]: (v[id] ?? 0) + 1 }));
  }

  async function generatePages(authorRequest?: string) {
    // Partial mode: if any scene is locked, keep the whole page structure and
    // only re-write the OPEN scenes' narration (no re-pagination). Otherwise a
    // full re-paginate from the storyboard.
    if (story && sceneIds.some((id) => locks[id])) {
      setErr(null);
      setBusy("gen");
      try {
        const openIds = sceneIds.filter((id) => !locks[id]);
        if (openIds.length > 0)
          await nar.run(openIds, (id) => narWorker(id, authorRequest), 3);
        await persistScenes();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
      return;
    }
    setErr(null);
    setBusy("gen");
    try {
      const res = await postJson<{ story: Story; sceneMeta: DraftSceneMetaT }>(
        "/api/admin/generate/scenes",
        {
          storyId: draftId,
          concept,
          storyboard,
          characters,
          sceneCount: pageCount,
          authorRequest,
        },
      );
      const saveScenes = await saveDraftScenesAction(draftId, res.story);
      if (!saveScenes.ok) throw new Error(saveScenes.error);
      const saveMeta = await saveDraftSceneMetaAction(draftId, res.sceneMeta);
      if (!saveMeta.ok) throw new Error(saveMeta.error);
      setStory(res.story);
      setSceneMeta(res.sceneMeta);
      // Pagination already wrote the narration → mark it done.
      nar.markDone(Object.keys(res.story.scenes));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function narWorker(id: string, revise?: string) {
    const cur = storyRef.current;
    if (!cur) return;
    const scene = cur.scenes[id];
    const incoming: { label: string; narration: string }[] = [];
    for (const s of Object.values(cur.scenes)) {
      for (const b of s.branches) {
        if (b.next === id) incoming.push({ label: b.label, narration: s.narration ?? "" });
      }
    }
    const before = scene.narration ?? "";
    const ctx = sceneMeta.scenes[id];
    const authorRequest =
      [
        revise?.trim() ? `REVISION: ${revise.trim()}` : "",
        ctx
          ? `Write THIS page: ${ctx.synopsis}${ctx.setting ? ` (setting: ${ctx.setting})` : ""}`
          : "",
      ]
        .filter(Boolean)
        .join(" — ") || undefined;
    const res = await postJson<{ narration: string }>("/api/scene-narration", {
      storyId: draftId,
      language: concept.language,
      storyTitle: concept.title,
      storyPremise: concept.premise,
      speaker: scene.speaker,
      speakerName: scene.speaker === "narrator" ? undefined : nameOf(scene.speaker),
      choices: scene.branches.map((b) => b.label).slice(0, 6),
      incoming: incoming.slice(0, 3),
      authorRequest,
    });
    if ((storyRef.current?.scenes[id].narration ?? "") !== before) return;
    applyScene(id, { narration: res.narration });
  }

  async function imgWorker(id: string) {
    await postJson("/api/admin/generate/scene-image", { storyId: draftId, sceneId: id });
    imgDoneRef.current.add(id);
    bump(id);
  }

  // Persist the current scenes (narration/speaker/bgm) + image prompts before
  // image generation — scene-image reads them from disk, so unsaved edits would
  // otherwise build the prompt / character refs from stale data.
  async function persistScenes(): Promise<boolean> {
    const cur = storyRef.current;
    if (cur) {
      const a = await saveDraftScenesAction(draftId, cur);
      if (!a.ok) {
        setErr(a.error);
        return false;
      }
    }
    const b = await saveDraftSceneMetaAction(draftId, sceneMeta);
    if (!b.ok) {
      setErr(b.error);
      return false;
    }
    return true;
  }
  function regenerateImage(id: string) {
    setErr(null);
    void (async () => {
      if (!(await persistScenes())) return;
      await img.run([id], imgWorker, 1);
    })();
  }

  async function generateCover() {
    setErr(null);
    setCoverBusy(true);
    try {
      await postJson("/api/admin/generate/cover-image", {
        storyId: draftId,
        description: coverDesc,
      });
      setCoverDone(true);
      setCoverVer((v) => v + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCoverBusy(false);
    }
  }

  const coverSection = (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Cover</span>
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Illustration — same size as a scene thumbnail (~40%) */}
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-[40%]">
          <ImagePreview
            base={`/stories/${draftId}/cover`}
            version={coverVer}
            alt="Cover"
            present={coverDone}
            className="aspect-video w-full"
          />
          <button
            type="button"
            onClick={() => void generateCover()}
            disabled={coverBusy}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-pill bg-accent px-3 py-1.5 text-sm font-medium text-paper ring-1 ring-accent-deep/20 transition hover:bg-accent-deep active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
          >
            <ImageSquare weight="fill" className="h-4 w-4" aria-hidden />
            {coverBusy ? "Generating…" : "Generate"}
          </button>
        </div>
        {/* Cover description */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Cover Description
          </span>
          <textarea
            className={`${inputClsSm} min-h-24`}
            value={coverDesc}
            onChange={(e) => setCoverDesc(e.target.value)}
            placeholder="Describe what the cover should show"
          />
        </div>
      </div>
    </div>
  );

  const pageStepper = (
    <div className="flex items-center gap-1.5 text-xs text-ink-soft">
      <button
        type="button"
        aria-label="Fewer pages"
        disabled={pageCount <= Math.max(PAGE_MIN, beatCount)}
        onClick={() => setPageCount((n) => Math.max(Math.max(PAGE_MIN, beatCount), n - 1))}
        className="rounded-pill bg-paper-deep/60 px-2 py-0.5 font-semibold text-ink ring-1 ring-ink-soft/10 hover:bg-paper-deep disabled:opacity-40"
      >
        −
      </button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums text-ink">
        {pageCount}
      </span>
      <button
        type="button"
        aria-label="More pages"
        disabled={pageCount >= PAGE_MAX}
        onClick={() => setPageCount((n) => Math.min(PAGE_MAX, n + 1))}
        className="rounded-pill bg-paper-deep/60 px-2 py-0.5 font-semibold text-ink ring-1 ring-ink-soft/10 hover:bg-paper-deep disabled:opacity-40"
      >
        +
      </button>
    </div>
  );

  // ── Empty state — before the first pagination ──
  if (!story) {
    return (
      <Card
        title={
          <>
            <span>Scene</span>
            {pageStepper}
          </>
        }
        actions={
          <PrimaryButton onClick={() => generatePages()} disabled={busy === "gen"}>
            {busy === "gen" ? "Generating…" : "✨ Generate pages"}
          </PrimaryButton>
        }
      >
        {coverSection}
        {err && <ErrorNote>{err}</ErrorNote>}
      </Card>
    );
  }

  const busyAny = busy !== null || nar.running || img.running;

  return (
    <Card
      title={
        <>
          <span>Scene</span>
          {pageStepper}
        </>
      }
      actions={
        <RegenerateButton
          busy={busy === "gen"}
          disabled={busyAny}
          allowEmpty
          title="Revise the pages"
          hint={
            <>
              Re-writes the open (
              <LockOpen weight="regular" className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
              ) scenes; keeps your locked (
              <Lock weight="fill" className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
              ) ones. Lock a scene to keep it; open it to let the AI re-write it.
            </>
          }
          onRegenerate={generatePages}
        />
      }
    >
      {coverSection}

      <div className="flex flex-col gap-3">
        {sceneIds.map((id, i) => {
          const scene = story.scenes[id];
          const narSt = nar.entries[id]?.status;
          const imgSt = img.entries[id]?.status;
          const imgPresent = imgSt === "done" || initialImgDone.has(id);
          const imgBase = `/stories/${draftId}/scenes/${id}`;
          return (
            <div
              key={id}
              onDragOver={(e) => {
                if (dragIdx !== null) {
                  e.preventDefault();
                  setDragOverIdx(i);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null) moveScene(dragIdx, i);
                setDragIdx(null);
                setDragOverIdx(null);
              }}
              className={`rounded-card bg-paper-deep/30 p-3 ring-1 ${
                dragOverIdx === i && dragIdx !== i
                  ? "ring-2 ring-accent"
                  : locks[id]
                    ? "ring-2 ring-accent/40"
                    : "ring-ink-soft/10"
              } ${dragIdx === i ? "opacity-50" : ""}`}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  draggable
                  onDragStart={(e) => {
                    setDragIdx(i);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setDragOverIdx(null);
                  }}
                  className="cursor-grab text-ink-soft/60 hover:text-ink-soft active:cursor-grabbing"
                  aria-label="Drag to reorder"
                  title="Drag to reorder"
                >
                  <DotsSixVertical weight="bold" className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold tabular-nums text-ink-soft">{i + 1}</span>
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => moveScene(i, i - 1)}
                  className="text-ink-soft/60 hover:text-ink disabled:opacity-30"
                >
                  <CaretUp weight="bold" className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={i === sceneIds.length - 1}
                  onClick={() => moveScene(i, i + 1)}
                  className="text-ink-soft/60 hover:text-ink disabled:opacity-30"
                >
                  <CaretDown weight="bold" className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleLock(id)}
                  aria-pressed={!!locks[id]}
                  title={
                    locks[id]
                      ? "Locked — kept when you Generate"
                      : "Open — Generate may re-write this scene"
                  }
                  className={`ml-auto inline-flex h-6 w-6 items-center justify-center rounded-pill transition-colors ${
                    locks[id]
                      ? "bg-paper-deep/60 text-accent-deep"
                      : "text-ink-soft/40 hover:text-ink-soft"
                  }`}
                >
                  {locks[id] ? (
                    <Lock weight="fill" className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <LockOpen className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                {/* Illustration — ~40% */}
                <div className="flex w-full shrink-0 flex-col gap-2 sm:w-[40%]">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Image
                  </span>
                  <ImagePreview
                    base={imgBase}
                    version={versions[id] ?? 0}
                    alt={`Page ${i + 1}`}
                    present={imgPresent}
                    className="aspect-video w-full"
                  />
                  <button
                    type="button"
                    onClick={() => regenerateImage(id)}
                    disabled={busyAny}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-pill bg-accent px-3 py-1.5 text-sm font-medium text-paper ring-1 ring-accent-deep/20 transition hover:bg-accent-deep active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                  >
                    <ImageSquare weight="fill" className="h-4 w-4" aria-hidden />
                    {imgSt === "running" ? "Generating…" : "Generate"}
                  </button>
                </div>
                {/* Narration + BGM */}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      Narration
                    </span>
                    <span
                      className={`ml-auto text-[10px] tabular-nums ${
                        (scene.narration ?? "").length > 250
                          ? "font-semibold text-ruby"
                          : "text-ink-soft/50"
                      }`}
                    >
                      {(scene.narration ?? "").length} / 250
                    </span>
                  </div>
                  <textarea
                    className={`${inputClsSm} min-h-24`}
                    value={scene.narration ?? ""}
                    onChange={(e) => applyScene(id, { narration: e.target.value })}
                    readOnly={narSt === "running"}
                    placeholder="(narration)"
                  />
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      Image Description
                    </span>
                    <textarea
                      className={`${inputClsSm} min-h-24`}
                      value={sceneMeta.scenes[id]?.setting ?? ""}
                      onChange={(e) => setImagePrompt(id, e.target.value)}
                      placeholder="Describe the illustration for this page"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      Voice
                    </span>
                    <div className="min-w-0 flex-1">
                      <SpeakerSelect
                        value={scene.speaker}
                        options={speakerOptions}
                        onChange={(s) => applyScene(id, { speaker: s })}
                      />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      BGM
                    </span>
                    <div className="min-w-0 flex-1">
                      <BgmSelectWithPreview
                        value={scene.bgm ?? ""}
                        options={bgmOptions}
                        storyId={draftId}
                        allowEmpty="(none)"
                        placeholder="(no tracks — add later)"
                        onChange={(v) => applyScene(id, { bgm: v })}
                      />
                    </div>
                  </div>
                  {nar.entries[id]?.error && (
                    <p className="text-xs text-ruby">{nar.entries[id].error}</p>
                  )}
                  {img.entries[id]?.error && (
                    <p className="text-xs text-ruby">img: {img.entries[id].error}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {err && <ErrorNote>{err}</ErrorNote>}
    </Card>
  );
}
