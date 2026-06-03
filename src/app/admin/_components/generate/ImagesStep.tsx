"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { DraftMetaT } from "@/data/schemas";
import type { CharactersFile, Story } from "@/types/story";
import { saveDraftMetaAction } from "../../_actions/generateDraft";
import {
  advanceMeta,
  Card,
  ErrorNote,
  GhostButton,
  postJson,
  PrimaryButton,
  StatusDot,
} from "./shared";
import { useGenerationPool, type PoolStatus } from "./useGenerationPool";

interface Presence {
  cover: boolean;
  characterStems: string[];
  dialogueStems: string[];
  sceneStems: string[];
}

interface Props {
  draftId: string;
  characters: CharactersFile;
  meta: DraftMetaT;
  scenes: Story;
  presence: Presence;
}

interface ImgItem {
  key: string;
  label: string;
  folder: string;
  name: string;
}

/** Top-level so it isn't re-created on every parent render. */
function ImageThumb({
  draftId,
  item,
  status,
  present,
  version,
  error,
  running,
  onRegenerate,
}: {
  draftId: string;
  item: ImgItem;
  status: PoolStatus | undefined;
  present: boolean;
  version: number;
  error?: string;
  running: boolean;
  onRegenerate: (key: string) => void;
}) {
  const base = `/stories/${draftId}/${item.folder ? `${item.folder}/` : ""}${item.name}`;
  return (
    <div className="flex flex-col gap-1 rounded-card bg-paper-deep/30 p-2 ring-1 ring-ink-soft/10">
      <div className="relative aspect-square overflow-hidden rounded-button bg-paper">
        {present ? (
          // eslint-disable-next-line @next/next/no-img-element -- dev preview with ext fallback
          <img
            src={`${base}.webp?v=${version}`}
            alt={item.label}
            className="h-full w-full object-contain"
            onError={(e) => {
              const el = e.currentTarget;
              if (!el.src.includes(".png")) el.src = `${base}.png?v=${version}`;
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-soft/50">
            —
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <StatusDot status={status} />
        <span className="truncate text-xs text-ink" title={item.label}>
          {item.label}
        </span>
        <button
          type="button"
          className="ml-auto text-xs text-accent-deep disabled:opacity-40"
          onClick={() => onRegenerate(item.key)}
          disabled={running}
        >
          ↻
        </button>
      </div>
      {error && <p className="text-[10px] leading-tight text-ruby">{error}</p>}
    </div>
  );
}

export function ImagesStep({ draftId, characters, meta, scenes, presence }: Props) {
  const router = useRouter();
  const { entries, running, run, markDone } = useGenerationPool();
  const [err, setErr] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [, start] = useTransition();

  const sceneIds = useMemo(() => Object.keys(scenes.scenes), [scenes]);

  const cast = useMemo(
    () =>
      characters.characters
        .filter((c) => c.id !== "narrator")
        .map((c) => ({ slug: c.isHero ? "hero" : c.id, name: c.name })),
    [characters],
  );

  const { spriteItems, portraitItems, coverItem, sceneItems, allItems } = useMemo(() => {
    const sprites: ImgItem[] = cast.map((c) => ({
      key: `char:${c.slug}:sprite`,
      label: `${c.name} (sprite)`,
      folder: "characters",
      name: c.slug,
    }));
    const portraits: ImgItem[] = cast.map((c) => ({
      key: `char:${c.slug}:portrait`,
      label: `${c.name} (portrait)`,
      folder: "dialogue",
      name: c.slug,
    }));
    const cover: ImgItem = { key: "cover", label: "Cover", folder: "", name: "cover" };
    const sceneImgs: ImgItem[] = sceneIds.map((id) => ({
      key: `scene:${id}`,
      label: id,
      folder: "scenes",
      name: id,
    }));
    return {
      spriteItems: sprites,
      portraitItems: portraits,
      coverItem: cover,
      sceneItems: sceneImgs,
      allItems: [...sprites, ...portraits, cover, ...sceneImgs],
    };
  }, [cast, sceneIds]);

  const initialDone = useMemo(() => {
    const s = new Set<string>();
    if (presence.cover) s.add("cover");
    for (const x of presence.characterStems) s.add(`char:${x}:sprite`);
    for (const x of presence.dialogueStems) s.add(`char:${x}:portrait`);
    for (const x of presence.sceneStems) s.add(`scene:${x}`);
    return s;
  }, [presence]);

  // doneRef is read only in event handlers (never during render).
  const doneRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    doneRef.current = new Set(initialDone);
    if (initialDone.size) markDone([...initialDone]);
  }, [initialDone, markDone]);

  function bump(key: string) {
    setVersions((v) => ({ ...v, [key]: (v[key] ?? 0) + 1 }));
  }

  async function worker(key: string) {
    if (key.startsWith("char:")) {
      const [, slug, kind] = key.split(":");
      await postJson("/api/admin/generate/character-image", {
        storyId: draftId,
        characterId: slug,
        kind: kind === "portrait" ? "portrait" : "sprite",
      });
    } else if (key === "cover") {
      await postJson("/api/admin/generate/cover-image", { storyId: draftId });
    } else if (key.startsWith("scene:")) {
      await postJson("/api/admin/generate/scene-image", {
        storyId: draftId,
        sceneId: key.slice("scene:".length),
      });
    }
    doneRef.current.add(key);
    bump(key);
  }

  async function runPhase(items: ImgItem[], concurrency: number) {
    const todo = items.map((i) => i.key).filter((k) => !doneRef.current.has(k));
    if (todo.length) await run(todo, worker, concurrency);
  }

  async function generateAll() {
    setErr(null);
    const hero = spriteItems.filter((i) => i.name === "hero");
    await runPhase(hero, 1); // anchor first
    await runPhase([...spriteItems.filter((i) => i.name !== "hero"), ...portraitItems], 3);
    await runPhase([coverItem], 1);
    await runPhase(sceneItems, 3);
  }

  function regenerate(key: string) {
    setErr(null);
    void run([key], worker, 1);
  }

  function saveContinue() {
    setSaving(true);
    start(async () => {
      await saveDraftMetaAction(draftId, advanceMeta(meta, "images", "review"));
      router.push(`/admin/generate/${draftId}/review`);
    });
  }

  const doneCount = allItems.filter((i) => entries[i.key]?.status === "done").length;

  const renderGrid = (items: ImgItem[]) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {items.map((i) => {
        const status = entries[i.key]?.status;
        return (
          <ImageThumb
            key={i.key}
            draftId={draftId}
            item={i}
            status={status}
            present={status === "done" || initialDone.has(i.key)}
            version={versions[i.key] ?? 0}
            error={entries[i.key]?.error}
            running={running}
            onRegenerate={regenerate}
          />
        );
      })}
    </div>
  );

  return (
    <Card
      title={`Images · ${doneCount}/${allItems.length}`}
      actions={
        <PrimaryButton onClick={generateAll} disabled={running}>
          {running ? "Generating…" : "✨ Generate all"}
        </PrimaryButton>
      }
    >
      <p className="text-sm text-ink-soft">
        Characters generate first (the hero anchors the rest), then the cover,
        then scene pages. Re-roll any tile with ↻. Missing images fall back to a
        placeholder, so partial is OK.
      </p>

      <h4 className="text-sm font-semibold text-accent-deep">Characters</h4>
      {renderGrid([...spriteItems, ...portraitItems])}
      <h4 className="text-sm font-semibold text-accent-deep">Cover</h4>
      {renderGrid([coverItem])}
      <h4 className="text-sm font-semibold text-accent-deep">Scenes</h4>
      {renderGrid(sceneItems)}

      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex items-center justify-between">
        <GhostButton onClick={() => router.push(`/admin/generate/${draftId}/narration`)}>
          ← Back
        </GhostButton>
        <PrimaryButton onClick={saveContinue} disabled={running || saving}>
          {saving ? "Saving…" : "Continue to review →"}
        </PrimaryButton>
      </div>
    </Card>
  );
}
