import { ChallengePreviewer } from "@/app/admin/_components/ChallengePreviewer";

/**
 * Challenges is a PREVIEW screen — the educational-challenge generator is fully
 * automatic (age-driven, no per-kind config), so there's nothing to edit. This
 * page renders live samples across ages + categories so authors can judge the
 * quality of what players will see, and an in-game preview of the real UI.
 */
export default function ChallengesPage() {
  return <ChallengePreviewer />;
}
