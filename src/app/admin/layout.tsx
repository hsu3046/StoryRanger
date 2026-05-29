import { notFound } from "next/navigation";

import { contentRepo } from "@/lib/content-repo";
import { AdminSidebar } from "./_components/AdminSidebar";
import { ConfirmDialogProvider } from "./_components/ConfirmDialog";

/**
 * Admin shell. Available only in development (`NODE_ENV !== "production"`).
 * Production builds 404 every /admin route so the admin UI never ships
 * with the deployed game.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
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
