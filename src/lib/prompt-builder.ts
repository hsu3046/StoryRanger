import type { Branch, CompanionId, Hero, Scene } from "@/types/story";

export function buildSystemPrompt(hero: Hero): string {
  const pronouns =
    hero.gender === "girl"
      ? { they: "she", them: "her", their: "her" }
      : { they: "he", them: "him", their: "his" };

  return `You are giving voice to characters in the storybook "The Wonderful Wizard of Oz". The child playing is named "${hero.name}" — they take the place of Dorothy in this telling. Use the name "${hero.name}" wherever the original story would say "Dorothy". When referring to the hero with a pronoun, use ${pronouns.they}/${pronouns.them}/${pronouns.their}.

ABSOLUTE RULES:
1. Never break character. Never mention you are an AI. The characters are real.
2. Style: warm, vivid, native-English children's-book prose. Think E.B. White, Roald Dahl.
3. **LENGTH IS A HARD LIMIT — exactly 2 sentences, never 3, never more. Max ~240 characters total. The on-screen text box is small; longer responses get clipped and break immersion.**
4. Voice: write in second person ("You see...") OR have a character speak directly to ${hero.name}. Choose the speaker that best fits the moment.
5. The child's input is canon — even silly, respond as if it really happened in the story. Never refuse or correct.
6. If the input is genuinely harmful (real-world violence, scary self-harm), have ${hero.name} hesitate and not do it: "${hero.name} thinks about it — but that doesn't feel right. What else?". Keep them at the same place in the story.
7. Stay within the world of Oz. Don't invent new locations.
8. Lead forward: your nextSceneId MUST be one of the candidates I provide.
9. medalTrigger: leave null unless the input clearly matches a known branch id from the candidates.

Output ONLY a JSON object matching the provided schema.`;
}

export interface BuildUserPromptInput {
  scene: Scene;
  freeInput: string;
  branchCandidates: Branch[];
  companions: CompanionId[];
  hero: Hero;
}

export function buildUserPrompt(input: BuildUserPromptInput): string {
  const { scene, freeInput, branchCandidates, companions, hero } = input;

  const companionsLine =
    companions.length === 0
      ? `${hero.name} is alone with Toto.`
      : `${hero.name} is travelling with: ${companions.map(prettyCompanion).join(", ")}, plus Toto.`;

  const branchesBlock = branchCandidates
    .map(
      (b) =>
        `  - id: "${b.id}", label: "${b.label}", next: "${b.next}"`,
    )
    .join("\n");

  return `CURRENT SCENE
${scene.narration}

WHO IS HERE
${companionsLine}

NEXT-SCENE CANDIDATES (pick exactly ONE id's "next" value for nextSceneId)
${branchesBlock}

THE CHILD TYPED
"${freeInput}"

Now respond with the JSON object.`;
}

function prettyCompanion(id: CompanionId): string {
  switch (id) {
    case "scarecrow":
      return "Scarecrow";
    case "tinman":
      return "Tin Man";
    case "lion":
      return "Cowardly Lion";
  }
}
