/**
 * Supabase table names. This project shares its Supabase instance with other
 * apps, so every StoryRanger table is namespaced with a `storyranger_` prefix.
 * Reference these constants everywhere instead of hard-coding the string, so a
 * rename never drifts between code and migrations.
 */
export const TABLES = {
  profiles: "storyranger_profiles",
  playStates: "storyranger_play_states",
} as const;
