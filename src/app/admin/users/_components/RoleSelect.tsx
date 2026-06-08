"use client";

import { useState, useTransition } from "react";

import { setUserRole } from "@/app/admin/_actions/setUserRole";
import { ROLES, type Role } from "@/lib/supabase/types";

/** Segmented player/creator/admin control (no native <select> — Tailwind v4).
 *  Calls the admin server action; self-row is locked to avoid self-demotion. */
export function RoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: Role;
  disabled?: boolean;
}) {
  const [current, setCurrent] = useState<Role>(role);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(next: Role) {
    if (next === current || disabled || pending) return;
    const prev = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      const res = await setUserRole(userId, next);
      if (!res.ok) {
        setCurrent(prev);
        setError(res.error ?? "failed");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex rounded-pill bg-paper-deep/50 p-0.5">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => pick(r)}
            disabled={disabled || pending}
            className={`rounded-pill px-2.5 py-1 text-xs font-semibold capitalize transition-colors disabled:cursor-not-allowed ${
              current === r
                ? "bg-accent-deep text-paper"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      {error && <span className="text-[10px] text-ruby">{error}</span>}
    </div>
  );
}
