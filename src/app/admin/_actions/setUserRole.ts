"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getProfile } from "@/lib/supabase/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/supabase/tables";
import type { Role } from "@/lib/supabase/types";

const schema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["player", "creator", "admin"]),
});

/**
 * Promote/demote a user's role. Admin-only. Mutates via the service-role admin
 * client because (a) RLS scopes the cookie client to its own row and (b) the
 * `storyranger_prevent_role_change` trigger blocks authenticated callers from
 * changing `role` at all.
 */
export async function setUserRole(
  userId: string,
  role: Role,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse({ userId, role });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  // Authorize: the CALLER must be an admin (re-checked server-side — never
  // trust the client).
  const me = await getProfile().catch(() => null);
  if (me?.role !== "admin") return { ok: false, error: "forbidden" };

  const admin = createAdminClient();
  const { error } = await admin
    .from(TABLES.profiles)
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}
