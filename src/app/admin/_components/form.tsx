/**
 * Shared admin form primitives. Previously every editor re-declared a
 * byte-identical `Field` + `inputCls`; this is the single source so a
 * styling tweak lands everywhere at once.
 */

/** Standard text-input / select / textarea class. */
export const inputCls =
  "w-full rounded-button bg-paper-deep/40 px-3 py-1.5 text-sm text-ink ring-1 ring-ink-soft/10 focus:outline-none focus:ring-accent/50";

/** Compact variant (smaller padding/font) — used by dense inline editors. */
export const inputClsSm =
  "w-full rounded-button bg-paper-deep/40 px-2 py-1 text-xs text-ink ring-1 ring-ink-soft/10 focus:outline-none focus:ring-accent/50";

/** Labelled form row. Optional `hint` renders a smaller, normal-case
 *  sub-line under the uppercase label. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-ink-soft">
        <span>{label}</span>
        {hint && (
          <span className="text-[10px] font-normal normal-case text-ink-soft/70">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
