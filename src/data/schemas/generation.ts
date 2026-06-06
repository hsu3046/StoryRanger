import { z } from "zod";

/**
 * Schemas for the AI story-generation wizard. Two kinds live here:
 *
 *  1. LLM OUTPUT schemas (Concept / Storyboard / GeneratedCharacters) — fed to
 *     `chat({ schema })`, which converts them to a Gemini `responseJsonSchema`.
 *     These are kept deliberately FLAT and ALL-REQUIRED (no `.optional()` /
 *     `.default()`, arrays instead of records) so structured output stays
 *     robust across providers. "Absent" is represented by an empty string /
 *     empty array, not a missing key.
 *
 *  2. PERSISTED DRAFT schemas (DraftMeta) — written to the draft story dir to
 *     drive wizard resume. These are server-authored, so `.optional()` /
 *     `.default()` are fine.
 *
 * The FINAL artifacts (scenes.json / characters.json) use the existing
 * StorySchema / CharactersFileSchema — these generation schemas are the
 * intermediate scaffolding the wizard maps into those.
 */

// ── Art-style templates (gallery catalog) ────────────────────────

/** One pickable art-style template. The gallery is authored in
 *  src/data/global/art-styles.json; selecting a card stores its `prompt` on the
 *  concept (artStylePrompt) and that text is injected verbatim into every image
 *  prompt. `image` is a root-relative sample thumbnail (selection UI only —
 *  never attached to generation). */
export const ArtStyleTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Root-relative sample image path, e.g. "/image/style/Soft watercolor.jpeg". */
  image: z.string(),
  /** The style description injected (verbatim) into every illustration prompt. */
  prompt: z.string(),
});
export const ArtStylesFileSchema = z.object({
  styles: z.array(ArtStyleTemplateSchema),
});

// ── Stage 1: Concept ─────────────────────────────────────────────

export const ConceptSchema = z.object({
  title: z.string(),
  /** Tagline. "" when none. */
  subtitle: z.string(),
  /** 1-2 sentences — the SETUP/hook: who the hero is and the situation or
   *  problem that starts the story. WHAT happens, not the message or the mood. */
  premise: z.string(),
  /** The heart of the book — one warm sentence on what a child should learn or
   *  feel by the end (e.g. "asking for help is brave too"). The ending lands
   *  this. `.default("")` for back-compat with concepts authored before this. */
  lesson: z.string().default(""),
  /** A few mood words for how the book FEELS (e.g. "cozy, gentle, a little
   *  mysterious"). Steers narration voice + cast. `.default("")` back-compat. */
  tone: z.string().default(""),
  /** Target age band (years). */
  targetAge: z.object({ min: z.number().int(), max: z.number().int() }),
  /** 2-5 themes. */
  themes: z.array(z.string()),
  /** Language name or code the story is written in (echoed from the brief). */
  language: z.string(),
  estimatedMinutes: z.number().int(),
  /** Chosen art-style template id (gallery selection); "" until the author
   *  picks one. NOT produced by the LLM — set client-side from the gallery. */
  artStyleId: z.string().default(""),
  /** The selected template's style prompt, stored inline so the draft keeps its
   *  look even if the template catalog later changes; "" until picked. Injected
   *  verbatim into every image prompt (see lib/image-prompts.ts). */
  artStylePrompt: z.string().default(""),
});

// ── Stage 2: Storyboard ──────────────────────────────────────────

export const StoryboardBranchSchema = z.object({
  /** Stable slug, unique within the beat. */
  id: z.string(),
  /** Player-facing choice label. */
  label: z.string(),
  /** Target beat id (must reference an existing beat). */
  next: z.string(),
  /** Optional 1-line bridge hint shown after the choice ("" when none). */
  outcomeHint: z.string(),
});

export const StoryboardBeatSchema = z.object({
  /** Stable slug — the beat the scene-pages expand from. */
  id: z.string(),
  /** Editor-only label (not shipped to the player). */
  title: z.string(),
  /** 1-2 lines — what happens in this beat (the story flow). The page stage
   *  decides per-page speaker/setting from this + the cast + premise. */
  synopsis: z.string(),
  /** How pivotal this beat is, 1–5 (5 = climax). The scene stage gives higher-
   *  importance beats MORE pages so the key moments breathe. `.default(3)` for
   *  back-compat with storyboards authored before this field. */
  importance: z.number().int().min(1).max(5).default(3),
  /** Terminal beat (the last beat — an ending). */
  isEnding: z.boolean(),
  /** Ending tag label when isEnding ("" otherwise). */
  endingLabel: z.string(),
  /** Always empty — the linear storyboard carries no choices (branching is
   *  authored later in the story graph). Kept for back-compat. */
  branches: z.array(StoryboardBranchSchema),
});

export const StoryboardSchema = z.object({
  /** Beat id the story starts on. */
  startSceneId: z.string(),
  beats: z.array(StoryboardBeatSchema),
});

// ── Stage 3: Characters (LLM output) ─────────────────────────────

/** Role hint guides how the wizard maps a generated character into the real
 *  CharacterSchema (hero → isHero + no persona; narrator → no persona;
 *  companion/npc → persona). Companions are NOT auto-generated by v1 (battles
 *  are added later in the graph), so "companion" is reserved for future use. */
export const GeneratedRoleSchema = z.enum([
  "hero",
  "narrator",
  "npc",
  "companion",
]);

