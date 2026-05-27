import { notFound } from "next/navigation";

import { contentRepo } from "@/lib/content-repo";
import { CatalogTable } from "@/app/admin/_components/CatalogTable";
import { AdminPageHeader } from "@/app/admin/_components/PageHeader";
import type { EncounterDefT } from "@/data/schemas";

export default async function EncountersPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const repo = contentRepo();
  if (!repo.getStory(storyId)) notFound();
  const encounters = repo.listEncounters(storyId);

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <AdminPageHeader
        storyId={storyId}
        title="Encounters"
        count={encounters.length}
        filePath="encounters.json"
        subtitle="edit via Story Graph → scene inspector"
      />
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <CatalogTable<EncounterDefT>
          rows={encounters}
          rowKey={(e) => e.id}
          columns={[
            {
              key: "id",
              header: "ID",
              width: "w-44",
              render: (e) => <code className="text-ink">{e.id}</code>,
            },
            {
              key: "title",
              header: "Title",
              width: "w-44",
              render: (e) => <span className="text-ink">{e.title}</span>,
            },
            {
              key: "trigger",
              header: "After Scene",
              width: "w-44",
              render: (e) => (
                <div className="flex flex-col">
                  <code className="text-ink-soft">{e.trigger.afterScene}</code>
                  <span className="text-xs text-ink-soft/60">
                    chance {e.trigger.chance}
                    {e.trigger.once ? " · once" : ""}
                  </span>
                </div>
              ),
            },
            {
              key: "kind",
              header: "Kind",
              width: "w-24",
              render: (e) =>
                e.body.kind === "battle" ? (
                  <span className="rounded-pill bg-ruby/15 px-2 py-0.5 text-xs text-ruby">
                    battle
                  </span>
                ) : (
                  <span className="rounded-pill bg-accent/15 px-2 py-0.5 text-xs text-accent-deep">
                    story
                  </span>
                ),
            },
            {
              key: "body",
              header: "Body",
              render: (e) =>
                e.body.kind === "battle" ? (
                  <div className="flex flex-wrap gap-1">
                    {e.body.monsterIds.map((m, i) => (
                      <code
                        key={`${m}-${i}`}
                        className="rounded-pill bg-paper-deep/40 px-1.5 py-0.5 text-xs"
                      >
                        {m}
                      </code>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-ink-soft">
                    {e.body.choices
                      ? `${e.body.choices.length} choice(s)`
                      : "auto-victory"}
                  </span>
                ),
            },
            {
              key: "rewards",
              header: "Rewards",
              render: (e) => (
                <div className="flex flex-col gap-0.5 text-xs">
                  {e.rewards.victoryItems &&
                    e.rewards.victoryItems.length > 0 && (
                      <span>📦 {e.rewards.victoryItems.join(", ")}</span>
                    )}
                  {e.rewards.medalId && <span>🏅 {e.rewards.medalId}</span>}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
