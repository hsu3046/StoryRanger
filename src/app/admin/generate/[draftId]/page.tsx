import { notFound, redirect } from "next/navigation";

import { readDraftMeta } from "../../_lib/draftStore";

export default async function DraftRedirectPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  const meta = await readDraftMeta(draftId);
  if (!meta) notFound();
  redirect(`/admin/generate/${draftId}/${meta.currentStage}`);
}
