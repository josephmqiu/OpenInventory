import type { ReactNode } from "react";

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

export interface ColumnDef<TRow> {
  /** Unique column identifier */
  key: string;
  /** Content rendered inside <th> */
  header: ReactNode;
  /** CSS width for <col> (e.g. "20%") */
  width?: string;
  /** CSS class applied to every <td> in this column */
  className?: string;
  /** CSS class applied to the <th> */
  headerClassName?: string;
  /** Custom cell renderer. If omitted, the cell is left empty (use for simple columns where header-only is enough). */
  render?: (row: TRow) => ReactNode;
  /** Whether this column supports sorting */
  sortable?: boolean;
  /** Data field key used for sorting. Required when sortable is true. */
  sortKey?: string;
}

export interface DataTableProps<TRow> {
  columns: ColumnDef<TRow>[];
  data: TRow[];
  /** Function to extract a unique React key from each row */
  rowKey: (row: TRow) => string;
  /** Message shown when data is empty */
  emptyTitle?: string;
  /** Hint text below the empty title */
  emptyHint?: string;
  /** Show loading state instead of table */
  loading?: boolean;
  /** Loading message */
  loadingMessage?: string;
  /** Called when a row is clicked */
  onRowClick?: (row: TRow) => void;
  /** Dynamic className for each <tr> */
  rowClassName?: (row: TRow) => string;
  /** Additional className on <table> */
  className?: string;
  /** data-testid passed through to <table> */
  testId?: string;
  /** Checkbox selection support */
  selection?: {
    selectedIds: string[];
    onToggle: (id: string) => void;
    onToggleAll: () => void;
    getId: (row: TRow) => string;
    allSelected: boolean;
  };
  /** Current sort state (controlled) */
  sortState?: SortState | null;
  /** Called when a sortable column header is clicked with the new sort state */
  onSortChange?: (newState: SortState | null) => void;
}

function nextSortState(current: SortState | null | undefined, sortKey: string): SortState | null {
  if (!current || current.key !== sortKey) return { key: sortKey, dir: "asc" };
  if (current.dir === "asc") return { key: sortKey, dir: "desc" };
  return null;
}

function sortAriaSort(sortState: SortState | null | undefined, sortKey: string): "ascending" | "descending" | "none" {
  if (!sortState || sortState.key !== sortKey) return "none";
  return sortState.dir === "asc" ? "ascending" : "descending";
}

function SortIndicator({ sortState, sortKey }: { sortState: SortState | null | undefined; sortKey: string }) {
  if (!sortState || sortState.key !== sortKey) return <span className="sort-indicator" aria-hidden="true">⇅</span>;
  return <span className="sort-indicator sort-indicator--active" aria-hidden="true">{sortState.dir === "asc" ? "▲" : "▼"}</span>;
}

export function DataTable<TRow>({
  columns,
  data,
  rowKey,
  emptyTitle,
  emptyHint,
  loading,
  loadingMessage,
  onRowClick,
  rowClassName,
  className,
  testId,
  selection,
  sortState,
  onSortChange,
}: DataTableProps<TRow>) {
  if (loading) {
    return (
      <div className="empty-state">
        <h3>{loadingMessage || "Loading..."}</h3>
      </div>
    );
  }

  if (data.length === 0 && emptyTitle) {
    return (
      <div className="empty-state">
        <h3>{emptyTitle}</h3>
        {emptyHint && <p>{emptyHint}</p>}
      </div>
    );
  }

  const hasWidths = columns.some((c) => c.width) || !!selection;

  return (
    <div className="table-wrap">
      <table className={className} data-testid={testId}>
        {hasWidths && (
          <colgroup>
            {selection && <col style={{ width: "4%" }} />}
            {columns.map((col) => (
              <col key={col.key} style={col.width ? { width: col.width } : undefined} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>
            {selection && (
              <th className="col-checkbox">
                <label className="checkbox-cell">
                  <input
                    checked={selection.allSelected}
                    onChange={selection.onToggleAll}
                    type="checkbox"
                  />
                </label>
              </th>
            )}
            {columns.map((col) => {
              const sk = col.sortKey ?? col.key;
              if (col.sortable && onSortChange) {
                return (
                  <th
                    key={col.key}
                    className={`th-sortable${col.headerClassName ? ` ${col.headerClassName}` : ""}`}
                    aria-sort={sortAriaSort(sortState, sk)}
                  >
                    <button
                      type="button"
                      className="th-sortable__button"
                      onClick={() => onSortChange(nextSortState(sortState, sk))}
                    >
                      {col.header}
                      <SortIndicator sortState={sortState} sortKey={sk} />
                    </button>
                  </th>
                );
              }
              return (
                <th key={col.key} className={col.headerClassName}>
                  {col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                className={[
                  onRowClick ? "row-clickable" : "",
                  rowClassName?.(row) || "",
                ].filter(Boolean).join(" ") || undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {selection && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      checked={selection.selectedIds.includes(selection.getId(row))}
                      onChange={() => selection.onToggle(selection.getId(row))}
                      type="checkbox"
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className={col.className}>
                    {col.render ? col.render(row) : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
