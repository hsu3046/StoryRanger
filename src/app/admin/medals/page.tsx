import { listMedals } from "@/data/medals";
import { MedalsEditor } from "@/app/admin/_components/MedalsEditor";

/**
 * Medals is a GLOBAL achievement catalog shared by every story. Each medal is
 * earned automatically from a play metric (friends made, battles cleared, …)
 * reaching its threshold — no per-story ids.
 */
export default function MedalsPage() {
  return <MedalsEditor initial={listMedals()} />;
}
