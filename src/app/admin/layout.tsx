import { notFound, redirect } from "next/navigation";

import { contentRepo } from "@/lib/content-repo";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getProfile } from "@/lib/supabase/queries";
import { AdminSidebar } from "./_components/AdminSidebar";
import { ConfirmDialogProvider } from "./_components/ConfirmDialog";

/**
 * Admin shell. Still DEV-ONLY in Phase 1 — production 404s every /admin route
 * (story authoring writes to the filesystem, which is read-only on Vercel;
 * Phase 2 moves content to Supabase and lifts this). In dev, gated by role:
 * only `admin`/`creator` may enter. When Supabase isn't configured yet, dev
 * access stays open so local authoring works before the project is wired up.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  if (isSupabaseConfigured()) {
    const profile = await getProfile().catch(() => null);
    if (!profile) redirect("/login?redirect=/admin");
    if (profile.role !== "admin" && profile.role !== "creator") notFound();
  }

  const repo = contentRepo();
  const stories = repo.listStoryIds().map((id) => {
    const loaded = repo.getStory(id);
    return { id, title: loaded?.story.title ?? id };
  });

  return (
    <ConfirmDialogProvider>
      <div className="flex h-dvh w-full overflow-hidden bg-paper text-ink">
        <AdminSidebar stories={stories} />
        <main className="flex-1 overflow-y-auto bg-paper-deep/40">
          {children}
        </main>
      </div>
    </ConfirmDialogProvider>
  );
}
