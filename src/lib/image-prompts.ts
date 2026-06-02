/**
 * Prompt builders for the image stage. Pure (no I/O). Every prompt is anchored
 * by the concept's art-style bible so the whole book reads as one illustrator's
 * hand; character/scene prompts add the reference-image instruction when
 * conditioning images are attached.
 */

import type { ConceptT } from "@/data/schemas";

type ArtBible = ConceptT["artStyleBible"];

export function styleBibleText(b: ArtBible): string {
  return [
    `ART STYLE (obey exactly): medium — ${b.medium}; palette — ${b.palette}; line quality — ${b.lineQuality}; mood — ${b.mood}.`,
    b.motifs.length ? `Recurring motifs: ${b.motifs.join(", ")}.` : "",
    `NEVER include: ${[...b.negative, "any text or words in the image", "watermarks", "signatures", "frames or borders"].join(", ")}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

const REFERENCE_INSTRUCTION =
  "Use the attached image(s) as character reference. Each referenced character must look EXACTLY like their attached portrait — same face, hair, outfit, colours, and proportions. Treat the attachments as the canonical character design.";

export function coverPrompt(concept: ConceptT): string {
  return [
    `Children's picture-book COVER illustration, full-bleed, cinematic, 16:9.`,
    styleBibleText(concept.artStyleBible),
    `TITLE FEELING: "${concept.title}". ${concept.premise}`,
    `An inviting, atmospheric key image that captures the story's heart. Leave gentle space (the title is added separately — do NOT draw any text).`,
  ].join(" ");
}

export function scenePrompt(args: {
  concept: ConceptT;
  setting: string;
  synopsis: string;
  narration: string;
  /** Short notes naming the characters present, e.g. "the hero; the Scarecrow". */
  characterNotes: string;
  hasReferences: boolean;
}): string {
  const parts = [
    `Children's picture-book PAGE illustration, full-bleed, 16:9.`,
    styleBibleText(args.concept.artStyleBible),
    `SETTING: ${args.setting}.`,
    `MOMENT: ${args.synopsis}`,
  ];
  if (args.narration.trim()) parts.push(`The page reads: "${args.narration.trim()}"`);
  if (args.characterNotes.trim())
    parts.push(`Characters present: ${args.characterNotes.trim()}.`);
  if (args.hasReferences) parts.push(REFERENCE_INSTRUCTION);
  parts.push(
    `Warm, gentle, age-appropriate. Compose with depth; keep faces clear. No text in the image.`,
  );
  return parts.join(" ");
}

const SPRITE_BG =
  "PURE WHITE (#FFFFFF) background, perfectly flat and clean, NO ground shadow, NO props, NO scenery — the character isolated on white so the background can be removed.";

export function characterSpritePrompt(args: {
  concept: ConceptT;
  name: string;
  visualDescription: string;
  hasReferences: boolean;
}): string {
  const parts = [
    `Full-body character sprite for a children's picture book — 3/4 front view, standing, friendly, centered, feet near the bottom of the frame, the WHOLE body inside the frame.`,
    SPRITE_BG,
    styleBibleText(args.concept.artStyleBible),
    `CHARACTER: ${args.name}. ${args.visualDescription}`,
  ];
  if (args.hasReferences) parts.push(REFERENCE_INSTRUCTION);
  parts.push(`No text, no border, no extra characters.`);
  return parts.join(" ");
}

export function characterPortraitPrompt(args: {
  concept: ConceptT;
  name: string;
  visualDescription: string;
  hasReferences: boolean;
}): string {
  const parts = [
    `Head-and-shoulders PORTRAIT of a children's picture-book character, facing forward, warm friendly expression, centered.`,
    SPRITE_BG,
    styleBibleText(args.concept.artStyleBible),
    `CHARACTER: ${args.name}. ${args.visualDescription}`,
  ];
  if (args.hasReferences) parts.push(REFERENCE_INSTRUCTION);
  parts.push(`No text, no border.`);
  return parts.join(" ");
}
