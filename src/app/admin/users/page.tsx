import { notFound } from "next/navigation";

import { getProfile } from "@/lib/supabase/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/supabase/tables";
import type { Role } from "@/lib/supabase/types";
import { RoleSelect } from "./_components/RoleSelect";

// Always fresh — role changes must reflect immediately.
export const dynamic = "force-dynamic";

/**
 * Admin-only user management: list accounts and set roles. `creator` is gated
 * out (the layout admits admin+creator; this page narrows to admin). Reads via
 * the service-role client (auth.admin.listUsers + profiles).
 */
export default async function UsersPage() {
  const me = await getProfile().catch(() => null);
  if (me?.role !== "admin") notFound();

  const admin = createAdminClient();
  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const users = list?.users ?? [];

  const { data: profiles } = await admin
    .from(TABLES.profiles)
    .select("id, role, display_name");
  const roleById = new Map<string, Role>(
    (profiles ?? []).map((p: { id: string; role: Role }) => [p.id, p.role]),
  );
  const nameById = new Map<string, string | null>(
    (profiles ?? []).map((p: { id: string; display_name: string | null }) => [
      p.id,
      p.display_name,
    ]),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-1 font-handwritten text-3xl text-accent-deep">Users</h1>
      <p className="mb-5 text-sm text-ink-soft">
        {users.length} account{users.length === 1 ? "" : "s"} · set who can
        create stories (creator) or manage everything (admin).
      </p>

      <ul className="flex flex-col divide-y divide-ink-soft/10 rounded-card-lg bg-paper ring-1 ring-ink-soft/10">
        {users.map((u) => {
          const role = roleById.get(u.id) ?? "player";
          const name = nameById.get(u.id);
          const isSelf = u.id === me.id;
          return (
            <li
              key={u.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {name || u.email || u.id}
                </p>
                <p className="truncate text-xs text-ink-soft">
                  {u.email}
                  {isSelf && " · you"}
                </p>
              </div>
              <RoleSelect userId={u.id} role={role} disabled={isSelf} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
