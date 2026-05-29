/**
 * Minimal thin top bar shared by every admin catalog page. Matches the
 * Story Graph top bar styling so the whole admin UI feels consistent.
 *
 * Usage:
 *   <div className="flex h-[calc(100dvh-1px)] flex-col">
 *     <AdminPageHeader storyId="…" title="…" count={N} actions={…} />
 *     <div className="flex-1 overflow-y-auto px-4 py-3">
 *       {content}
 *     </div>
 *   </div>
 */
export function AdminPageHeader({
  storyId,
  storyTitle,
  title,
  subtitle,
  count,
  filePath,
  actions,
}: {
  storyId: string;
  /** Human-readable story name (story.title). Falls back to id when
   *  omitted so older callers keep working. */
  storyTitle?: string;
  title: string;
  subtitle?: string;
  count?: number;
  filePath?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-soft/10 bg-paper px-4 py-2">
      <div className="flex items-center gap-2">
        <p
          className="font-handwritten text-base text-accent-deep"
          title={storyId}
        >
          {storyTitle ?? storyId} / {title}
        </p>
        {typeof count === "number" && (
          <span className="rounded-pill bg-paper-deep/40 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
            {count}
          </span>
        )}
        {filePath && (
          <code className="rounded-pill bg-paper-deep/30 px-2 py-0.5 font-mono text-[10px] text-ink-soft/70">
            {filePath}
          </code>
        )}
        {subtitle && (
          <span className="text-xs text-ink-soft/70">{subtitle}</span>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
