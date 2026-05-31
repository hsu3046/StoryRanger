import type { ItemDefT } from "@/data/schemas";

/**
 * Multi-select item picker rendered as toggle chips. Shared by the
 * Monsters editor (drops) and the Characters editor (giftable items) so
 * both stay visually and behaviourally identical.
 */
export function ItemChipPicker({
  catalog,
  selected,
  onToggle,
}: {
  catalog: ItemDefT[];
  /** Currently-selected item ids. */
  selected: string[];
  /** Called with the toggled item id; caller updates its own state. */
  onToggle: (id: string) => void;
}) {
  const sel = new Set(selected);
  return (
    <div className="flex flex-wrap gap-1">
      {catalog.map((it) => {
        const on = sel.has(it.id);
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onToggle(it.id)}
            className={`rounded-pill px-1.5 py-0.5 text-[10px] transition-colors ${
              on
                ? "bg-accent-deep text-paper"
                : "bg-paper-deep/60 text-ink-soft hover:bg-paper-deep"
            }`}
          >
            {it.icon ?? "🎁"} {it.name}
          </button>
        );
      })}
    </div>
  );
}
