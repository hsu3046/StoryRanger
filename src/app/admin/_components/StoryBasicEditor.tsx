"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StorySchema, type StoryT } from "@/data/schemas";
import { saveScenesAction } from "../_actions/saveJson";
import { AssetThumb } from "./AssetThumb";
import { Field, StyledSelect, inputCls } from "./form";

interface Props {
  storyId: string;
  initialStory: StoryT;
  /** Pre-scanned image candidates under /public/stories/<id>/. Each entry
   *  carries the full path (stored on `story.coverImage`) and a display
   *  filename for the dropdown — same shape as the Scene image picker. */
  coverOptions: { value: string; label: string }[];
}

/** Languages the player UI is built to handle (TTS voice mapping +
 *  copywriting). Add new entries here when expanding localization. */
const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ko", label: "한국어" },
  { value: "ja", label: "日本語" },
];

/** Strip a trailing image extension so cover paths normalize to the same
 *  shape the Scene image picker stores (extensionless stem). AssetThumb's
 *  fallback chain resolves the actual file on disk at render time. */
function withoutImageExt(path: string): string {
  return path.replace(/\.(webp|png|jpe?g)$/i, "");
}

/**
 * Story-level meta editor — title, subtitle, language, age range,
 * estimated minutes, cover image, start scene. Writes back to the same
 * scenes.json file the graph editor uses (StorySchema covers both the
 * story header AND the scenes map), so the existing saveScenesAction is
 * reused as-is.
 */
export function StoryBasicEditor({ storyId, initialStory, coverOptions }: Props) {
  const router = useRouter();
  // Normalize the cover path to the extensionless form on load so it
  // matches the dropdown options (which are file stems). Existing JSON
  // that still has `.webp` etc. is auto-migrated on the next save —
  // both forms point at the same file via AssetThumb's fallback chain.
  const normalizedInitial = useMemo<StoryT>(
    () => ({
      ...initialStory,
      coverImage: withoutImageExt(initialStory.coverImage),
    }),
    [initialStory],
  );
  const [story, setStory] = useState<StoryT>(normalizedInitial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = useMemo(
    () => JSON.stringify(normalizedInitial) !== JSON.stringify(story),
    [normalizedInitial, story],
  );

  function update(mut: (s: StoryT) => StoryT) {
    setStory((prev) => mut(prev));
  }

  function save() {
    setError(null);
    const parsed = StorySchema.safeParse(story);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "validation failed");
      return;
    }
    startTransition(async () => {
      const res = await saveScenesAction(storyId, parsed.data);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header bar — same style as Story Graph editor's top toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p
            className="font-handwritten text-base text-accent-deep"
            title={storyId}
          >
            {story.title} / Basic
          </p>
          <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 font-mono text-[10px] text-ink-soft/70">
            scenes.json
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
            onClick={() => {
              setStory(normalizedInitial);
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

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          <Field label="Title">
            <input
              value={story.title}
              onChange={(e) => update((s) => ({ ...s, title: e.target.value }))}
              className={inputCls}
            />
          </Field>

          <Field label="Subtitle (optional)">
            <input
              value={story.subtitle ?? ""}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  subtitle: e.target.value || undefined,
                }))
              }
              className={inputCls}
              placeholder="e.g. A tale of Kansas, Oz, and finding home"
            />
          </Field>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-5">
              <Field label="Cover image">
                <StyledSelect
                  value={story.coverImage}
                  onChange={(e) =>
                    update((s) => ({ ...s, coverImage: e.target.value }))
                  }
                >
                  {!coverOptions.some((o) => o.value === story.coverImage) && (
                    <option value={story.coverImage}>
                      {story.coverImage.split("/").pop() ?? story.coverImage}{" "}
                      (custom)
                    </option>
                  )}
                  {coverOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </StyledSelect>
              </Field>

              <Field label="Language">
                <StyledSelect
                  value={story.language}
                  onChange={(e) =>
                    update((s) => ({ ...s, language: e.target.value }))
                  }
                >
                  {!LANGUAGE_OPTIONS.some((o) => o.value === story.language) && (
                    <option value={story.language}>
                      {story.language} (custom)
                    </option>
                  )}
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </StyledSelect>
              </Field>
            </div>
            <AssetThumb
              base={story.coverImage}
              alt={`${story.title} cover`}
              className="w-full"
              shape="banner"
              fit="contain"
              ringWidth={0}
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <Field label="Age range">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={story.ageRange[0]}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      ageRange: [Number(e.target.value), s.ageRange[1]],
                    }))
                  }
                  className={`${inputCls} max-w-[5rem] tabular-nums`}
                />
                <span className="text-sm text-ink-soft">–</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={story.ageRange[1]}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      ageRange: [s.ageRange[0], Number(e.target.value)],
                    }))
                  }
                  className={`${inputCls} max-w-[5rem] tabular-nums`}
                />
                <span className="text-sm text-ink-soft">years</span>
              </div>
            </Field>

            <Field label="Estimated minutes">
              <input
                type="number"
                min={1}
                max={999}
                value={story.estimatedMinutes}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    estimatedMinutes: Number(e.target.value),
                  }))
                }
                className={`${inputCls} max-w-[8rem] tabular-nums`}
              />
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}