export const GeneratedCharacterSchema = z.object({
  /** Slug id (referenced by scenes). Lowercase kebab-case. */
  id: z.string(),
  /** Display name. */
  name: z.string(),
  role: GeneratedRoleSchema,
  /** Who they are — 1-3 sentences (→ persona.shortBio for npc/companion). */
  bio: z.string(),
  /** How they talk (→ persona.speechStyle). "" for hero/narrator. */
  speechStyle: z.string(),
  /** One-line vocal feel (→ persona.voiceTraits). "" for hero/narrator. */
  voiceTraits: z.string(),
  /** Voice-casting hints (set for EVERY character) — matched against the
   *  voices.json tag vocabulary to auto-pick a catalog voice. Fixed English
   *  tag tokens, never translated. The author can still change the pick. */
  voiceGender: z.enum(["male", "female", "neutral"]),
  voiceAge: z.enum(["young", "adult", "elder"]),
  voiceTone: z.enum(["warm", "bright", "calm", "dark"]),
  /** Optional special-voice feature ("" or e.g. "evil"/"funny"/"robot"/
   *  "fairy"/"monster") — matched as a bonus against feature tags. */
  voiceFeature: z.string(),
  /** Positive behavioural guidelines (→ persona.dos). */
  dos: z.array(z.string()),
  /** Hard boundaries (→ persona.donts). */
  donts: z.array(z.string()),
  /** One-line illustrator brief — face, hair, outfit, palette, proportions.
   *  Stored in characterArt and fed to the image stage. */
  visualDescription: z.string(),
});

export const GeneratedCharactersSchema = z.object({
  characters: z.array(GeneratedCharacterSchema),
});

// ── Persisted: character art map (visual descriptions) ───────────

export const CharacterArtEntrySchema = z.object({
  id: z.string(),
  visualDescription: z.string(),
});
export const CharacterArtFileSchema = z.object({
  entries: z.array(CharacterArtEntrySchema),
});

// ── Persisted (draft-only): per-scene context for the image stage ─
// Scenes are no longer 1:1 with storyboard beats (the scene stage paginates a
// beat into several pages), so the scene-image prompt can't look a beat up by
// the scene id. The page-expansion records each scene's setting/synopsis and
// its parent beat here so the image prompt has visual context.

export const DraftSceneMetaEntrySchema = z.object({
  setting: z.string(),
  synopsis: z.string(),
  parentBeatId: z.string(),
});
export const DraftSceneMetaSchema = z.object({
  scenes: z.record(z.string(), DraftSceneMetaEntrySchema).default({}),
});

// ── Persisted: draft control state (wizard resume) ───────────────

// Active wizard stages. Legacy drafts may carry "scenes"/"narration"/"images"
// in currentStage — readDraftMeta() normalizes those before parse.
export const DraftStageSchema = z.enum([
  "concept",
  "storyboard",
  "characters",
  "scene",
  "review",
]);

export const StageStatusSchema = z.enum(["pending", "done", "stale"]);

const ItemProgressSchema = z
  .object({
    done: z.array(z.string()).default([]),
    failed: z.array(z.string()).default([]),
  })
  .default({ done: [], failed: [] });

export const DraftMetaSchema = z.object({
  storyId: z.string(),
  status: z.enum(["drafting", "ready", "committed"]).default("drafting"),
  currentStage: DraftStageSchema.default("concept"),
  /** Per-stage status keyed by stage name. */
  stageStatuses: z.record(z.string(), StageStatusSchema).default({}),
  /** The original author brief (for regenerate steering + resume display). */
  brief: z.string().default(""),
  language: z.string().default("en"),
  /** ISO timestamps — stamped by the server actions. */
  createdAt: z.string().default(""),
  updatedAt: z.string().default(""),
  /** Fan-out progress for the per-item stages (resume / partial completion). */
  itemProgress: z
    .object({
      narration: ItemProgressSchema,
      images: ItemProgressSchema,
    })
    .default({
      narration: { done: [], failed: [] },
      images: { done: [], failed: [] },
    }),
});

// ── Inferred types ───────────────────────────────────────────────

export type ArtStyleTemplateT = z.infer<typeof ArtStyleTemplateSchema>;
export type ConceptT = z.infer<typeof ConceptSchema>;
export type StoryboardBranchT = z.infer<typeof StoryboardBranchSchema>;
export type StoryboardBeatT = z.infer<typeof StoryboardBeatSchema>;
export type StoryboardT = z.infer<typeof StoryboardSchema>;
export type GeneratedRoleT = z.infer<typeof GeneratedRoleSchema>;
export type GeneratedCharacterT = z.infer<typeof GeneratedCharacterSchema>;
export type GeneratedCharactersT = z.infer<typeof GeneratedCharactersSchema>;
export type CharacterArtEntryT = z.infer<typeof CharacterArtEntrySchema>;
export type CharacterArtFileT = z.infer<typeof CharacterArtFileSchema>;
export type DraftSceneMetaEntryT = z.infer<typeof DraftSceneMetaEntrySchema>;
export type DraftSceneMetaT = z.infer<typeof DraftSceneMetaSchema>;
export type DraftStageT = z.infer<typeof DraftStageSchema>;
export type StageStatusT = z.infer<typeof StageStatusSchema>;
export type DraftMetaT = z.infer<typeof DraftMetaSchema>;
