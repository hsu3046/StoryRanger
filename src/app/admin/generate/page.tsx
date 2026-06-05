import Link from "next/link";
import { ArrowCircleRight } from "@phosphor-icons/react/dist/ssr";

import { NewDraftForm } from "../_components/generate/NewDraftForm";
import { listDrafts, readConcept } from "../_lib/draftStore";

export default async function GenerateIndexPage() {
  const metas = await listDrafts();
  // Drafts list shows the concept's title + subtitle (not the slug/stage), so
  // pull each draft's concept. Falls back to the storyId before a concept is
  // generated.
  const drafts = await Promise.all(
    metas.map(async (d) => {
      const concept = await readConcept(d.storyId);
      return {
        storyId: d.storyId,
        currentStage: d.currentStage,
        title: concept?.title?.trim() || d.storyId,
        subtitle: concept?.subtitle?.trim() ?? "",
      };
    }),
  );

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <p className="font-handwritten text-base text-accent-deep">Create Story</p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="grid gap-4 lg:grid-cols-2">
          <NewDraftForm />

          <div className="flex flex-col gap-3 rounded-card-lg bg-paper p-4 ring-1 ring-ink-soft/10">
            <h3 className="text-base font-semibold text-ink">Drafts</h3>
            {drafts.length === 0 ? (
              <p className="rounded-card bg-paper-deep/40 px-3 py-4 text-center text-sm text-ink-soft/70">
                No drafts yet. Create one to start.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {drafts.map((d) => (
                  <li key={d.storyId}>
                    <Link
                      href={`/admin/generate/${d.storyId}/${d.currentStage}`}
                      className="flex items-center justify-between gap-2 rounded-card bg-paper-deep/30 px-3 py-2 ring-1 ring-ink-soft/10 transition-colors hover:bg-paper-deep/50"
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm font-semibold text-ink">
                          {d.title}
                        </span>
                        {d.subtitle && (
                          <span className="truncate text-xs text-ink-soft/70">
                            {d.subtitle}
                          </span>
                        )}
                      </span>
                      <ArrowCircleRight
                        weight="fill"
                        className="h-5 w-5 shrink-0 text-accent-deep"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
