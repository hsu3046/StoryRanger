/**
 * Shared admin form primitives. Previously every editor re-declared a
 * byte-identical `Field` + `inputCls`; this is the single source so a
 * styling tweak lands everywhere at once.
 */

import { CaretDown } from "@phosphor-icons/react";

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

/**
 * Native `<select>` dressed in the app's input style: the browser caret is
 * hidden (`appearance-none`) and a `CaretDown` is drawn at the right edge.
 * Pass the `<option>`s as children. `className` lands on the wrapper (for
 * width constraints like `max-w-[10rem]` / `flex-1`).
 *
 * Note: the BGM picker is deliberately NOT this — it's a custom popover
 * (BgmSelectWithPreview) because a native <select> can't host per-row
 * preview buttons.
 */
export function StyledSelect({
  value,
  onChange,
  className = "",
  disabled = false,
  compact = false,
  children,
}: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  className?: string;
  disabled?: boolean;
  /** Use the smaller `inputClsSm` style (dense inline editors). */
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative ${className}`.trim()}>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`${compact ? inputClsSm : inputCls} appearance-none pr-9${disabled ? " opacity-60" : ""}`}
      >
        {children}
      </select>
      <CaretDown
        size={14}
        weight="bold"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft"
      />
    </div>
  );
}
