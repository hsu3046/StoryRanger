import type { Hero } from "@/types/story";

/** The three access tiers. New signups default to `player`; `creator` and
 *  `admin` are granted manually by an admin via the user-management UI. */
export type Role = "player" | "creator" | "admin";

export const ROLES: Role[] = ["player", "creator", "admin"];

/** A row of `storyranger_profiles`. */
export interface Profile {
  id: string;
  display_name: string | null;
  role: Role;
  hero: Hero | null;
  achievements: string[];
  created_at: string;
  updated_at: string;
}
