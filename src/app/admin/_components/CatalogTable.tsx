/**
 * Generic read-only catalog table. Renders an array of records with
 * configurable columns. CRUD comes in Phase 2.
 */

export interface CatalogColumn<T> {
  key: string;
  header: string;
  /** Field selector — must return a renderable React node. */
  render: (row: T) => React.ReactNode;
  /** Optional cell width hint (e.g. "w-24"). */
  width?: string;
}

interface Props<T> {
  rows: T[];
  columns: CatalogColumn<T>[];
  rowKey: (row: T) => string;
  empty?: string;
}

export function CatalogTable<T>({
  rows,
  columns,
  rowKey,
  empty = "No rows.",
}: Props<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card-lg bg-paper p-8 text-center text-ink-soft ring-1 ring-ink-soft/10">
        {empty}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card-lg bg-paper ring-1 ring-ink-soft/10">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-ink-soft/10 bg-paper-deep/20 text-left">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2 font-semibold text-ink ${c.width ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-ink-soft/5 last:border-0 hover:bg-paper-deep/15"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-2 align-middle text-ink-soft ${c.width ?? ""}`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
