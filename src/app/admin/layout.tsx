import { notFound } from "next/navigation";

import { contentRepo } from "@/lib/content-repo";
import { AdminSidebar } from "./_components/AdminSidebar";

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

  const stories = contentRepo()
    .listStoryIds()
    .map((id) => ({ id }));

  return (
    <div className="flex h-dvh w-dvw overflow-hidden bg-paper-deep/30 text-ink">
      <AdminSidebar stories={stories} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
