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
        subtitle="battle pool — edit via Story Graph → scene inspector"
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
              header: "On Branch",
              width: "w-56",
              render: (e) => (
                <div className="flex flex-col">
                  <code className="text-ink-soft">
                    {e.trigger.sceneId} → {e.trigger.branchId}
                  </code>
                  <span className="text-xs text-ink-soft/60">
                    × {e.trigger.count ?? 1}
                  </span>
                </div>
              ),
            },
            {
              key: "monsters",
              header: "Monsters",
              render: (e) => (
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
              ),
            },
            {
              key: "rewards",
              header: "Bonus",
              render: (e) => (
                <div className="flex flex-col gap-0.5 text-xs">
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
