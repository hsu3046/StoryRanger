import { notFound } from "next/navigation";

import { contentRepo } from "@/lib/content-repo";
import { CatalogTable } from "@/app/admin/_components/CatalogTable";
import { AdminPageHeader } from "@/app/admin/_components/PageHeader";
import type { Medal, MedalTrigger } from "@/types/story";

function describeTrigger(t: MedalTrigger): string {
  switch (t.type) {
    case "branch":
      return `branch: ${t.branchId}`;
    case "scene":
      return `scene: ${t.sceneId}`;
    case "free_input_count":
      return `free input ≥ ${t.min}`;
    case "ending":
      return `ending: ${t.endingId}`;
    case "encounter":
      return `encounter: ${t.encounterId}`;
  }
}

export default async function MedalsPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const repo = contentRepo();
  const loaded = repo.getStory(storyId);
  if (!loaded) notFound();
  const medals = loaded.medals.medals;

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <AdminPageHeader
        storyId={storyId}
        title="Medals"
        count={medals.length}
        filePath="medals.json"
      />
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <CatalogTable<Medal>
          rows={medals}
          rowKey={(m) => m.id}
          columns={[
            {
              key: "icon",
              header: "",
              width: "w-10",
              render: (m) => <span className="text-2xl">{m.icon}</span>,
            },
            {
              key: "id",
              header: "ID",
              width: "w-44",
              render: (m) => <code className="text-ink">{m.id}</code>,
            },
            {
              key: "name",
              header: "Name",
              width: "w-44",
              render: (m) => <span className="text-ink">{m.name}</span>,
            },
            {
              key: "trigger",
              header: "Trigger",
              width: "w-64",
              render: (m) => (
                <code className="text-ink-soft">
                  {describeTrigger(m.trigger)}
                </code>
              ),
            },
            {
              key: "description",
              header: "Description",
              render: (m) => (
                <span className="text-ink-soft">{m.description}</span>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
