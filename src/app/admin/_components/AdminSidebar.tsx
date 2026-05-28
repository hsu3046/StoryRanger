"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretDown,
  CaretRight,
  Ghost,
  Image as ImageIcon,
  Medal,
  Package,
  PuzzlePiece,
  SquaresFour,
  Sword,
  TreeStructure,
  UsersFour,
  type Icon,
} from "@phosphor-icons/react";

interface StoryRow {
  id: string;
}

interface Props {
  stories: StoryRow[];
}

const STORAGE_KEY = "storyranger:admin:sidebar-collapsed";
const SECTIONS_KEY = "storyranger:admin:sidebar-open-sections";

interface MenuEntry {
  label: string;
  href: string;
  icon: Icon;
}

function storyMenu(storyId: string): MenuEntry[] {
  return [
    { label: "Story graph", href: `/admin/stories/${storyId}/graph`, icon: TreeStructure },
    { label: "Characters", href: `/admin/stories/${storyId}/characters`, icon: UsersFour },
    { label: "Monsters", href: `/admin/stories/${storyId}/monsters`, icon: Ghost },
    { label: "Backgrounds", href: `/admin/stories/${storyId}/backgrounds`, icon: ImageIcon },
    { label: "Encounters", href: `/admin/stories/${storyId}/encounters`, icon: Sword },
    { label: "Puzzle routing", href: `/admin/stories/${storyId}/puzzles`, icon: PuzzlePiece },
    { label: "Medals", href: `/admin/stories/${storyId}/medals`, icon: Medal },
    { label: "Items", href: `/admin/stories/${storyId}/items`, icon: Package },
  ];
}

export function AdminSidebar({ stories }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Per-section open/closed state, keyed by section title. Story titles
  // default to OPEN on first ever visit; Global is always open.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => {
      const init: Record<string, boolean> = {};
      for (const s of stories) init[s.id] = true;
      return init;
    },
  );

  // One-shot hydration from localStorage so the user's preferences persist.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot localStorage hydration
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    try {
      const raw = window.localStorage.getItem(SECTIONS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, boolean>;
        setOpenSections((prev) => ({ ...prev, ...saved }));
      }
    } catch {
      /* malformed — keep defaults */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(SECTIONS_KEY, JSON.stringify(openSections));
  }, [openSections, hydrated]);

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (collapsed) {
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
          className="flex items-center gap-2 font-handwritten text-2xl text-accent-deep"
        >
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={28}
            height={28}
            className="rounded-button"
            priority
          />
          <span>Story Ranger</span>
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

      {/* Global section is always expanded — no toggle. */}
      <div className="mb-3 flex flex-col gap-0.5">
        <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft/60">
          Global
        </p>
        <SidebarLink href="/admin" label="Dashboard" icon={SquaresFour} />
      </div>

      {stories.map((s) => {
        const isOpen = openSections[s.id] ?? true;
        return (
          <div key={s.id} className="mb-3 flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => toggleSection(s.id)}
              aria-expanded={isOpen}
              className="flex items-center gap-1 rounded-button px-2 pb-1 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft/60 transition-colors hover:text-ink-soft"
            >
              {isOpen ? (
                <CaretDown size={10} weight="bold" />
              ) : (
                <CaretRight size={10} weight="bold" />
              )}
              <span className="flex-1">{s.id}</span>
            </button>
            {isOpen &&
              storyMenu(s.id).map((entry) => (
                <SidebarLink
                  key={entry.href}
                  href={entry.href}
                  label={entry.label}
                  icon={entry.icon}
                />
              ))}
          </div>
        );
      })}
    </aside>
  );
}

function SidebarLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: Icon;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-button px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-paper-deep/60 hover:text-ink"
    >
      <Icon size={14} weight="duotone" />
      <span>{label}</span>
    </Link>
  );
}
