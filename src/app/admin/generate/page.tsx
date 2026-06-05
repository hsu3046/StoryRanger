import Link from "next/link";

import { NewDraftForm } from "../_components/generate/NewDraftForm";
import { listDrafts } from "../_lib/draftStore";

export default async function GenerateIndexPage() {
  const drafts = await listDrafts();

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <p className="font-handwritten text-base text-accent-deep">Create Story</p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="grid gap-4 lg:grid-cols-2">
          <NewDraftForm />

          <div className="flex flex-col gap-3 rounded-card-lg bg-paper p-4 ring-1 ring-ink-soft/10">
            <h3 className="text-base font-semibold text-ink">In-progress drafts</h3>
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
                      <span className="flex flex-col">
                        <code className="text-sm text-ink">{d.storyId}</code>
                        <span className="text-xs text-ink-soft/70">
                          stage: {d.currentStage}
                        </span>
                      </span>
                      <span
                        className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${
                          d.status === "committed"
                            ? "bg-emerald-500/15 text-emerald-700"
                            : "bg-amber-400/15 text-amber-700"
                        }`}
                      >
                        {d.status}
                      </span>
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
