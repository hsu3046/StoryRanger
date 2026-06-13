import Link from "next/link";

import { contentRepo } from "@/lib/content-repo";
import { listMedals } from "@/data/medals";
import { CloneStoryForm } from "./_components/CloneStoryForm";

export default function AdminDashboard() {
  const repo = contentRepo();
  const storyIds = repo.listStoryIds();

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
        <div className="flex items-center gap-2">
          <p className="font-handwritten text-base text-accent-deep">
            Dashboard
          </p>
          <span className="text-xs text-ink-soft/70">
            {storyIds.length} stor{storyIds.length === 1 ? "y" : "ies"}
          </span>
        </div>
        <Link
          href="/admin/generate"
          className="inline-flex items-center rounded-pill bg-accent-deep px-3 py-1 text-sm font-medium text-paper transition-opacity hover:opacity-90"
        >
          ✨ Generate new story →
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <section className="flex flex-col gap-3">
          {storyIds.map((sid) => {
            const story = repo.getStory(sid)?.story;
            const sceneCount = story ? Object.keys(story.scenes).length : 0;
            const monsters = repo.listMonsters(sid).length;
            const items = repo.listItems(sid).length;
            const encounters = repo.listEncounters(sid).length;
            // Medals are global now — same catalog count for every story.
            const medals = listMedals().length;
            const characters =
              repo.getStory(sid)?.characters.characters.length ?? 0;
            return (
              <div
                key={sid}
                className="flex flex-col gap-3 rounded-card-lg bg-paper p-4 ring-1 ring-ink-soft/10"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg font-semibold text-ink">
                    {story?.title ?? sid}
                  </h3>
                  <code className="rounded-pill bg-paper-deep/60 px-2 py-0.5 text-xs text-ink-soft">
                    {sid}
                  </code>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  <Stat label="Scenes" value={sceneCount} />
                  <Stat label="Characters" value={characters} />
                  <Stat label="Monsters" value={monsters} />
                  <Stat label="Encounters" value={encounters} />
                  <Stat label="Medals" value={medals} />
                  <Stat label="Items" value={items} />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <DashLink href={`/admin/stories/${sid}/graph`}>
                    Story graph →
                  </DashLink>
                  <DashLink href={`/admin/stories/${sid}/monsters`}>
                    Monsters →
                  </DashLink>
                  <DashLink href={`/admin/stories/${sid}/items`}>
                    Items →
                  </DashLink>
                  <CloneStoryForm
                    sourceId={sid}
                    sourceTitle={story?.title ?? sid}
                  />
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card bg-paper-deep/40 px-3 py-2">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function DashLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-pill bg-accent-deep px-3 py-1 text-sm font-medium text-paper transition-opacity hover:opacity-90"
    >
      {children}
    </Link>
  );
}
