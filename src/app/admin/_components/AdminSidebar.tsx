"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CaretDoubleLeft, CaretDoubleRight } from "@phosphor-icons/react";

interface StoryRow {
  id: string;
}

interface Props {
  stories: StoryRow[];
}

const STORAGE_KEY = "storyranger:admin:sidebar-collapsed";

export function AdminSidebar({ stories }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // One-shot hydration from localStorage so the user's preference persists.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot localStorage hydration
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed, hydrated]);

  if (collapsed) {
    // Sidebar fully hidden — just a floating expand button.
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Expand sidebar"
        title="Expand sidebar"
        className="fixed left-3 top-16 z-40 flex h-9 w-9 items-center justify-center rounded-pill bg-paper text-ink-soft shadow-card ring-1 ring-ink-soft/15 backdrop-blur transition-colors hover:bg-paper-deep/40 hover:text-ink"
      >
        <CaretDoubleRight size={16} weight="bold" />
      </button>
    );
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-ink-soft/10 bg-paper px-3 py-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <Link
          href="/admin"
          className="block font-handwritten text-2xl text-accent-deep"
        >
          Story Ranger
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          className="mt-1 flex h-7 w-7 items-center justify-center rounded-button text-ink-soft transition-colors hover:bg-paper-deep/60 hover:text-ink"
        >
          <CaretDoubleLeft size={14} weight="bold" />
        </button>
      </div>

      <SidebarSection title="Global">
        <SidebarLink href="/admin">Dashboard</SidebarLink>
      </SidebarSection>

      {stories.map((s) => (
        <SidebarSection key={s.id} title={s.id}>
          <SidebarLink href={`/admin/stories/${s.id}/graph`}>
            Story graph
          </SidebarLink>
          <SidebarLink href={`/admin/stories/${s.id}/characters`}>
            Characters
          </SidebarLink>
          <SidebarLink href={`/admin/stories/${s.id}/monsters`}>
            Monsters
          </SidebarLink>
          <SidebarLink href={`/admin/stories/${s.id}/backgrounds`}>
            Backgrounds
          </SidebarLink>
          <SidebarLink href={`/admin/stories/${s.id}/encounters`}>
            Encounters
          </SidebarLink>
          <SidebarLink href={`/admin/stories/${s.id}/puzzles`}>
            Puzzle routing
          </SidebarLink>
          <SidebarLink href={`/admin/stories/${s.id}/medals`}>
            Medals
          </SidebarLink>
          <SidebarLink href={`/admin/stories/${s.id}/items`}>Items</SidebarLink>
        </SidebarSection>
      ))}

    </aside>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-col gap-0.5">
      <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft/60">
        {title}
      </p>
      {children}
    </div>
  );
}

function SidebarLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-button px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-paper-deep/60 hover:text-ink"
    >
      {children}
    </Link>
  );
}
